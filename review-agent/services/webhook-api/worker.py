"""ARQ worker for processing review and fix jobs."""

import asyncio
import logging

from arq import cron
from arq.connections import RedisSettings

from review_agent.shared import get_config
from review_agent.services.claude_agent.agents import ReviewAgent, FixAgent
from review_agent.services.indexer.main import CodebaseIndexer

logger = logging.getLogger(__name__)


async def review_pr(
    ctx: dict,
    owner: str,
    repo: str,
    pr_number: int,
    head_sha: str,
) -> dict:
    """Review a pull request."""
    logger.info(f"Processing review for {owner}/{repo}#{pr_number}")

    agent = ReviewAgent()
    result = await agent.review_pr(
        owner=owner,
        repo=repo,
        pr_number=pr_number,
        head_sha=head_sha,
    )

    return result


async def fix_issue(
    ctx: dict,
    owner: str,
    repo: str,
    pr_number: int,
    head_sha: str,
    comment_id: int,
    file_path: str,
    line: int,
    instructions: str | None = None,
) -> dict:
    """Fix an issue identified in a review comment."""
    logger.info(f"Processing fix for {owner}/{repo}#{pr_number} comment {comment_id}")

    agent = FixAgent()
    result = await agent.fix_issue(
        owner=owner,
        repo=repo,
        pr_number=pr_number,
        head_sha=head_sha,
        comment_id=comment_id,
        file_path=file_path,
        line=line,
        instructions=instructions,
    )

    return result


async def index_push(
    ctx: dict,
    owner: str,
    repo: str,
    ref: str,
    commits: list[dict],
) -> dict:
    """Index changes from a push event."""
    logger.info(f"Processing index for {owner}/{repo}@{ref}")

    indexer = CodebaseIndexer()

    # Collect affected files
    affected_files = set()
    for commit in commits:
        affected_files.update(commit.get("added", []))
        affected_files.update(commit.get("modified", []))
        # For removed files, we'd need to delete from index
        for removed in commit.get("removed", []):
            await indexer.delete_file(owner, repo, removed)

    # Re-index affected files
    from review_agent.shared import GitHubClient

    github = GitHubClient()
    indexed = 0

    for file_path in affected_files:
        try:
            content = await github.get_file_content(owner, repo, file_path, ref)
            chunks = await indexer.index_file(owner, repo, file_path, content, ref)
            indexed += chunks
        except Exception as e:
            logger.error(f"Failed to index {file_path}: {e}")

    return {
        "owner": owner,
        "repo": repo,
        "files_processed": len(affected_files),
        "chunks_indexed": indexed,
    }


class WorkerSettings:
    """ARQ worker settings."""

    functions = [review_pr, fix_issue, index_push]

    @staticmethod
    def redis_settings() -> RedisSettings:
        config = get_config()
        return RedisSettings.from_dsn(config.redis_url)

    # Retry settings
    max_tries = 3
    job_timeout = 600  # 10 minutes

    # Logging
    on_startup = None
    on_shutdown = None
