"""Fix agent for applying code fixes."""

import logging
from pathlib import Path

import anthropic

from review_agent.shared import get_config, GitHubClient
from ..tools.codebase import (
    SEARCH_CODEBASE_TOOL,
    GET_FILE_CONTENT_TOOL,
    search_codebase,
    get_file_content,
)
from ..tools.github import COMMIT_FIX_TOOL, commit_fix

logger = logging.getLogger(__name__)

# Load system prompt
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
SYSTEM_PROMPT = (PROMPTS_DIR / "fix_system.md").read_text()


class FixAgent:
    """Agent for fixing code issues."""

    TOOLS = [
        SEARCH_CODEBASE_TOOL,
        GET_FILE_CONTENT_TOOL,
        COMMIT_FIX_TOOL,
    ]

    def __init__(self):
        self.config = get_config()
        self.client = anthropic.Anthropic(api_key=self.config.anthropic_api_key)
        self.github = GitHubClient()

    async def fix_code(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        comment_id: int,
        instructions: str | None = None,
    ) -> dict:
        """
        Fix code based on a review comment.

        Args:
            owner: Repository owner
            repo: Repository name
            pr_number: Pull request number
            comment_id: Review comment ID that triggered the fix
            instructions: Optional user instructions

        Returns:
            Fix summary
        """
        logger.info(f"Starting fix for {owner}/{repo}#{pr_number} comment {comment_id}")

        # Get the comment content
        comment_data = await self.github.get_review_comment(owner, repo, comment_id)
        comment_body = comment_data.get("body", "")
        file_path = comment_data.get("path", "")
        line = comment_data.get("line") or comment_data.get("original_line")
        diff_hunk = comment_data.get("diff_hunk", "")

        # Get PR data for branch info
        pr_data = await self.github.get_pull_request(owner, repo, pr_number)
        branch = pr_data.get("head", {}).get("ref")
        head_sha = pr_data.get("head", {}).get("sha")

        # Add reaction to show we're working on it
        await self.github.add_reaction(owner, repo, comment_id, "eyes")

        # Build the initial message
        user_message = f"""Please fix the issue identified in this code review comment.

## Review Comment
{comment_body}

## Location
- **File**: {file_path}
- **Line**: {line}

## Diff Context
```diff
{diff_hunk}
```

{f"## User Instructions{chr(10)}{instructions}" if instructions else ""}

Use the available tools to:
1. Search for relevant context in the codebase
2. Get the full file content
3. Apply the fix by committing the corrected code

Make the minimal change necessary to fix the issue while preserving all existing functionality."""

        # Run the agent loop
        messages = [{"role": "user", "content": user_message}]
        fix_committed = False
        max_iterations = 15

        for iteration in range(max_iterations):
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8192,
                system=SYSTEM_PROMPT,
                tools=self.TOOLS,
                messages=messages,
            )

            # Process the response
            assistant_content = []
            tool_results = []

            for block in response.content:
                if block.type == "text":
                    assistant_content.append(block)
                    logger.debug(f"Agent: {block.text[:200]}...")

                elif block.type == "tool_use":
                    assistant_content.append(block)
                    tool_result = await self._handle_tool_call(
                        block,
                        owner=owner,
                        repo=repo,
                        branch=branch,
                        head_sha=head_sha,
                    )
                    tool_results.append(tool_result)

                    if block.name == "commit_fix" and "error" not in str(tool_result):
                        fix_committed = True

            # Add assistant message
            messages.append({"role": "assistant", "content": assistant_content})

            # If there were tool calls, add results and continue
            if tool_results:
                messages.append({"role": "user", "content": tool_results})
            else:
                # No tool calls means agent is done
                break

            # Check stop reason
            if response.stop_reason == "end_turn":
                break

        # Post a reply to the original comment
        if fix_committed:
            await self.github.reply_to_review_comment(
                owner, repo, pr_number, comment_id,
                "✅ Fix has been committed to this PR."
            )
            await self.github.add_reaction(owner, repo, comment_id, "rocket")
        else:
            await self.github.reply_to_review_comment(
                owner, repo, pr_number, comment_id,
                "❌ Could not automatically fix this issue. Manual intervention required."
            )

        logger.info(
            f"Fix {'committed' if fix_committed else 'not committed'} for "
            f"{owner}/{repo}#{pr_number}"
        )

        return {
            "pr": f"{owner}/{repo}#{pr_number}",
            "comment_id": comment_id,
            "fix_committed": fix_committed,
            "iterations": iteration + 1,
        }

    async def _handle_tool_call(
        self,
        tool_use,
        owner: str,
        repo: str,
        branch: str,
        head_sha: str,
    ) -> dict:
        """Handle a tool call from the agent."""
        tool_name = tool_use.name
        tool_input = tool_use.input

        logger.debug(f"Tool call: {tool_name}({tool_input})")

        try:
            if tool_name == "search_codebase":
                result = await search_codebase(
                    owner=owner,
                    repo=repo,
                    query=tool_input["query"],
                    limit=tool_input.get("limit", 5),
                )

            elif tool_name == "get_file_content":
                result = await get_file_content(
                    owner=owner,
                    repo=repo,
                    file_path=tool_input["file_path"],
                    ref=head_sha,
                )

            elif tool_name == "commit_fix":
                result = await commit_fix(
                    owner=owner,
                    repo=repo,
                    branch=branch,
                    file_path=tool_input["file_path"],
                    new_content=tool_input["new_content"],
                    commit_message=tool_input["commit_message"],
                )

            else:
                result = {"error": f"Unknown tool: {tool_name}"}

            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": str(result),
            }

        except Exception as e:
            logger.error(f"Tool {tool_name} failed: {e}")
            return {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": f"Error: {str(e)}",
                "is_error": True,
            }
