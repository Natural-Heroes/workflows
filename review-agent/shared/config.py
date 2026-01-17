"""Shared configuration for review-agent services."""

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass
class Config:
    """Application configuration loaded from environment variables."""

    # Anthropic
    anthropic_api_key: str

    # Voyage AI
    voyage_api_key: str

    # GitHub App
    github_app_id: str | None
    github_private_key: str | None
    github_webhook_secret: str | None

    # GitHub token (fallback for simple auth)
    github_token: str | None

    # Infrastructure
    qdrant_url: str
    redis_url: str

    # Optional
    log_level: str = "INFO"


@lru_cache()
def get_config() -> Config:
    """Load configuration from environment variables."""
    return Config(
        anthropic_api_key=os.environ["ANTHROPIC_API_KEY"],
        voyage_api_key=os.environ["VOYAGE_API_KEY"],
        github_app_id=os.environ.get("GITHUB_APP_ID"),
        github_private_key=os.environ.get("GITHUB_PRIVATE_KEY"),
        github_webhook_secret=os.environ.get("GITHUB_WEBHOOK_SECRET"),
        github_token=os.environ.get("GITHUB_TOKEN"),
        qdrant_url=os.environ.get("QDRANT_URL", "http://localhost:6333"),
        redis_url=os.environ.get("REDIS_URL", "redis://localhost:6379"),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
    )
