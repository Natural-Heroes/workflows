"""GitHub client for API access using token authentication."""

import httpx

from .config import get_config


class GitHubClient:
    """GitHub API client using token authentication."""

    def __init__(self):
        self.config = get_config()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
    ) -> dict:
        """Make an authenticated request to the GitHub API."""
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"https://api.github.com{path}",
                headers={
                    "Authorization": f"Bearer {self.config.github_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                json=json,
                params=params,
            )
            response.raise_for_status()

            if response.status_code == 204:
                return {}
            return response.json()

    async def get_pull_request(self, owner: str, repo: str, pr_number: int) -> dict:
        """Get pull request details."""
        return await self._request("GET", f"/repos/{owner}/{repo}/pulls/{pr_number}")

    async def get_pr_diff(self, owner: str, repo: str, pr_number: int) -> str:
        """Get pull request diff."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
                headers={
                    "Authorization": f"Bearer {self.config.github_token}",
                    "Accept": "application/vnd.github.v3.diff",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            response.raise_for_status()
            return response.text

    async def get_file_content(
        self, owner: str, repo: str, path: str, ref: str
    ) -> str:
        """Get file content at a specific ref."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
                headers={
                    "Authorization": f"Bearer {self.config.github_token}",
                    "Accept": "application/vnd.github.raw+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                params={"ref": ref},
            )
            response.raise_for_status()
            return response.text

    async def create_review_comment(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        *,
        body: str,
        commit_sha: str,
        path: str,
        line: int,
        side: str = "RIGHT",
    ) -> dict:
        """Create a review comment on a pull request."""
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/pulls/{pr_number}/comments",
            json={
                "body": body,
                "commit_id": commit_sha,
                "path": path,
                "line": line,
                "side": side,
            },
        )

    async def create_issue_comment(
        self, owner: str, repo: str, issue_number: int, body: str
    ) -> dict:
        """Create a comment on an issue or pull request."""
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/issues/{issue_number}/comments",
            json={"body": body},
        )

    async def get_review_comment(
        self, owner: str, repo: str, comment_id: int
    ) -> dict:
        """Get a review comment by ID."""
        return await self._request(
            "GET",
            f"/repos/{owner}/{repo}/pulls/comments/{comment_id}",
        )

    async def reply_to_review_comment(
        self, owner: str, repo: str, pr_number: int, comment_id: int, body: str
    ) -> dict:
        """Reply to a review comment."""
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies",
            json={"body": body},
        )

    async def create_or_update_file(
        self,
        owner: str,
        repo: str,
        path: str,
        content: str,
        message: str,
        branch: str,
    ) -> dict:
        """Create or update a file in the repository."""
        import base64

        # First, try to get the current file to get its SHA
        sha = None
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
                    headers={
                        "Authorization": f"Bearer {self.config.github_token}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                    params={"ref": branch},
                )
                if response.status_code == 200:
                    sha = response.json().get("sha")
        except Exception:
            pass  # File doesn't exist, will be created

        payload = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha

        return await self._request(
            "PUT",
            f"/repos/{owner}/{repo}/contents/{path}",
            json=payload,
        )

    async def add_reaction(
        self, owner: str, repo: str, comment_id: int, reaction: str
    ) -> dict:
        """Add a reaction to a PR review comment."""
        return await self._request(
            "POST",
            f"/repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions",
            json={"content": reaction},
        )
