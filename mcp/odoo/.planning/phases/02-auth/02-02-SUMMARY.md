# Plan 02-02 Summary: Server OAuth Integration

**Completed:** 2026-01-24
**Status:** All tasks done, all verifications pass

## What Was Done

### Task 1: Environment schema update
- Added ENCRYPTION_KEY (required, min 16 chars) to Zod schema
- Added MCP_SERVER_URL (required, valid URL) for OAuth issuer discovery
- Added DB_PATH (optional, default ./data/credentials.db) for SQLite location
- Updated .env.example with documentation

### Task 2: MCP factory and tools refactor
- Removed `apiKey` parameter from `createMcpServer()` and `registerTestOdooTool()`
- Tools now read API key from `extra.authInfo.extra.odooApiKey`
- Unauthenticated tool calls return proper AUTH_REQUIRED error

### Task 3: Server OAuth integration
- Mounted `mcpAuthRouter` at app root (creates /authorize, /token, /register, /revoke, /.well-known/*)
- Protected POST/GET/DELETE /mcp with `requireBearerAuth` middleware
- Added GET/POST /login for Odoo credential validation form
- Initialized CredentialStore and OdooOAuthProvider at startup
- Ensured DB directory exists with mkdirSync
- Added express.urlencoded for form body parsing
- Added credentialStore.close() to graceful shutdown
- Completely removed x-odoo-api-key header pattern

### Task 4: Smoke test results
- Health endpoint: 200 with correct JSON
- OAuth metadata: Valid JSON with all required endpoints
- MCP without auth: 401 (correct rejection)
- Client registration: Returns client_id
- TypeScript build: Produces valid dist/server.js

## Files Modified
- src/lib/env.ts (3 new env vars)
- src/mcp/index.ts (removed apiKey param)
- src/mcp/tools/test-odoo.ts (authInfo pattern)
- src/server.ts (full OAuth rewrite)
- .env.example (new vars documented)
