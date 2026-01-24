# Phase 2: OAuth 2.1 Authentication - Research

**Researched:** 2026-01-24
**Domain:** MCP SDK OAuth 2.1 server-side implementation
**Confidence:** HIGH

## Summary

The `@modelcontextprotocol/sdk` v1.25.3 provides comprehensive built-in OAuth 2.1 support with Express integration. The SDK exposes an `OAuthServerProvider` interface (6 required methods + 1 optional), an `mcpAuthRouter` Express middleware that mounts all OAuth endpoints automatically, and `requireBearerAuth` middleware that validates Bearer tokens and populates `req.auth` (which flows through to tool handlers via `extra.authInfo`).

The architecture follows a pattern where the MCP server acts as BOTH the OAuth Authorization Server AND the Resource Server (combined mode). The SDK also supports a split mode via `mcpAuthMetadataRouter` where the MCP server is only a Resource Server pointing to an external AS. For our use case (self-contained server with custom credential store), the combined mode using `mcpAuthRouter` + custom `OAuthServerProvider` is the correct approach.

**Primary recommendation:** Implement a custom `OAuthServerProvider` class that stores auth codes/tokens in-memory (or Redis), presents a login form at `/authorize`, maps authenticated users to Odoo API keys stored in an encrypted credential store, and returns the user's identity via `AuthInfo.extra`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.25.0 | OAuth router, bearer auth middleware, type definitions | Official SDK - provides `mcpAuthRouter`, `requireBearerAuth`, all OAuth handlers |
| `express` | ^4.21.0 | HTTP server framework | Already in project; SDK auth is Express-native |
| `jose` | ^6.1.1 | JWT signing/verification (if using JWT tokens) | Already a transitive dep of SDK; standards-compliant JOSE implementation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pkce-challenge` | ^5.0.0 | PKCE verification in token exchange | Already a transitive dep of SDK (auto-used) |
| `express-rate-limit` | ^7.5.0 | Rate limiting on auth endpoints | Already a transitive dep of SDK (auto-applied) |
| `cors` | ^2.8.5 | CORS headers on token/register endpoints | Already a transitive dep of SDK (auto-applied) |
| `cookie-parser` | ^1.4.0 | Parse session cookies in authorize flow | Need for login session persistence |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom OAuthServerProvider | ProxyOAuthServerProvider | Proxy delegates to upstream AS; we ARE the AS |
| In-memory token store | Redis/Postgres | In-memory is fine for MVP; add persistence later |
| Opaque tokens | JWT tokens | JWTs are self-verifying but larger; opaque requires store lookup |

**Installation:**
```bash
npm install cookie-parser @types/cookie-parser
# jose, pkce-challenge, express-rate-limit, cors are already transitive deps of @modelcontextprotocol/sdk
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  auth/
    provider.ts           # OAuthServerProvider implementation
    clients-store.ts      # OAuthRegisteredClientsStore implementation
    token-store.ts        # In-memory token/code storage
    credential-store.ts   # Encrypted Odoo API key storage (per-user)
    login-page.ts         # HTML login form served at /authorize
  server.ts               # Express app with mcpAuthRouter + requireBearerAuth
  mcp/
    index.ts              # McpServer that reads extra.authInfo
