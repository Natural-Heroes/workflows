---
phase: 01-foundation-objectives
plan: 01
subsystem: perdoo-client
tags: [graphql, resilience, typescript, mcp]
dependency-graph:
  requires: []
  provides: [perdoo-client, resilience-stack, error-types, env-validation]
  affects: [01-02, 01-03]
tech-stack:
  added: ["@modelcontextprotocol/sdk ^1.15.0", "express ^4.21.0", "zod ^3.25.0", "typescript ^5.7.3", "tsx ^4.19.2"]
  patterns: [token-bucket-rate-limiter, circuit-breaker, request-queue, graphql-client-resilience-pipeline]
key-files:
  created:
    - mcp/perdoo/package.json
    - mcp/perdoo/tsconfig.json
    - mcp/perdoo/Dockerfile
    - mcp/perdoo/.env.example
    - mcp/perdoo/.gitignore
    - mcp/perdoo/src/lib/logger.ts
    - mcp/perdoo/src/lib/env.ts
    - mcp/perdoo/src/lib/errors.ts
    - mcp/perdoo/src/services/perdoo/rate-limiter.ts
    - mcp/perdoo/src/services/perdoo/request-queue.ts
    - mcp/perdoo/src/services/perdoo/circuit-breaker.ts
    - mcp/perdoo/src/services/perdoo/retry.ts
    - mcp/perdoo/src/services/perdoo/types.ts
    - mcp/perdoo/src/services/perdoo/client.ts
    - mcp/perdoo/src/services/perdoo/index.ts
    - mcp/perdoo/src/services/perdoo/operations/introspection.ts
  modified: []
decisions:
  - id: rate-limit-conservative
    decision: "TokenBucket(30, 3) - conservative since Perdoo rate limits are undocumented"
    rationale: "Better to be too slow than to get blocked; can tune up after introspection"
  - id: mutation-no-retry
    decision: "Mutations are never retried via isMutation flag in execute()"
    rationale: "Prevents duplicate side effects from retrying GraphQL mutations"
  - id: error-classification
    decision: "PerdooApiError and PerdooHttpError with isRetryable classification"
    rationale: "GraphQL API has different error semantics than REST; need both GraphQL-level and HTTP-level error handling"
metrics:
  duration: "3m 45s"
  completed: "2026-01-23"
---

# Phase 01 Plan 01: Foundation + Objectives - Project Scaffolding Summary

**One-liner:** TypeScript project scaffold with Zod env validation, GraphQL error types, and PerdooClient resilience pipeline (queue -> circuit breaker -> retry -> rate limiter -> fetch)

## What Was Done

### Task 1: Project scaffolding and lib layer
- Created `package.json` with MCP SDK, express, zod dependencies
- Created `tsconfig.json` for ES2022/NodeNext strict compilation
- Created `Dockerfile` exposing port 3001
- Created `.env.example` with PERDOO_API_TOKEN, PORT=3001, NODE_ENV
- Created `.gitignore` for node_modules, dist, .env
- Created `src/lib/logger.ts`: stderr-only structured logger (identical to MRPeasy)
- Created `src/lib/env.ts`: Zod-validated env with PERDOO_API_TOKEN (required), PORT (3001 default)
- Created `src/lib/errors.ts`: PerdooApiError (GraphQL errors), PerdooHttpError (HTTP errors), GraphQLError interface, GraphQLResponse<T> generic

### Task 2: Resilience stack and PerdooClient
- Created `rate-limiter.ts`: TokenBucket(30, 3) for conservative rate limiting
- Created `request-queue.ts`: single-concurrency FIFO queue (identical pattern to MRPeasy)
- Created `circuit-breaker.ts`: 5 failures opens, 2 successes closes, 30s timeout
- Created `retry.ts`: exponential backoff with jitter; uses PerdooApiError.isRetryable and PerdooHttpError.isRetryable
- Created `types.ts`: PageInfo, Connection<T>, Objective, IntrospectionData, input types (placeholders)
- Created `client.ts`: PerdooClient with execute<T>(operation, variables, options) pipeline
- Created `index.ts`: barrel exports with memoized createPerdooClient() factory
- Created `operations/introspection.ts`: full GraphQL schema introspection query

## Key Design Decisions

1. **Error classification approach**: Unlike MRPeasy's single MrpEasyApiError class, Perdoo uses separate PerdooApiError (for GraphQL errors) and PerdooHttpError (for HTTP errors). Each class self-classifies via `isRetryable` property.

2. **Mutation safety**: The `execute()` method accepts `options.isMutation` flag. When true, the retry wrapper is skipped entirely. This prevents duplicate mutations from transient network issues.

3. **Conservative rate limits**: TokenBucket(30, 3) vs MRPeasy's TokenBucket(75, 7.5). Since Perdoo rate limits are undocumented, we start conservative and can tune after observing real traffic patterns.

4. **Bearer token auth**: Perdoo uses Bearer token (not Basic Auth like MRPeasy). The token is injected via PERDOO_API_TOKEN env var and attached as Authorization header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added .gitignore file**
- **Found during:** Task 1 commit
- **Issue:** node_modules/ would be committed without .gitignore
- **Fix:** Created .gitignore with node_modules/, dist/, .env
- **Files modified:** mcp/perdoo/.gitignore

## Verification Results

- `npm install` exits 0 (137 packages, 0 vulnerabilities)
- `npx tsc --noEmit` passes with zero type errors
- PerdooApiError used in retry.ts and client.ts (confirmed via grep)
- `isMutation` guard exists in client.ts (confirmed via grep)
- `TokenBucket(30, 3)` in rate-limiter.ts (confirmed via grep)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 313c53d | feat(nat-54): scaffold perdoo MCP project and lib layer |
| 2 | a8e44ab | feat(nat-54): add resilience stack and PerdooClient with GraphQL execute |

## Next Phase Readiness

Plan 01-02 (Objective tools) can proceed immediately. The PerdooClient.execute() method is ready to accept GraphQL operations with typed responses.

**Dependencies satisfied for Plan 02:**
- PerdooClient is instantiable with a token
- execute<T>() accepts operation strings and returns typed data
- Error types are exported for tool-level error handling
- Introspection query constant ready for Plan 03
