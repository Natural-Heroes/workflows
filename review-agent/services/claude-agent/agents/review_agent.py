"""Review agent for analyzing pull requests."""

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
from ..tools.github import POST_REVIEW_COMMENT_TOOL, post_review_comment

logger = logging.getLogger(__name__)

# Load system prompt
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
SYSTEM_PROMPT = (PROMPTS_DIR / "review_system.md").read_text()


class ReviewAgent:
    """Agent for reviewing pull requests."""

    TOOLS = [
        SEARCH_CODEBASE_TOOL,
        GET_FILE_CONTENT_TOOL,
        POST_REVIEW_COMMENT_TOOL,
    ]

    def __init__(self):
        self.config = get_config()
        self.client = anthropic.Anthropic(api_key=self.config.anthropic_api_key)
        self.github = GitHubClient()

    async def review_pr(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        head_sha: str,
    ) -> dict:
        """
        Review a pull request and post comments.

        Args:
            owner: Repository owner
            repo: Repository name
            pr_number: Pull request number
            head_sha: Head commit SHA

        Returns:
            Review summary
        """
        logger.info(f"Starting review of {owner}/{repo}#{pr_number}")

        # Get PR diff
        diff = await self.github.get_pr_diff(owner, repo, pr_number)

        # Get PR metadata
        pr_data = await self.github.get_pull_request(owner, repo, pr_number)
        pr_title = pr_data.get("title", "")
        pr_body = pr_data.get("body", "") or ""

        # Build the initial message
        user_message = f"""Please review this pull request.

## PR Information
- **Title**: {pr_title}
- **Description**: {pr_body[:2000] if pr_body else "No description provided"}

## Diff
```diff
{diff[:50000]}
```

Review the changes and use the available tools to:
1. Search the codebase for relevant context (callers, types, tests)
2. Post inline comments for any issues you find

Focus on bugs, security issues, and breaking changes. Be thorough but don't report minor style issues."""

        # Run the agent loop
        messages = [{"role": "user", "content": user_message}]
        comments_posted = 0
        max_iterations = 20

        for iteration in range(max_iterations):
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
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
                        pr_number=pr_number,
                        head_sha=head_sha,
                    )
                    tool_results.append(tool_result)

                    if block.name == "post_review_comment":
                        comments_posted += 1

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

        logger.info(
            f"Review complete for {owner}/{repo}#{pr_number}: "
            f"{comments_posted} comments posted"
        )

        return {
            "pr": f"{owner}/{repo}#{pr_number}",
            "comments_posted": comments_posted,
            "iterations": iteration + 1,
        }

    async def _handle_tool_call(
        self,
        tool_use,
        owner: str,
        repo: str,
        pr_number: int,
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

            elif tool_name == "post_review_comment":
                result = await post_review_comment(
                    owner=owner,
                    repo=repo,
                    pr_number=pr_number,
                    commit_sha=head_sha,
                    file_path=tool_input["file_path"],
                    line=tool_input["line"],
                    body=tool_input["body"],
                    side=tool_input.get("side", "RIGHT"),
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