```

### Pattern 1: Combined AS + RS with mcpAuthRouter
**What:** Mount `mcpAuthRouter` on Express app root to auto-register all OAuth endpoints, then protect `/mcp` with `requireBearerAuth`.
**When to use:** When the MCP server is its own authorization server (our case).
**Example:**
```typescript
// Source: SDK examples/server/simpleStreamableHttp.js (verified from node_modules)
import { mcpAuthRouter, mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

const provider = new OdooOAuthProvider(credentialStore);
const mcpServerUrl = new URL('https://mcp.example.com/mcp');
const issuerUrl = new URL('https://mcp.example.com');

// Mount OAuth endpoints: /authorize, /token, /register, /revoke,
// /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource/mcp
app.use(mcpAuthRouter({
  provider,
  issuerUrl,
  baseUrl: issuerUrl,           // Optional: base for endpoint URLs
  resourceServerUrl: mcpServerUrl,
  scopesSupported: ['odoo:read', 'odoo:write'],
  resourceName: 'Odoo MCP Server',
}));

// Protect MCP endpoints with Bearer auth
const authMiddleware = requireBearerAuth({
  verifier: provider,  // OAuthServerProvider implements OAuthTokenVerifier
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

app.post('/mcp', authMiddleware, mcpPostHandler);
app.get('/mcp', authMiddleware, mcpGetHandler);
app.delete('/mcp', authMiddleware, mcpDeleteHandler);
```

### Pattern 2: Accessing User Identity in Tool Handlers
**What:** The `requireBearerAuth` middleware sets `req.auth` (type `AuthInfo`). The `StreamableHTTPServerTransport.handleRequest()` reads `req.auth` and passes it through as `extra.authInfo` in tool/resource/prompt callbacks.
**When to use:** Every tool handler that needs to know who the user is.
**Example:**
```typescript
// Source: SDK dist/esm/server/streamableHttp.d.ts + shared/protocol.d.ts (verified)
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

server.registerTool('list-products', {
  description: 'List products from Odoo',
  inputSchema: { limit: z.number().optional() }
}, async (args, extra) => {
  // extra.authInfo is populated by the transport from req.auth
  const authInfo: AuthInfo | undefined = extra.authInfo;
  if (!authInfo) throw new Error('Not authenticated');

  // Access user-specific data from authInfo.extra
  const userId = authInfo.extra?.userId as string;
  const odooApiKey = authInfo.extra?.odooApiKey as string;

  // Use the Odoo API key for this specific user
  const client = clientManager.getClient(odooApiKey);
  // ... make Odoo calls
});
```

### Pattern 3: Login Flow in authorize()
**What:** The `authorize()` method receives the Express `Response` object and MUST redirect to `params.redirectUri` with a `code` and `state` query parameter. In between, it can show a login form, validate credentials, etc.
**When to use:** Implementing the user-facing login step.
**Example:**
```typescript
// Source: SDK examples/server/demoInMemoryOAuthProvider.js (verified)
async authorize(
  client: OAuthClientInformationFull,
  params: AuthorizationParams,
  res: Response
): Promise<void> {
  // Option A: Auto-approve (for testing/trusted clients)
  const code = randomUUID();
  this.codes.set(code, { client, params, userId: 'resolved-user-id' });

  const targetUrl = new URL(params.redirectUri);
  targetUrl.searchParams.set('code', code);
  if (params.state) targetUrl.searchParams.set('state', params.state);
  res.redirect(targetUrl.toString());

  // Option B: Show login form (production)
  // Store pending auth request, redirect to login page
  const pendingId = randomUUID();
  this.pendingAuthorizations.set(pendingId, { client, params });
  res.redirect(`/login?pending=${pendingId}`);
  // After user submits login form -> validate -> generate code -> redirect
}
```

### Anti-Patterns to Avoid
- **Passing upstream tokens to clients:** The MCP server MUST issue its own tokens; never expose the user's Odoo API key as the access token.
- **Skipping PKCE validation:** The SDK validates PKCE by default in `tokenHandler`. Do NOT set `skipLocalPkceValidation: true` unless proxying to an upstream AS.
- **Missing expiresAt in verifyAccessToken:** The `requireBearerAuth` middleware REQUIRES `expiresAt` to be a number (seconds since epoch). If missing or NaN, it throws `InvalidTokenError('Token has no expiration time')`.
- **Storing tokens without expiration:** Always set expiry. The bearer auth middleware rejects tokens with no expiration.
- **Not validating resource parameter:** If using strict mode, validate that `params.resource` in `exchangeAuthorizationCode()` matches your server URL.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth metadata endpoints | Custom `.well-known` routes | `mcpAuthRouter()` | Handles RFC 8414 + RFC 9728 metadata, CORS, rate limiting |
| Bearer token extraction | Custom header parsing | `requireBearerAuth()` | Handles format validation, scope checking, expiry, WWW-Authenticate headers |
| PKCE verification | Custom S256 hashing | SDK's built-in `tokenHandler` | Uses `pkce-challenge` library, handles edge cases |
| Client authentication | Custom client_id/secret validation | SDK's `authenticateClient()` middleware | Handles client_secret_post, none auth methods, expiry checking |
| Dynamic client registration | Custom /register endpoint | `clientRegistrationHandler()` | Validates metadata schema, generates client_id/secret, handles rate limiting |
| Rate limiting on auth endpoints | Custom rate limit logic | SDK auto-applies `express-rate-limit` | 100/15min for authorize, 50/15min for token, 20/hr for register |
| Token revocation endpoint | Custom /revoke route | `revocationHandler()` | Validates client, calls provider.revokeToken, handles errors |

**Key insight:** The SDK's `mcpAuthRouter()` sets up ALL OAuth endpoints with proper middleware chains (CORS, rate limiting, method validation, client auth). Hand-rolling any of these means missing security features.

## Common Pitfalls

### Pitfall 1: Token Expiration Format
**What goes wrong:** `verifyAccessToken()` returns `expiresAt` in milliseconds instead of seconds, or as a Date object.
**Why it happens:** The `AuthInfo.expiresAt` field is documented as "seconds since epoch" but developers naturally use `Date.now()`.
**How to avoid:** Always divide by 1000: `expiresAt: Math.floor(Date.now() / 1000) + 3600`
**Warning signs:** Bearer auth returns "Token has no expiration time" even though you set it.

### Pitfall 2: Missing HTTPS for Issuer URL
**What goes wrong:** Server crashes on startup with "Issuer URL must be HTTPS".
**Why it happens:** RFC 8414 requires HTTPS issuer URLs. The SDK enforces this.
**How to avoid:** For development, set `MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL=true` or use `localhost`/`127.0.0.1` (exempted).
**Warning signs:** Works locally but fails in staging/production.

### Pitfall 3: req.auth Not Flowing to Transport
**What goes wrong:** `extra.authInfo` is undefined in tool handlers despite bearer auth passing.
**Why it happens:** The `StreamableHTTPServerTransport.handleRequest()` reads `req.auth` and passes it to the web standard transport. If you're using a custom middleware that overwrites or doesn't set `req.auth`, it breaks.
**How to avoid:** Place `requireBearerAuth` middleware BEFORE the route handler. Don't mutate `req.auth` after it's set.
**Warning signs:** Authentication works (401s are correct) but tools can't access user info.

### Pitfall 4: mcpAuthRouter Must Be at App Root
**What goes wrong:** OAuth endpoints return 404.
**Why it happens:** The router creates Express routes at absolute paths like `/authorize`, `/token`, `/.well-known/oauth-authorization-server`. If mounted at a sub-path (e.g., `app.use('/auth', mcpAuthRouter(...))`), paths become `/auth/authorize` which clients don't expect.
**How to avoid:** Always `app.use(mcpAuthRouter(...))` at root, never with a path prefix.
**Warning signs:** Clients fail discovery, metadata endpoint returns 404.

### Pitfall 5: Redirect URI Validation
**What goes wrong:** Authorization fails with "Unregistered redirect_uri".
**Why it happens:** The authorize handler checks that the provided `redirect_uri` exactly matches one in `client.redirect_uris`. Claude clients use specific callback URLs.
**How to avoid:** Store exact redirect URIs during client registration. For Claude clients, register the exact callback URLs they use.
**Warning signs:** Dynamic client registration works but authorization fails.

### Pitfall 6: Missing challengeForAuthorizationCode
**What goes wrong:** Token exchange fails with "Invalid authorization code" or PKCE verification fails.
**Why it happens:** `challengeForAuthorizationCode()` must return the original `codeChallenge` that was passed to `authorize()`. If you don't store it with the authorization code, PKCE verification fails.
**How to avoid:** In `authorize()`, store `params.codeChallenge` alongside the authorization code. Return it from `challengeForAuthorizationCode()`.
**Warning signs:** Authorization succeeds (redirect with code) but token exchange fails.

### Pitfall 7: Express 5 vs Express 4
**What goes wrong:** SDK uses `express@^5.0.1` internally but project uses `express@^4.21.0`.
**Why it happens:** The SDK bundles Express 5 as a dependency. Express 5 has breaking changes in router behavior.
**How to avoid:** This is fine -- the SDK's internal Express routers work with Express 4 apps since they're just middleware. However, be aware that `res.cookie` syntax differs slightly.
**Warning signs:** None typically, but watch for subtle Express 5 vs 4 API differences if copying SDK example code.

## Code Examples

### Complete OAuthServerProvider Implementation Pattern
```typescript
// Source: Synthesized from SDK types + demoInMemoryOAuthProvider.js (verified)
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';

interface CodeData {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  userId: string;           // Resolved after login
}

interface TokenData {
  clientId: string;
  userId: string;
  scopes: string[];
  expiresAt: number;        // Seconds since epoch
  resource?: URL;
}

export class OdooOAuthProvider implements OAuthServerProvider {
  private codes = new Map<string, CodeData>();
  private tokens = new Map<string, TokenData>();
  private refreshTokens = new Map<string, { userId: string; clientId: string; scopes: string[] }>();
  private pendingAuthorizations = new Map<string, { client: OAuthClientInformationFull; params: AuthorizationParams }>();

  constructor(
    public readonly clientsStore: OAuthRegisteredClientsStore,
    private readonly credentialStore: CredentialStore,
  ) {}

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Store pending authorization, redirect to login page
    const pendingId = randomUUID();
    this.pendingAuthorizations.set(pendingId, { client, params });
    res.redirect(`/login?pending=${pendingId}`);
    // Login form handler will:
    // 1. Validate user credentials against Odoo
    // 2. Generate authorization code
    // 3. Store code with userId
    // 4. Redirect to params.redirectUri with code + state
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) throw new Error('Invalid authorization code');
    return codeData.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,  // PKCE already verified by SDK
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) throw new Error('Invalid authorization code');
    if (codeData.client.client_id !== client.client_id) {
      throw new Error('Code not issued to this client');
    }
    this.codes.delete(authorizationCode);

    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const expiresIn = 3600; // 1 hour

    this.tokens.set(accessToken, {
      clientId: client.client_id,
      userId: codeData.userId,
      scopes: codeData.params.scopes || [],
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      resource: codeData.params.resource,
    });

    this.refreshTokens.set(refreshToken, {
      userId: codeData.userId,
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
    });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: (codeData.params.scopes || []).join(' '),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const data = this.refreshTokens.get(refreshToken);
    if (!data || data.clientId !== client.client_id) {
      throw new Error('Invalid refresh token');
    }

    // Rotate refresh token
    this.refreshTokens.delete(refreshToken);
    const newRefreshToken = randomUUID();
    const newAccessToken = randomUUID();
    const expiresIn = 3600;

    const finalScopes = scopes || data.scopes;

    this.tokens.set(newAccessToken, {
      clientId: client.client_id,
      userId: data.userId,
      scopes: finalScopes,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      resource,
    });

    this.refreshTokens.set(newRefreshToken, {
      userId: data.userId,
      clientId: client.client_id,
      scopes: finalScopes,
    });

    return {
      access_token: newAccessToken,
      token_type: 'bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: finalScopes.join(' '),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const data = this.tokens.get(token);
    if (!data) throw new Error('Invalid token');
    if (data.expiresAt < Math.floor(Date.now() / 1000)) {
      this.tokens.delete(token);
      throw new Error('Token expired');
    }

    // Resolve the user's Odoo API key from the credential store
    const odooApiKey = await this.credentialStore.getApiKey(data.userId);

    return {
      token,
      clientId: data.clientId,
      scopes: data.scopes,
      expiresAt: data.expiresAt,  // MUST be seconds since epoch
      resource: data.resource,
      extra: {
        userId: data.userId,
        odooApiKey,  // Available in tool handlers as extra.authInfo.extra.odooApiKey
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    // Try both token maps
    this.tokens.delete(request.token);
    this.refreshTokens.delete(request.token);
  }
}
```

### Express App Integration Pattern
```typescript
// Source: SDK examples/server/simpleStreamableHttp.js + router.js (verified)
import express from 'express';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
app.use(express.json());

const mcpServerUrl = new URL(process.env.MCP_SERVER_URL || 'https://mcp.example.com/mcp');
const issuerUrl = new URL(process.env.ISSUER_URL || 'https://mcp.example.com');

// 1. Mount OAuth router at app root (creates /authorize, /token, /register, /revoke, /.well-known/*)
app.use(mcpAuthRouter({
  provider: oauthProvider,
  issuerUrl,
  resourceServerUrl: mcpServerUrl,
  scopesSupported: ['odoo:read', 'odoo:write'],
  resourceName: 'Odoo MCP Server',
}));

// 2. Create bearer auth middleware
const bearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

// 3. Protected MCP endpoints
app.post('/mcp', bearerAuth, async (req, res) => {
  // req.auth is now populated with AuthInfo
  // StreamableHTTPServerTransport.handleRequest reads req.auth automatically
  await transport.handleRequest(req, res, req.body);
});

// 4. Login form endpoint (called from authorize() redirect)
app.get('/login', (req, res) => {
  res.send(loginFormHtml(req.query.pending as string));
});

app.post('/login', async (req, res) => {
  const { pending, username, password } = req.body;
  // Validate against Odoo, generate code, redirect to client
});
```

### Well-Known Metadata Response (Auto-Generated)
```json
// GET /.well-known/oauth-authorization-server
// Source: SDK router.js createOAuthMetadata() (verified)
{
  "issuer": "https://mcp.example.com",
  "authorization_endpoint": "https://mcp.example.com/authorize",
  "token_endpoint": "https://mcp.example.com/token",
  "registration_endpoint": "https://mcp.example.com/register",
  "revocation_endpoint": "https://mcp.example.com/revoke",
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "scopes_supported": ["odoo:read", "odoo:write"],
  "service_documentation": "https://docs.example.com"
}
```

```json
// GET /.well-known/oauth-protected-resource/mcp
// Source: SDK router.js mcpAuthMetadataRouter() (verified)
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://mcp.example.com"],
  "scopes_supported": ["odoo:read", "odoo:write"],
  "resource_name": "Odoo MCP Server",
  "resource_documentation": "https://docs.example.com"
}
```

### OAuthRegisteredClientsStore Implementation
```typescript
// Source: SDK dist/esm/server/auth/clients.d.ts (verified)
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

export class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): Promise<OAuthClientInformationFull> {
    // client_id and client_id_issued_at are already set by the SDK's register handler
    const fullClient = client as OAuthClientInformationFull;
    this.clients.set(fullClient.client_id, fullClient);
    return fullClient;
  }
}
```

## Key TypeScript Interfaces (Exact from SDK)

### AuthInfo
```typescript
// Source: @modelcontextprotocol/sdk/server/auth/types.js
export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;             // Seconds since epoch (REQUIRED by bearer middleware)
  resource?: URL;                  // RFC 8707 resource indicator
  extra?: Record<string, unknown>; // Custom data (userId, odooApiKey, etc.)
}
```

### OAuthServerProvider
```typescript
// Source: @modelcontextprotocol/sdk/server/auth/provider.js
export interface OAuthServerProvider {
  get clientsStore(): OAuthRegisteredClientsStore;
  authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
  challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string>;
  exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, codeVerifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens>;
  exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL): Promise<OAuthTokens>;
  verifyAccessToken(token: string): Promise<AuthInfo>;
  revokeToken?(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void>;
  skipLocalPkceValidation?: boolean;  // Only true for proxy providers
}
```

### AuthorizationParams
```typescript
// Source: @modelcontextprotocol/sdk/server/auth/provider.js
export type AuthorizationParams = {
  state?: string;
  scopes?: string[];
  codeChallenge: string;
  redirectUri: string;
  resource?: URL;
};
```

### OAuthTokens
```typescript
// Source: Inferred from OAuthTokensSchema in shared/auth.d.ts
export type OAuthTokens = {
  access_token: string;
  token_type: string;        // Usually "bearer"
  expires_in?: number;       // Seconds until expiry
  scope?: string;            // Space-separated scopes
  refresh_token?: string;
  id_token?: string;         // OpenID Connect
};
```

### RequestHandlerExtra (Tool Callback)
```typescript
// Source: @modelcontextprotocol/sdk/shared/protocol.d.ts
export type RequestHandlerExtra<...> = {
  signal: AbortSignal;
  authInfo?: AuthInfo;          // Populated from req.auth via transport
  sessionId?: string;
  sendRequest(...): Promise<...>;
  sendNotification(...): Promise<void>;
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP server = full AS | MCP server = RS with external AS | MCP spec 2025-06-18 | SDK supports both; combined is simpler for self-contained servers |
| Custom .well-known endpoints | `mcpAuthRouter` auto-mounts them | SDK 1.x | No manual endpoint registration needed |
| Token passed via custom header | Bearer token in Authorization header | OAuth 2.1 / MCP spec | Standard Bearer auth required |
| Session-based API key auth | OAuth 2.1 token flow | Current spec | Enables multi-client support (iOS, web, desktop) |

**Deprecated/outdated:**
- Custom `x-odoo-api-key` header: Replaced by OAuth flow; API key now lives in credential store mapped via userId
- Session-only auth: OAuth tokens work across reconnections

## OAuth Flow Sequence (MCP-Specific)

1. **Client connects** to `POST /mcp` without token
2. **Server returns** `401 Unauthorized` with `WWW-Authenticate: Bearer resource_metadata="..."`
3. **Client discovers** metadata at `/.well-known/oauth-protected-resource/mcp`
4. **Client discovers** AS metadata at `/.well-known/oauth-authorization-server`
5. **Client registers** via `POST /register` (Dynamic Client Registration)
6. **Client redirects** user to `GET /authorize?client_id=...&code_challenge=...&redirect_uri=...`
7. **Server shows** login form (our custom HTML page)
8. **User logs in** with Odoo credentials
9. **Server validates** credentials against Odoo, generates auth code
10. **Server redirects** to `redirect_uri?code=...&state=...`
11. **Client exchanges** code at `POST /token` with `code_verifier`
12. **Server validates** PKCE, issues access_token + refresh_token
13. **Client sends** MCP requests with `Authorization: Bearer <token>`
14. **Bearer middleware** validates token, sets `req.auth`
15. **Transport** passes `req.auth` as `extra.authInfo` to tool handlers
16. **Tool handlers** read `extra.authInfo.extra.odooApiKey` to make Odoo calls

## Open Questions

1. **Token persistence across server restarts**
   - What we know: In-memory store loses all tokens on restart
   - What's unclear: Acceptable for MVP? Or need Redis from day 1?
   - Recommendation: Start in-memory, add Redis/SQLite later as needed

2. **Login form UX**
   - What we know: `authorize()` must eventually redirect with a code
   - What's unclear: Render server-side HTML? Redirect to separate login app?
   - Recommendation: Simple server-rendered HTML form initially; can upgrade to SPA later

3. **Credential store encryption**
   - What we know: User's Odoo API keys must be stored encrypted
   - What's unclear: Key management strategy (env var? KMS?)
   - Recommendation: AES-256-GCM with key from environment variable for MVP

4. **Refresh token rotation**
   - What we know: OAuth 2.1 MUST rotate refresh tokens for public clients
   - What's unclear: How do Claude clients handle rotation?
   - Recommendation: Always rotate; SDK handles the response format

5. **Multiple Odoo instances**
   - What we know: Current server targets a single Odoo instance
   - What's unclear: Need multi-tenant support?
   - Recommendation: Defer; single instance per deployment for now

## Sources

### Primary (HIGH confidence)
- `@modelcontextprotocol/sdk` v1.25.3 source code in `node_modules/` - All type definitions, handler implementations, and examples verified directly
- SDK `dist/esm/server/auth/provider.d.ts` - OAuthServerProvider interface
- SDK `dist/esm/server/auth/types.d.ts` - AuthInfo interface
- SDK `dist/esm/server/auth/router.js` - mcpAuthRouter implementation
- SDK `dist/esm/server/auth/middleware/bearerAuth.js` - requireBearerAuth implementation
- SDK `dist/esm/server/streamableHttp.d.ts` - handleRequest(req: { auth?: AuthInfo }) signature
- SDK `dist/esm/shared/protocol.d.ts` - RequestHandlerExtra with authInfo
- SDK `dist/esm/examples/server/demoInMemoryOAuthProvider.js` - Reference implementation
- SDK `dist/esm/examples/server/simpleStreamableHttp.js` - Full integration example

### Secondary (MEDIUM confidence)
- MCP Specification - Authorization (draft): https://modelcontextprotocol.io/specification/draft/basic/authorization
- NapthaAI/http-oauth-mcp-server: https://github.com/NapthaAI/http-oauth-mcp-server

### Tertiary (LOW confidence)
- MCP Auth library: https://mcp-auth.dev/docs
- Cloudflare Agents OAuth docs: https://developers.cloudflare.com/agents/model-context-protocol/authorization/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified directly from SDK source in node_modules
- Architecture: HIGH - Verified from SDK examples and type definitions
- Pitfalls: HIGH - Derived from reading actual middleware source code
- Code examples: HIGH - Synthesized from verified SDK source, not training data

**Research date:** 2026-01-24
**Valid until:** 2026-03-24 (SDK is stable; check for major version bumps)
