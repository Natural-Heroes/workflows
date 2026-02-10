# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Monorepo for automation infrastructure: GitHub Actions workflows, MCP servers (Dockerized), a Linear-integrated coding agent ("Hero"), and Claude Code plugins.

## Repository Structure

- `agents/linear-agent/` — Hero: webhook-driven Linear agent that spawns Pi coding sessions and creates PRs. Has its own detailed CLAUDE.md — **read it before working on agent code**.
- `mcp/` — MCP servers, each Dockerized and independently deployable. All TypeScript (Node) except `google-analytics` (Python).
- `plugins/` — Claude Code plugins (fibery, shopify, nh-odoo, code-review)
- `.claude-plugin/marketplace.json` — Local plugin marketplace definition
- `.github/workflows/` — Reusable workflow definitions (`workflow_call` trigger)
- `bugbot/` — Caller templates for GPT-5.2-Codex bug detection workflows

## Build Commands

### Linear Agent (`agents/linear-agent/`)
```bash
npm run build          # tsc → dist/
npm run dev            # tsx watch
npm run start          # node dist/main.js
npm run setup-oauth    # One-time OAuth token setup
```
Requires: Redis on localhost:6379, OAuth tokens in `config/tokens.json`.

### MCP Servers (`mcp/<name>/`)
TypeScript servers:
```bash
npm run build          # tsc → dist/
npm run dev            # tsx watch
```
Python server (google-analytics): standard Dockerfile build.

Each MCP server has a Dockerfile for deployment. No shared build — each is independent.

### Inventory Planner MCP (has tests)
```bash
cd mcp/inventory-planner
npx vitest             # Run all tests
npx vitest run <file>  # Run specific test file
```

## Architecture Notes

### Linear Agent (Hero)
Full architecture documented in `agents/linear-agent/CLAUDE.md`. Key points:
- Webhook → Fastify → BullMQ → Worker → AgentStrategy → Pi session → Git/PR → Linear
- Agent type resolved from `agent:` label on Linear issue (default: `default`, also: `plan`)
- Repo resolved from `repo:` label
- Git worktree isolation in `/tmp/hero-{sessionId}` with push blocked at git config level
- Auto-deploys to Mac Mini on push to `main` (only when `agents/linear-agent/` files change)

### MCP Servers
All follow the same pattern: Fastify HTTP server with SSE transport, Dockerized, deployed via Dokploy. TypeScript strict mode, ESM with `.js` import extensions.

## Conventions

- TypeScript strict mode, ESM with `.js` import extensions throughout
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Each sub-project is independent — no workspace-level package.json
- Always commit and push changes to `main` after implementation — no PRs for this repo
