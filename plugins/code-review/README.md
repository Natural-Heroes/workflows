# Code Review Plugin

Claude-powered code review with full codebase awareness using RAG (Retrieval Augmented Generation).

## Features

- **Codebase-Aware Reviews**: Uses Qdrant vector database to search for relevant context
- **Smart Bug Detection**: Finds bugs by understanding how code is used across the codebase
- **Auto-Fix Support**: Reply `/fix` to any bug comment to automatically apply fixes
- **Multi-Language**: Supports TypeScript, JavaScript, and Python

## Architecture

The code review system uses GitHub Actions workflows with a self-hosted Qdrant instance:

```
GitHub PR → Actions Workflow → Claude Agent → Review Comments
                  ↓
              Qdrant (RAG)
```

## Commands

### `/code-review:review-status`

Check the status of recent code reviews for the current repository.

### `/code-review:trigger-review`

Manually trigger a code review on the current branch (requires open PR).

## How It Works

1. **On PR Open/Update**: GitHub Actions workflow triggers the review agent
2. **Context Gathering**: Agent searches Qdrant for relevant code (callers, types, tests)
3. **Analysis**: Claude analyzes changes with full codebase context
4. **Comments**: Issues are posted as inline PR comments with severity levels

## Severity Levels

- 🔴 **Critical** - Bugs that will cause crashes, data loss, or security issues
- 🟠 **Warning** - Issues that may cause problems under certain conditions
- 🟡 **Suggestion** - Improvements that aren't blocking

## Auto-Fix

Reply to any review comment with `/fix` to automatically apply a fix:

```
/fix
```

Or provide additional instructions:

```
/fix Use a try-catch instead of optional chaining
```

## Setup

### 1. Deploy Qdrant

Deploy Qdrant on Dokploy using the docker-compose in `review-agent/`:

```bash
cd review-agent
docker-compose up -d qdrant
```

### 2. Index Your Repository

Run the indexer to create embeddings for your codebase:

```bash
export GITHUB_TOKEN=ghp_...
export VOYAGE_API_KEY=pa-...
export QDRANT_URL=https://qdrant.your-domain.com

python -m review_agent.services.indexer.main owner repo --ref main
```

### 3. Add Workflows to Your Repository

Copy the caller templates to your repository's `.github/workflows/`:

```yaml
# .github/workflows/code-review.yml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  review:
    uses: Natural-Heroes/workflows/.github/workflows/code-review.yml@main
    with:
      qdrant_url: https://qdrant.your-domain.com
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      VOYAGE_API_KEY: ${{ secrets.VOYAGE_API_KEY }}
```

### 4. Set Repository Secrets

Add these secrets to your repository:

- `ANTHROPIC_API_KEY` - Claude API key
- `VOYAGE_API_KEY` - Voyage AI key for embeddings

The `GITHUB_TOKEN` is automatically provided by GitHub Actions.
