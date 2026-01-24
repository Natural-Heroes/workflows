---
phase: 02-auth
plan: 01
subsystem: authentication
tags: [oauth, encryption, sqlite, aes-gcm, pbkdf2]
completed: 2026-01-24
duration: ~3min

dependency_graph:
  requires: ["01-02"]
  provides: ["OdooOAuthProvider", "CredentialStore", "InMemoryClientsStore", "renderLoginPage"]
  affects: ["02-02"]

tech_stack:
  added: ["better-sqlite3"]
  patterns: ["AES-256-GCM app-layer encryption", "PBKDF2 key derivation", "OAuth 2.1 authorization code flow with PKCE", "In-memory token storage with refresh rotation"]

key_files:
  created:
    - src/auth/credential-store.ts
    - src/auth/clients-store.ts
    - src/auth/login-page.ts
    - src/auth/provider.ts
  modified:
    - package.json
    - package-lock.json

decisions:
  - id: auth-01
    decision: "In-memory token/code storage (not SQLite)"
    rationale: "Acceptable for MVP; tokens are ephemeral. Add persistence later if needed."
  - id: auth-02
    decision: "Opaque UUID tokens (not JWT)"
    rationale: "Simpler, revocable immediately, no key management for signing."
  - id: auth-03
    decision: "1-hour access token expiry"
    rationale: "Balance between security (short-lived) and UX (not too frequent re-auth)."
  - id: auth-04
    decision: "String concatenation for HTML (no template literals)"
    rationale: "Avoids shell interpretation issues with dollar-brace syntax in build tooling."

metrics:
  tasks_completed: 3
  tasks_total: 3
  tsc_errors: 0
  files_created: 4
  files_modified: 2
---

# Phase 2 Plan 01: OAuth 2.1 Auth Infrastructure Summary

**One-liner:** AES-256-GCM encrypted credential store + full OAuthServerProvider with PKCE, token rotation, and Odoo API key validation

## What Was Built

### 1. CredentialStore (src/auth/credential-store.ts)
Encrypted SQLite-backed storage for user Odoo API keys:
- PBKDF2 key derivation (100k iterations, SHA-256) from master key env var
- AES-256-GCM encryption with unique 96-bit IV per operation
- GCM auth tag verification for tamper detection
- WAL journal mode for concurrent read performance
- CRUD operations: addOrUpdateUser, getApiKey, deleteUser, userExists

### 2. InMemoryClientsStore (src/auth/clients-store.ts)
SDK-compliant OAuth dynamic client registration store:
- Implements OAuthRegisteredClientsStore interface
- In-memory Map storage (clients re-register on restart)
- getClient and registerClient async methods

### 3. Login Page (src/auth/login-page.ts)
Server-rendered HTML login form:
- Mobile-responsive design (no external dependencies)
- Form fields: email, API key (password type), hidden pending ID
- XSS prevention via HTML entity escaping
- Error message display for failed login attempts
- Help text pointing users to Odoo API key generation

### 4. OdooOAuthProvider (src/auth/provider.ts)
Full OAuthServerProvider implementation (6 required methods):
- **authorize()**: Stores pending auth, redirects to /login
- **challengeForAuthorizationCode()**: Returns stored PKCE challenge
- **exchangeAuthorizationCode()**: Issues access (1h) + refresh tokens
- **exchangeRefreshToken()**: Token rotation (old invalidated, new issued)
- **verifyAccessToken()**: Validates expiry, decrypts Odoo API key, returns AuthInfo
- **revokeToken()**: Removes from both token maps

Additional methods:
- **getPendingAuth/deletePendingAuth**: For login form handler integration
- **completeAuthorization**: Generates auth code after successful login
- **validateOdooCredentials**: Verifies API key against Odoo JSON-2 API

## Key Technical Details

- `expiresAt` is in **seconds** since epoch (SDK requirement, not milliseconds)
- `AuthInfo.extra` contains `{ userId: string, odooApiKey: string }`
- Token rotation: every refresh invalidates old refresh token and issues new pair
- Credential validation calls `res.users` model via OdooClient.searchRead()
- No console.log anywhere (all logging via stderr logger)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` exits 0 (zero type errors)
- AES-256-GCM encryption confirmed in credential-store.ts
- PBKDF2 with 100k iterations confirmed
- WAL mode confirmed
- OAuthServerProvider interface implemented with all 6 methods
- expiresAt uses Math.floor(Date.now() / 1000) consistently
- authorize() redirects to /login (not inline form)
- No console.log, no hardcoded secrets

## Next Phase Readiness

**Ready for 02-02** (Express integration plan):
- OdooOAuthProvider ready to pass to mcpAuthRouter()
- CredentialStore ready to be instantiated with env vars
- Login page ready to be served at GET /login
- Provider's getPendingAuth/completeAuthorization ready for POST /login handler
