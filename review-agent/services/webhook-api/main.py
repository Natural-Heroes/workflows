"""Webhook API service for receiving GitHub webhooks."""

import hashlib
import hmac
import logging
from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI, Header, HTTPException, Request

from review_agent.shared import get_config

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    config = get_config()
    app.state.redis = await create_pool(
        RedisSettings.from_dsn(config.redis_url)
    )
    logger.info("Connected to Redis")
    yield
    await app.state.redis.close()


app = FastAPI(
    title="Code Review Webhook API",
    description="Receives GitHub webhooks and queues review jobs",
    lifespan=lifespan,
)


def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub webhook signature."""
    if not signature or not signature.startswith("sha256="):
        return False

    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(f"sha256={expected}", signature)


@app.post("/webhook/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(..., alias="X-GitHub-Event"),
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256"),
):
    """Handle GitHub webhook events."""
    config = get_config()
    payload = await request.body()

    # Verify signature
    if config.github_webhook_secret:
        if not verify_signature(
            payload, x_hub_signature_256 or "", config.github_webhook_secret
        ):
            raise HTTPException(status_code=401, detail="Invalid signature")

    data = await request.json()

    # Route event to appropriate handler
    if x_github_event == "pull_request":
        return await handle_pull_request(request.app, data)
    elif x_github_event == "pull_request_review_comment":
        return await handle_review_comment(request.app, data)
    elif x_github_event == "push":
        return await handle_push(request.app, data)
    else:
        return {"status": "ignored", "event": x_github_event}


async def handle_pull_request(app: FastAPI, data: dict) -> dict:
    """Handle pull_request events."""
    action = data.get("action")

    # Only review on opened, synchronize, ready_for_review
    if action not in ("opened", "synchronize", "ready_for_review"):
        return {"status": "ignored", "action": action}

    pr = data["pull_request"]

    # Skip drafts unless ready_for_review
    if pr.get("draft") and action != "ready_for_review":
        return {"status": "ignored", "reason": "draft"}

    # Queue review job
    job = await app.state.redis.enqueue_job(
        "review_pr",
        owner=data["repository"]["owner"]["login"],
        repo=data["repository"]["name"],
        pr_number=pr["number"],
        head_sha=pr["head"]["sha"],
    )

    logger.info(f"Queued review job {job.job_id} for PR #{pr['number']}")

    return {
        "status": "queued",
        "job_id": job.job_id,
        "pr": pr["number"],
    }


async def handle_review_comment(app: FastAPI, data: dict) -> dict:
    """Handle pull_request_review_comment events."""
    if data.get("action") != "created":
        return {"status": "ignored", "action": data.get("action")}

    comment = data["comment"]
    body = comment.get("body", "").strip()

    # Check for /fix command
    if not body.startswith("/fix"):
        return {"status": "ignored", "reason": "not a fix command"}

    # Extract optional instructions after /fix
    instructions = body[4:].strip() if len(body) > 4 else None

    pr = data["pull_request"]

    # Queue fix job
    job = await app.state.redis.enqueue_job(
        "fix_issue",
        owner=data["repository"]["owner"]["login"],
        repo=data["repository"]["name"],
        pr_number=pr["number"],
        head_sha=pr["head"]["sha"],
        comment_id=comment["id"],
        file_path=comment.get("path"),
        line=comment.get("line") or comment.get("original_line"),
        instructions=instructions,
    )

    logger.info(f"Queued fix job {job.job_id} for comment {comment['id']}")

    return {
        "status": "queued",
        "job_id": job.job_id,
        "comment_id": comment["id"],
    }


async def handle_push(app: FastAPI, data: dict) -> dict:
    """Handle push events for incremental indexing."""
    ref = data.get("ref", "")

    # Only index default branch
    if not ref.endswith("/main") and not ref.endswith("/master"):
        return {"status": "ignored", "reason": "not default branch"}

    # Queue index job
    job = await app.state.redis.enqueue_job(
        "index_push",
        owner=data["repository"]["owner"]["login"],
        repo=data["repository"]["name"],
        ref=data["after"],
        commits=data.get("commits", []),
    )

    logger.info(f"Queued index job {job.job_id} for push")

    return {
        "status": "queued",
        "job_id": job.job_id,
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}
