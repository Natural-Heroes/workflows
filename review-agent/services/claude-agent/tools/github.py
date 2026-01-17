"""GitHub interaction tools."""

from review_agent.shared import GitHubClient


# Tool definitions for Claude
POST_REVIEW_COMMENT_TOOL = {
    "name": "post_review_comment",
    "description": "Post an inline review comment on a specific line in the pull request. Use this to report bugs, issues, or suggestions.",
    "input_schema": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the file to comment on",
            },
            "line": {
                "type": "integer",
                "description": "Line number to comment on (in the new file version)",
            },
            "body": {
                "type": "string",
                "description": "The comment body in markdown. Include severity level (🔴 Critical, 🟠 Warning, 🟡 Suggestion) at the start.",
            },
            "side": {
                "type": "string",
                "enum": ["LEFT", "RIGHT"],
                "description": "Which side of the diff to comment on (LEFT=old, RIGHT=new). Default is RIGHT.",
                "default": "RIGHT",
            },
        },
        "required": ["file_path", "line", "body"],
    },
}


COMMIT_FIX_TOOL = {
    "name": "commit_fix",
    "description": "Commit a fix to the pull request branch. Use this to apply code fixes.",
    "input_schema": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the file to modify",
            },
            "new_content": {
                "type": "string",
                "description": "The complete new content of the file",
            },
            "commit_message": {
                "type": "string",
                "description": "Commit message describing the fix",
            },
        },
        "required": ["file_path", "new_content", "commit_message"],
    },
}


async def post_review_comment(
    owner: str,
    repo: str,
    pr_number: int,
    commit_sha: str,
    file_path: str,
    line: int,
    body: str,
    side: str = "RIGHT",
) -> dict:
    """
    Post an inline review comment on a PR.

    Args:
        owner: Repository owner
        repo: Repository name
        pr_number: Pull request number
        commit_sha: Commit SHA to comment on
        file_path: Path to the file
        line: Line number
        body: Comment body
        side: Which side of the diff (LEFT or RIGHT)

    Returns:
        Created comment data
    """
    github = GitHubClient()
    return await github.create_review_comment(
        owner=owner,
        repo=repo,
        pr_number=pr_number,
        body=body,
        commit_sha=commit_sha,
        path=file_path,
        line=line,
        side=side,
    )


async def commit_fix(
    owner: str,
    repo: str,
    branch: str,
    file_path: str,
    new_content: str,
    commit_message: str,
) -> dict:
    """
    Commit a fix to a branch.

    Args:
        owner: Repository owner
        repo: Repository name
        branch: Branch name
        file_path: Path to the file to modify
        new_content: New file content
        commit_message: Commit message

    Returns:
        Commit data
    """
    github = GitHubClient()
    return await github.create_or_update_file(
        owner=owner,
        repo=repo,
        path=file_path,
        content=new_content,
        message=commit_message,
        branch=branch,
    )
