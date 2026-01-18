# Claude Agent SDK Code Review System

## What This Is

A Claude Agent SDK-powered code review system with full codebase awareness through RAG with Qdrant vector database. Replaces the existing OpenAI GPT-5.2-Codex bugbot with intelligent, context-aware code reviews and automated fixes, triggered via GitHub Actions workflows.

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
- ✓ Reusable GitHub Actions workflows (code-review.yml, code-fix.yml) — existing
- ✓ Caller templates for easy adoption — existing
- ✓ Claude Code plugin with commands — existing

### Active

- [ ] Deploy Qdrant to Dokploy
- [ ] Index target repositories
- [ ] Test end-to-end on a sample PR

### Out of Scope

- Webhook-based architecture — using GitHub Actions instead (simpler, no infra to manage)
- Redis queue — not needed with GitHub Actions
- Automatic reindexing on push — manual indexing for now
- Multiple embedding model support — Voyage AI only

## Context

Architecture:
```
PR Opened/Updated → GitHub Actions → Claude Agent → Review Comments
                                          ↓
                                    Qdrant (RAG)
```

This replaces the existing bugbot workflows which use OpenAI GPT-5.2-Codex. The new system provides:
- Full codebase context via RAG instead of just PR diff
- Claude Agent SDK with proper tool use instead of raw API calls
- Self-hosted Qdrant on Dokploy for embeddings storage

## Constraints

- **Embedding Model**: Voyage AI voyage-code-3 — best-in-class for code
- **Vector DB**: Qdrant self-hosted on Dokploy
- **Trigger**: GitHub Actions (workflow_call)
- **Languages**: TypeScript, JavaScript, Python — Tree-sitter + AST support

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| GitHub Actions over webhook | Simpler, no additional infra, built-in secrets | ✓ Good |
| Voyage AI over OpenAI embeddings | Better code understanding, benchmark-proven | — Pending |
| Qdrant over Pinecone | Self-hosted, no vendor lock-in, excellent SDK | ✓ Good |
| Claude Sonnet for reviews | Speed/quality balance for PR reviews | — Pending |

---
*Last updated: 2026-01-18 after simplification to GitHub Actions*
