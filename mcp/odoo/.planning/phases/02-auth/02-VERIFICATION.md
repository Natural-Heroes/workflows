---
phase: 02-auth
verified: 2026-01-24T12:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 2: Auth Verification Report

**Phase Goal:** Users can authenticate via OAuth 2.1 from any Claude client and have their identity mapped to their personal Odoo API key.
**Verified:** 2026-01-24
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Claude client discovers OAuth endpoints via .well-known metadata and completes authorization flow | VERIFIED | `mcpAuthRouter` mounted in server.ts (line 105) creates /authorize, /token, /register, /revoke, /.well-known/* endpoints; `OdooOAuthProvider` implements full authorization code flow with PKCE |
| 2 | User authenticates with Odoo credentials during /authorize and receives a valid access token | VERIFIED | `authorize()` redirects to /login; POST /login validates via `validateOdooCredentials()` against Odoo JSON-2 API; `completeAuthorization()` issues auth code; `exchangeAuthorizationCode()` returns access+refresh tokens |
| 3 | Access token resolves to the correct Odoo API key from the encrypted credential store | VERIFIED | `verifyAccessToken()` retrieves token data, calls `credentialStore.getApiKey(userId)` which decrypts via AES-256-GCM, returns `AuthInfo.extra.odooApiKey`; test-odoo tool reads from `extra.authInfo.extra.odooApiKey` |
| 4 | Unauthorized requests (missing/invalid/expired token) are rejected with proper error responses | VERIFIED | `requireBearerAuth` middleware protects all /mcp routes (POST, GET, DELETE at lines 187, 259, 281); `verifyAccessToken()` throws on invalid/expired tokens; tool handler returns AUTH_REQUIRED error if no authInfo |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/auth/credential-store.ts` | AES-256-GCM encrypted SQLite store | VERIFIED (157 lines) | PBKDF2 100k iterations, WAL mode, full CRUD, GCM auth tag verification |
| `src/auth/clients-store.ts` | OAuth client registration store | VERIFIED (27 lines) | Implements OAuthRegisteredClientsStore, in-memory Map |
| `src/auth/provider.ts` | OAuthServerProvider implementation | VERIFIED (334 lines) | All 6 interface methods + clientsStore + validateOdooCredentials + completeAuthorization |
| `src/auth/login-page.ts` | Server-rendered login form | VERIFIED (156 lines) | email + api_key (password) fields, hidden pending ID, XSS escaping, responsive CSS |
| `src/lib/env.ts` | ENCRYPTION_KEY, MCP_SERVER_URL, DB_PATH | VERIFIED (82 lines) | Zod schema with ENCRYPTION_KEY (min 16), MCP_SERVER_URL (URL), DB_PATH (default ./data/credentials.db) |
| `src/server.ts` | OAuth router + bearerAuth + login endpoints | VERIFIED (339 lines) | mcpAuthRouter mounted, bearerAuth on POST/GET/DELETE /mcp, GET/POST /login handlers, credentialStore.close() on shutdown |
| `src/mcp/index.ts` | No apiKey param | VERIFIED (30 lines) | `createMcpServer(clientManager)` - no apiKey parameter |
| `src/mcp/tools/test-odoo.ts` | Uses authInfo pattern | VERIFIED (75 lines) | Reads `extra.authInfo.extra.odooApiKey`, returns AUTH_REQUIRED if missing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server.ts | OdooOAuthProvider | constructor + mcpAuthRouter | WIRED | Provider instantiated with credentialStore, passed to mcpAuthRouter and requireBearerAuth |
| server.ts | CredentialStore | constructor + POST /login | WIRED | Initialized with env.DB_PATH + env.ENCRYPTION_KEY; used in POST /login to store validated key |
| server.ts | renderLoginPage | GET /login + POST /login | WIRED | Imported and called for both success and error cases |
| OdooOAuthProvider | CredentialStore | verifyAccessToken() | WIRED | Calls credentialStore.getApiKey(userId) to decrypt stored API key |
| OdooOAuthProvider | OdooClient | validateOdooCredentials() | WIRED | Creates OdooClient with user's API key, calls searchRead on res.users |
| test-odoo.ts | authInfo | extra.authInfo.extra.odooApiKey | WIRED | Reads odooApiKey from auth context, passes to clientManager.getClient() |
| POST /login | completeAuthorization | redirect flow | WIRED | After validation succeeds, stores key + calls completeAuthorization + redirects to OAuth redirect_uri |
| bearerAuth | /mcp routes | express middleware | WIRED | Applied to app.post/get/delete('/mcp', bearerAuth, ...) |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| INFRA-03: OAuth 2.1 provider with 6 endpoints | SATISFIED | None -- all 6 endpoints via mcpAuthRouter + 2 login endpoints |
| INFRA-04: Per-user credential store with encrypted SQLite | SATISFIED | None -- AES-256-GCM, PBKDF2, per-user isolation |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No anti-patterns detected |

Notes:
- "placeholder" matches in login-page.ts are legitimate HTML input placeholders, not stub indicators
- `return null` in provider.ts and credential-store.ts are proper "not found" returns
- console.error in logger.ts is the intentional stderr output mechanism (MCP protocol requires stderr, not stdout)
- No TODO, FIXME, HACK, or stub patterns found anywhere in phase files

### Compilation Check

- `npx tsc --noEmit` exits 0 -- zero type errors

### Specific Verification Points

1. **AES-256-GCM encryption**: Confirmed in credential-store.ts line 57 (`createCipheriv('aes-256-gcm', ...)`)
2. **PBKDF2 key derivation**: Confirmed at line 32 (100,000 iterations, SHA-256, 32-byte key)
3. **expiresAt in seconds**: Lines 185, 232, 266 all use `Math.floor(Date.now() / 1000)`
4. **x-odoo-api-key removed**: Zero matches in src/ directory
5. **No console.log**: Only logger.ts uses console.error for stderr output (correct MCP pattern)
6. **OAuthServerProvider methods**: All 6 implemented (authorize, challengeForAuthorizationCode, exchangeAuthorizationCode, exchangeRefreshToken, verifyAccessToken, revokeToken) plus clientsStore getter
7. **Login page form fields**: email (type=email) + api_key (type=password) + hidden pending field
8. **Token rotation**: exchangeRefreshToken deletes old refresh token before issuing new pair (line 221)

### Human Verification Required

### 1. Full OAuth Flow End-to-End

**Test:** Configure a Claude client (e.g., Claude Desktop) with the MCP server URL and trigger a tool call. Follow the OAuth redirect to the login page, enter valid Odoo credentials, and complete the flow.
**Expected:** Login page appears, credentials are accepted, redirect completes, tool call succeeds with real Odoo data.
**Why human:** Requires real Odoo instance, real Claude client, and interactive browser-based OAuth flow that cannot be simulated programmatically.

### 2. Invalid Credential Rejection

**Test:** During the OAuth login page, enter an incorrect API key or non-existent email.
**Expected:** Login page redisplays with error message "Invalid credentials. Check your email and API key."
**Why human:** Requires real Odoo instance to validate credentials against.

### 3. Token Expiry Behavior

**Test:** Wait 1 hour after authentication, then attempt a tool call.
**Expected:** Request is rejected; client triggers token refresh using refresh token; new access token is issued and subsequent calls succeed.
**Why human:** Requires waiting or time manipulation and observing client refresh behavior.

---

_Verified: 2026-01-24_
_Verifier: Claude (gsd-verifier)_
