# State

## Project Reference

**Core Value:** Team members can securely access and act on their Odoo data from any Claude client, with each user seeing only what their Odoo permissions allow.

**Current Focus:** Phase 2 - Authentication

---

## Current Position

**Phase:** 2 of 4 (Authentication)
**Plan:** 1 of 2 (02-01 complete)
**Status:** In progress
**Last activity:** 2026-01-24 - Completed 02-01-PLAN.md
**Progress:** [###.......] 30%

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 3 |
| Plans failed | 0 |
| Phases completed | 1/4 |
| Requirements done | 0/35 |

---

## Accumulated Context

### Key Decisions
- JSON-2 API over XML-RPC (Odoo 19, future-proof)
- SDK ^1.25.0 (CVE fix + OAuth helpers)
- Embedded OAuth provider (single container)
- Encrypted SQLite for credential store
- LRU cache for per-user OdooClient instances (max=50, TTL=30min)
- Stderr-only logger with LOG_LEVEL filtering (MCP protocol uses stdout)
- Default context { lang: 'en_US' } for consistent Odoo responses
- dotenv loaded in env.ts as single entry point
- Per-session API key binding (each MCP session gets own key passed to tool handlers)
- 30-minute session TTL matching OdooClientManager LRU TTL
- SDK requires Accept: application/json, text/event-stream header for initialize
- In-memory token/code storage (not SQLite) for MVP tokens
- Opaque UUID tokens (not JWT) for simplicity and immediate revocation
- 1-hour access token expiry with refresh token rotation
- String concatenation for HTML rendering (shell safety)

### Pending TODOs
- (None yet)

### Blockers
- (None yet)

### Patterns Discovered
- JSON-2 URL pattern: /json/2/{model}/{method}
- Bearer token auth with X-Odoo-Database header
- Odoo error names map to user-friendly messages (AccessError, ValidationError, etc.)
- StreamableHTTPServerTransport returns SSE format on initialize (session ID in response header)
- McpServer constructor accepts name/version only (no description field)
- OAuthServerProvider.authorize() receives Express Response for redirect
- AuthInfo.expiresAt must be seconds since epoch (not ms)
- AuthInfo.extra carries userId + odooApiKey to tool handlers
- PKCE codeChallenge stored with auth code, returned by challengeForAuthorizationCode()

---

## Session Continuity

**Last session:** 2026-01-24 - Completed 02-01 (OAuth auth infrastructure)
**Next action:** Execute 02-02-PLAN.md (Express integration with mcpAuthRouter)
**Context to preserve:** All auth modules ready in src/auth/. CredentialStore, InMemoryClientsStore, OdooOAuthProvider, renderLoginPage exported. Provider has getPendingAuth/completeAuthorization for login form handler. Ready to wire into Express app with mcpAuthRouter + requireBearerAuth.
