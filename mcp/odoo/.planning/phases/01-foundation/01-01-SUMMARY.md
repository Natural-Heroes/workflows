# Phase 1 Plan 01: Project Scaffolding and Odoo JSON-2 Client Summary

**One-liner:** TypeScript project with Zod-validated env, stderr-only logger, Odoo JSON-2 client with LRU-cached per-user instances.

---

## What Was Done

### Task 1: Project Scaffolding and Shared Lib

- Created `package.json` with MCP SDK ^1.25.0, express, zod, lru-cache, dotenv
- Created `tsconfig.json` targeting ES2022 with NodeNext module resolution
- Created `.env.example` with PORT, NODE_ENV, ODOO_URL, ODOO_DATABASE, LOG_LEVEL
- Created `.gitignore` for node_modules, dist, .env, tsbuildinfo
- Implemented `src/lib/logger.ts`: structured stderr-only logger with LOG_LEVEL filtering
- Implemented `src/lib/env.ts`: Zod schema validation with dotenv, typed getEnv()
- Implemented `src/lib/errors.ts`: McpToolError, OdooApiError, createOdooApiError mapping

### Task 2: OdooClient and OdooClientManager

- Created `src/services/odoo/types.ts`: OdooSearchReadOptions, OdooErrorResponse interfaces
- Implemented `src/services/odoo/client.ts`: OdooClient class with JSON-2 API pattern
  - `call<T>()`: generic method for /json/2/{model}/{method}
  - `searchRead<T>()`, `read<T>()`, `searchCount()`, `create()`, `write()`, `unlink()`
  - Bearer token + X-Odoo-Database headers
  - Default context { lang: 'en_US' } on read operations
- Implemented `src/services/odoo/client-manager.ts`: LRU cache (max=50, TTL=30min)
  - Per-API-key client caching with dispose logging
  - `getClient()`, `size`, `clear()` interface

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Stderr-only logger with level filtering | MCP protocol uses stdout; LOG_LEVEL env var controls verbosity |
| dotenv loaded in env.ts | Single entry point for env configuration |
| Default context { lang: 'en_US' } | Consistent English responses from Odoo regardless of user locale |
| LRU max=50, TTL=30min | Bounds memory while keeping active sessions warm |
| Truncate API key to 8 chars in logs | Security: never log full credentials |

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification Results

- `npm install` exits 0 (139 packages, 0 vulnerabilities)
- `npx tsc --noEmit` exits 0 (no compile errors)
- No console.log in source (only console.error via logger)
- OdooClient.call() uses correct URL pattern: /json/2/{model}/{method}
- OdooClient.call() includes Authorization, Content-Type, and X-Odoo-Database headers
- OdooClientManager uses lru-cache with TTL and max size
- All exports correctly typed

---

## Key Files

### Created

| File | Purpose |
|------|---------|
| `package.json` | Project config with dependencies |
| `tsconfig.json` | TypeScript compiler options |
| `.env.example` | Environment variable template |
| `.gitignore` | Git ignore rules |
| `src/lib/logger.ts` | Structured stderr-only logger |
| `src/lib/env.ts` | Zod-validated environment config |
| `src/lib/errors.ts` | Error classes and Odoo error mapping |
| `src/services/odoo/types.ts` | TypeScript interfaces for Odoo API |
| `src/services/odoo/client.ts` | OdooClient - JSON-2 API wrapper |
| `src/services/odoo/client-manager.ts` | LRU-cached per-user client manager |

---

## Commits

| Hash | Message |
|------|---------|
| b2b3aa7 | chore(01-01): scaffold project and shared lib |
| fd8598b | feat(01-01): implement Odoo JSON-2 client and client manager |

---

## Next Phase Readiness

This plan provides the foundation for Plan 01-02 (MCP Server + Tools):
- Logger, env, and error utilities are ready for import
- OdooClient and OdooClientManager are ready for use in tool handlers
- TypeScript compilation is configured and passing
- All dependencies installed

No blockers for the next plan.
