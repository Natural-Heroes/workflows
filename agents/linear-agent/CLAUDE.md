# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # TypeScript compilation (tsc) → dist/
npm run dev            # Development with tsx watch
npm run start          # Run compiled dist/main.js
npm run setup-oauth    # One-time OAuth token setup
bash scripts/start.sh  # Start server + Cloudflare tunnel (production)
```

**Prerequisites:** Redis running on localhost:6379, OAuth tokens in `config/tokens.json` (run `npm run setup-oauth` first).

## Architecture

Linear Agent ("Hero") is a webhook-driven service that receives Linear issue delegations, spawns Pi coding agent sessions, and creates PRs.

### Data Flow

```
Linear webhook → Fastify server (HMAC verify) → BullMQ queue → Worker → AgentStrategy → Pi session → Git branch + PR → Linear activities
```

1. **Server** (`src/server/index.ts`) — receives webhooks, deduplicates, queues jobs. Handles both `AgentSessionEvent` (primary) and `Issue` webhooks (re-delegation fallback).
2. **Worker** (`src/queue/worker.ts`) — processes jobs: resolves repo via `repo:` label, resolves agent via `agent:` label, executes strategy.
3. **Runner** (`src/agents/default/runner.ts`) — creates Pi coding agent session, maps events to Linear activities, manages git lifecycle.
4. **Git workflow** (`src/git/workflow.ts`) — worktree-based isolation. Each session gets `/tmp/hero-{sessionId}` with push blocked. Runner unblocks push temporarily for its own operations. Branch naming: `feat/linear-{issueId}-{slug}`. PRs target `dev` as drafts.

### Key Mechanisms

- **Webhook dedup** (three layers):
  1. `recentAgentSessions` (issueId → timestamp) — claimed before 5s wait to prevent concurrent Issue webhooks from both creating sessions. Cleared when delegate is removed (enables re-delegation).
  2. `issuesToSessions` (issueId set) — marks issues that had an AgentSessionEvent queued, so the Issue fallback handler can detect native sessions were created during its wait.
  3. `queuedSessions` (sessionId set) — prevents duplicate jobs when Linear sends both `created` + `updated` for the same session. Auto-cleans after 60s.
- **Stop handling**: Linear sends `action=prompted` for stops. Server checks session age (>30s) before treating as stop signal. SessionRegistry (`src/sessions/registry.ts`) tracks active sessions with AbortControllers.
- **Prompt composition**: Linear's `promptContext` is used when available, with agent rules always appended. Fallback prompt built from issue data via `context-builder.ts`.
- **Activity mapping**: Pi session events are batched (5s intervals) and mapped to Linear agent activities (thought, action, response, error) via `event-mapper.ts`.
- **Rate limiting**: Bottleneck at 450 req/hour for Linear API (limit is 500).
- **Git worktree isolation**: Agent sessions run in isolated worktrees (`/tmp/hero-{sessionId}`). Push is blocked via per-worktree `remote.origin.pushurl` config (`extensions.worktreeConfig = true`). This is system-level enforcement — even if the Pi agent ignores prompt rules and runs `git push`, it fails. The runner temporarily unsets the pushurl when it needs to push.

### Visual Verification

After creating a PR, the runner checks if the changes are visual (`.tsx`, `.jsx`, `.css`, `.scss`, `.html`, `.svg`, etc.). If visual:
1. Polls PR comments for a preview deployment URL (Vercel/Dokploy pattern) for up to 5 minutes
2. If found, re-prompts the Pi agent with the URL to browse via `surf` (headless Chrome) and verify
3. If the agent finds visual issues and makes fixes, a new commit is pushed to the same PR

The agent decides whether visual testing is needed based on file extensions — no per-repo config required. Preview URLs are detected from PR comments posted by Vercel/Dokploy bots.

### Pluggable Agents

`AgentStrategy` interface (`src/agents/types.ts`) + `AgentRegistry` (`src/agents/registry.ts`). Agent type resolved from `agent:{type}` label on issue, falls back to `defaultAgentType` config. New agents: implement `AgentStrategy`, register in registry.

## Config

`config/agent.config.json` — repos array maps `repo:` labels to local paths. `pi` section configures model provider/model/thinkingLevel. `queue` section: concurrency 5, 1hr timeout, 3 retries.

### Auto-Deploy

Push to `main` in the workflows repo triggers auto-deploy on the Mac Mini via GitHub webhook (`/webhooks/github`). Only deploys when files in `agents/linear-agent/` are changed. The server pulls, rebuilds, waits for active agent sessions to finish, then restarts via `launchctl`.

## Conventions

- TypeScript strict mode, ESM with `.js` import extensions
- Dependency injection throughout — no globals
- Console logging with `[tag]` prefixes: `[webhook]`, `[worker]`, `[runner]`, `[sessions]`, `[github]`
- Conventional commits: `feat:`, `fix:`, `refactor:`
- All PRs target `dev` branch
