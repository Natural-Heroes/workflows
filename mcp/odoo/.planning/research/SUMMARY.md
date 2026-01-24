# Research Summary

**Project:** Odoo MCP Server
**Date:** 2026-01-23
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Critical Findings (Project-Changing)

### 1. Use Odoo 19 JSON-2 API, NOT XML-RPC

XML-RPC is deprecated in Odoo 19, scheduled for removal in Odoo 20 (fall 2026). The new **JSON-2 API** (`POST /json/2/<model>/<method>`) uses bearer token auth with API keys and plain JSON. This eliminates all XML-RPC library dependencies — native `fetch` (Node 20+) is sufficient.

**Impact:** Remove XML-RPC from all requirements. Use JSON-2 API. Simpler, more type-safe, future-proof.

### 2. MCP SDK Must Be v1.25.0+ (Not 1.15.0)

CVE-2025-66414 (DNS rebinding) affects SDK <=1.24.0. Current stable is 1.25.3. The upgrade also gains built-in OAuth auth helpers (`OAuthServerProvider` interface, `requireBearerAuth`, `authInfo.extra` in tool handlers).

**Impact:** Pin `^1.25.0`. mrpeasy/Perdoo's `^1.15.0` is vulnerable.

### 3. OAuth 2.1 Requires 6 Endpoints

Claude remote MCP integrations require full OAuth 2.1 with:
- `/.well-known/oauth-protected-resource` (RFC 9728)
- `/.well-known/oauth-authorization-server` (RFC 8414)
- `/authorize` — user login via Odoo credentials
- `/token` — issue access tokens
- `/register` — Dynamic Client Registration (RFC 7591)
- `/mcp` — protected MCP endpoint

Embedded OAuth provider recommended (single container). Odoo serves as identity backend during authorization.

### 4. Session Memory Leak Risk

In-memory session store without TTL causes OOM (confirmed SDK issues #756, #1076, #812). Must implement session TTL + cleanup from day one.

---

## Stack Decision

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript ^5.7.3 | Matches mrpeasy/Perdoo |
| Runtime | Node.js >=20.0.0 | Native fetch, stable ESM |
| HTTP | Express ^4.21.0 | Matches existing pattern |
| MCP SDK | @modelcontextprotocol/sdk ^1.25.0 | CVE fix + OAuth helpers |
| Express adapter | @modelcontextprotocol/express | DNS rebinding protection |
| Validation | Zod ^3.25.0 | SDK peer dependency |
| JWT | jose ^5.x | Token generation |
| Credential store | better-sqlite3 | Encrypted user→API key mapping |
| HTML→Markdown | turndown | Knowledge article conversion |
| Markdown→HTML | marked | Knowledge article creation |
| Odoo client | Native fetch | JSON-2 API is plain HTTP+JSON |

**NOT using:** xmlrpc, axios, Keycloak, passport, any XML-RPC library.

---

## Feature Landscape

**28 tools across 7 domains:**

| Domain | Tools | Complexity | Notes |
|--------|-------|------------|-------|
| Accounting | 6 | HIGH | File uploads (base64), report aggregation via read_group |
| HR | 5 | MEDIUM | Record rules auto-enforce payslip access |
| Expenses | 3 | HIGH | File upload + OCR triggering |
| Knowledge | 4 | MEDIUM | HTML↔Markdown conversion needed |
| Projects | 5 | MEDIUM | Task template launching needs custom module API |
| Decisions | 2 | LOW | Blocked until custom Odoo module exists |
| Approvals | 3 | MEDIUM | Different approval models per domain |

**Key patterns:**
- File uploads: base64 string in tool arguments → Odoo `ir.attachment` `datas` field
- Reports: `read_group` on `account.move.line`, group by `account_id`, filter by `account_type`
- Knowledge: `body` field is HTML, convert with turndown/marked
- Approvals: `approval.request` states (`new`→`pending`→`approved`/`refused`), expense approval is separate (`hr.expense.sheet`)

---

## Architecture Pattern

```
Claude Client
    │ Bearer token (Authorization header)
    ▼
┌──────────────────────────────────────────┐
│  MCP SERVER (single Docker container)     │
│                                           │
│  Express + @modelcontextprotocol/express  │
│      │                                    │
│      ▼                                    │
│  OAuth Provider (embedded)                │
│  - /.well-known endpoints                 │
│  - /authorize (Odoo as IdP)              │
│  - /token (JWT issuance)                  │
│  - /register (DCR)                        │
│      │                                    │
│      ▼                                    │
│  Auth Middleware (requireBearerAuth)      │
│  → authInfo.extra = { odooUid, apiKey }  │
│      │                                    │
│      ▼                                    │
│  Tool Handlers (7 domain files)           │
│  → withOdooAuth(handler) pattern          │
│      │                                    │
│      ▼                                    │
│  OdooClientManager (LRU cache)            │
│  → per-user OdooClient instances          │
│      │                                    │
│      ▼                                    │
│  Credential Store (SQLite, encrypted)     │
└──────────────┬───────────────────────────┘
               │ fetch (JSON-2 API)
               ▼
┌──────────────────────────────────────────┐
│  Odoo 19 (Odoo.sh)                       │
│  POST /json/2/<model>/<method>           │
│  Authorization: Bearer <api_key>          │
└──────────────────────────────────────────┘
```

---

## Build Order (Dependency-Driven)

1. **Odoo JSON-2 client** — testable independently, everything depends on it
2. **MCP transport** — Express + StreamableHTTP without auth (proves protocol works)
3. **OAuth provider** — 6 endpoints, credential store, token management (highest complexity)
4. **Auth integration** — Wire OAuth into transport, per-user clients into tools
5. **Domain tools** — All 7 files (parallelizable, independent after foundation)
6. **Docker + deployment** — Dockerfile, health checks, graceful shutdown

---

## Top Pitfalls to Avoid

| # | Pitfall | Prevention | Phase |
|---|---------|-----------|-------|
| 1 | Session memory leak (OOM) | TTL + cleanup interval from day 1 | 2 |
| 2 | SDK CVE (DNS rebinding) | Pin ^1.25.0 | 1 |
| 3 | User A sees User B's data | Per-session OdooClient, never shared | 3-4 |
| 4 | Odoo API key 90-day expiry | Detect 401, surface re-auth prompt | 3 |
| 5 | File upload timeout (OCR) | Async: create attachment, return immediately, check status later | 5 |
| 6 | Too many tools confuse LLM | Stay at ~28, one per action, clear descriptions | 5 |
| 7 | XML-RPC removal in Odoo 20 | Use JSON-2 API from the start | 1 |

---

## Open Questions

- Is the Natural Heroes Odoo.sh instance already on Odoo 19? (JSON-2 API availability)
- Odoo API key 90-day expiry: automate rotation or accept re-auth?
- Exact OCR trigger mechanism for programmatically uploaded attachments
- Decisions custom module schema (needs design first)
- Odoo.sh rate limits on JSON-2 API (undocumented)

---

## Recommendation

Start with the **JSON-2 client + basic MCP transport** (no auth) to prove the stack works end-to-end. Then tackle OAuth (the hardest piece) as its own focused phase. Domain tools are the easiest part — they're independent and follow the mrpeasy pattern exactly.

The project's risk is concentrated in the OAuth layer. Everything else is proven patterns from mrpeasy/Perdoo applied to a different backend.
