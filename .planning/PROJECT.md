# Claude Agent SDK Code Review System

## What This Is

A Claude Agent SDK-powered code review system with full codebase awareness through RAG with Qdrant vector database. Replaces the existing OpenAI GPT-5.2-Codex bugbot with intelligent, context-aware code reviews and automated fixes, deployed on Dokploy.

## Core Value

Codebase-aware code reviews that understand context — callers, types, tests — not just the diff.

## Requirements

### Validated

- ✓ Indexer service with Tree-sitter (TS/JS) and Python AST chunking — existing
- ✓ Voyage AI embeddings (voyage-code-3, 1024 dimensions) — existing
- ✓ Qdrant vector storage per repository — existing
- ✓ Review Agent with search_codebase, get_file_content, post_review_comment tools — existing
- ✓ Fix Agent with apply_fix capability — existing
- ✓ Shared GitHub client and config — existing
- ✓ System prompts for review and fix — existing

### Active

- [ ] Webhook API service (FastAPI) for receiving GitHub webhooks
- [ ] Redis queue for async job processing
- [ ] Dockerfiles for claude-agent service
- [ ] Claude Code plugin with /code-review commands
- [ ] GitHub App configuration
- [ ] Deployment to Dokploy

### Out of Scope

- Automatic reindexing on push — deferred to v2 (start with manual indexing)
- Full CI/CD pipeline — deploy manually via Dokploy compose
- Multiple embedding model support — Voyage AI only for now
- Support for Go/Rust/other languages — TS/JS/Python only in v1

## Context

This replaces the existing bugbot workflows (`.github/workflows/` and `bugbot/` directories) which use OpenAI GPT-5.2-Codex. The new system provides:
- Full codebase context via RAG instead of just PR diff
- Claude Agent SDK with proper tool use instead of raw API calls
- Self-hosted infrastructure (Qdrant, Redis) on Dokploy

Existing implementation in `review-agent/` is ~80% complete:
- Core agents and tools implemented
- Indexer pipeline ready
- Missing: webhook receiver, Redis queue, deployment config

## Constraints

- **Embedding Model**: Voyage AI voyage-code-3 — best-in-class for code
- **Vector DB**: Qdrant self-hosted — already in docker-compose
- **Queue**: Redis + ARQ — lightweight, Python-native
- **Deployment**: Dokploy at review-webhook.naturalheroes.nl
- **Languages**: TypeScript, JavaScript, Python — Tree-sitter + AST support

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Voyage AI over OpenAI embeddings | Better code understanding, benchmark-proven | — Pending |
| Qdrant over Pinecone | Self-hosted, no vendor lock-in, excellent SDK | ✓ Good |
| Claude Sonnet for reviews | Speed/quality balance for PR reviews | — Pending |
| GitHub App over PAT | Scoped permissions, webhook secrets | — Pending |
| ARQ over Celery | Lighter weight, async-native, Python 3.11+ | — Pending |

---
*Last updated: 2026-01-17 after initialization*
