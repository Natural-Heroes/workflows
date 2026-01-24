# Phase 1 Plan 2: MCP Server and Tools Summary

**One-liner:** Express server with StreamableHTTPServerTransport, per-session API key binding, TTL sweep, and ping/test_odoo tools.

---

## What Was Done

### Task 1: MCP server factory and test tools
- Created `src/mcp/tools/ping.ts` - simple connectivity verification tool
- Created `src/mcp/tools/test-odoo.ts` - Odoo API connectivity test with error handling
- Created `src/mcp/index.ts` - server factory that binds per-session API key to tool handlers
- Verified compilation with `npx tsc --noEmit`

### Task 2: Express server with session management
- Created `src/server.ts` following mrpeasy reference pattern
- Session store: Map<sessionId, SessionEntry> with transport, server, lastActivity, apiKey
- Session TTL sweep: 30min timeout, 60s interval, with `.unref()` to prevent blocking exit
- API key extraction from `x-odoo-api-key` header on initialize requests
- Health endpoint: GET /health returns status, version, session count, client count
- POST /mcp: full session lifecycle (initialize, reuse, invalid, missing)
- GET /mcp: SSE for server-to-client notifications
- DELETE /mcp: explicit session termination
- Graceful shutdown: SIGTERM/SIGINT closes all sessions, clears client cache

### Task 3: Integration smoke test
- Started server with test `.env`, verified health endpoint returns expected JSON
- Tested MCP initialize with API key - session ID returned in response header
- Tested missing API key - returns 401
- Tested invalid session - returns 400 with JSON-RPC error
- Verified session count increments on health endpoint
- Built TypeScript to dist/, verified `dist/server.js` passes syntax check

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Per-session API key binding | Each MCP session gets its own API key passed to tool handlers, enabling multi-user support |
| 30-minute session TTL | Matches OdooClientManager LRU TTL for consistency |
| SSE format on initialize | SDK ^1.25.0 requires Accept header with text/event-stream; response uses SSE format |
| McpServer description omitted | SDK McpServer constructor only accepts name/version (description not supported) |

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Key Files

### Created
- `src/mcp/tools/ping.ts` - Ping connectivity tool
- `src/mcp/tools/test-odoo.ts` - Odoo API test tool
- `src/mcp/index.ts` - MCP server factory
- `src/server.ts` - Express HTTP server with session management

### Modified
- (none)

---

## Commits

| Hash | Message |
|------|---------|
| 36f8fc3 | feat(01-02): implement MCP server factory and test tools |
| 73dbb01 | feat(01-02): implement Express server with session management |

---

## Verification Results

- `npx tsc --noEmit` exits 0
- `curl http://localhost:3000/health` returns `{"status":"healthy","version":"0.1.0","sessions":0,"clients":0}`
- POST /mcp with initialize + x-odoo-api-key returns session ID in mcp-session-id header
- POST /mcp without x-odoo-api-key returns 401
- POST /mcp with invalid session returns 400
- `grep "setInterval" src/server.ts` confirms TTL sweep
- `grep "SIGTERM" src/server.ts` confirms graceful shutdown
- `grep "x-odoo-api-key" src/server.ts` confirms API key extraction
- `grep "touchSession" src/server.ts` confirms activity tracking
- `npx tsc` produces valid dist/server.js

---

## Next Phase Readiness

Phase 1 foundation is now complete:
- Shared libs (env, logger, errors) - Plan 01
- Odoo JSON-2 client and client manager - Plan 01
- MCP server factory with tool registration - Plan 02
- Express server with session management - Plan 02

Ready for Phase 2: Tool implementation (read, search, write, action tools).
