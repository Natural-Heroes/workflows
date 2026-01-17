"""CLI entry points for the Claude agents."""

import argparse
import asyncio
import json
import logging
import sys

from .agents.review_agent import ReviewAgent
from .agents.fix_agent import FixAgent


async def run_review(owner: str, repo: str, pr_number: int, head_sha: str) -> dict:
    """Run a PR review."""
    agent = ReviewAgent()
    return await agent.review_pr(owner, repo, pr_number, head_sha)


async def run_fix(
    owner: str,
    repo: str,
    pr_number: int,
    comment_id: int,
    instructions: str | None = None,
) -> dict:
    """Run a code fix."""
    agent = FixAgent()
    return await agent.fix_code(owner, repo, pr_number, comment_id, instructions)


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Claude Code Review Agent")
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Review command
    review_parser = subparsers.add_parser("review", help="Review a pull request")
    review_parser.add_argument("--owner", required=True, help="Repository owner")
    review_parser.add_argument("--repo", required=True, help="Repository name")
    review_parser.add_argument("--pr", type=int, required=True, help="PR number")
    review_parser.add_argument("--sha", required=True, help="Head commit SHA")

    # Fix command
    fix_parser = subparsers.add_parser("fix", help="Fix code based on a comment")
    fix_parser.add_argument("--owner", required=True, help="Repository owner")
    fix_parser.add_argument("--repo", required=True, help="Repository name")
    fix_parser.add_argument("--pr", type=int, required=True, help="PR number")
    fix_parser.add_argument("--comment-id", type=int, required=True, help="Comment ID")
    fix_parser.add_argument("--instructions", help="Optional fix instructions")

    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Run the appropriate command
    if args.command == "review":
        result = asyncio.run(
            run_review(args.owner, args.repo, args.pr, args.sha)
        )
    elif args.command == "fix":
        result = asyncio.run(
            run_fix(args.owner, args.repo, args.pr, args.comment_id, args.instructions)
        )
    else:
        parser.print_help()
        sys.exit(1)

    # Output result as JSON for GitHub Actions
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
