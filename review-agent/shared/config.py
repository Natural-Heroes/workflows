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

    # GitHub token (provided by Actions, or PAT for local testing)
    github_token: str

    # Infrastructure
    qdrant_url: str

    # Optional
    log_level: str = "INFO"


@lru_cache()
def get_config() -> Config:
    """Load configuration from environment variables."""
    return Config(
        anthropic_api_key=os.environ["ANTHROPIC_API_KEY"],
        voyage_api_key=os.environ["VOYAGE_API_KEY"],
        github_token=os.environ["GITHUB_TOKEN"],
        qdrant_url=os.environ.get("QDRANT_URL", "http://localhost:6333"),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
    )
