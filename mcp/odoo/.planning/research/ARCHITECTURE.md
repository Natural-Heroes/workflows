# Architecture Patterns

**Domain:** Multi-user MCP server with OAuth 2.1, per-user Odoo XML-RPC backend
**Researched:** 2026-01-23
**Overall confidence:** HIGH

## Executive Summary

The core architectural challenge is bridging the gap between the mrpeasy/Perdoo single-API-key pattern and the per-user authentication required by this project. The MCP SDK (v1.15.0+) provides built-in support for this through `requireBearerAuth` middleware and the `authInfo` field on `RequestHandlerExtra`, which was stabilized in PR #399. The OAuth 2.1 flow is well-specified by the MCP authorization spec (2025-03-26) and multiple production implementations exist as reference.

The recommended architecture is a **three-layer system**: Express + MCP SDK (transport/auth layer), an OAuth authorization server (either embedded or Keycloak), and a per-user Odoo XML-RPC service layer that creates or retrieves client instances based on the authenticated user's identity.

---

## Recommended Architecture

### High-Level Component Diagram

```
+------------------+         +---------------------+
|  Claude Client   |         |   OAuth Provider    |
|  (iOS/Web/Code)  |         |   (embedded in      |
|                  |         |    MCP server)       |
+--------+---------+         +---------+-----------+
         |                              |
         | 1. Bearer token in           | 4. JWT validation
         |    Authorization header      |    (local, self-issued)
         v                              v
+--------+----------------------------------+---------+
|                  MCP SERVER                          |
|                                                      |
|  +------------------+    +-----------------------+   |
|  | Express Layer    |    | Auth Middleware       |   |
|  | - POST /mcp      |--->| - requireBearerAuth  |   |
|  | - GET /mcp (SSE) |    | - token validation   |   |
|  | - DELETE /mcp     |    | - user extraction    |   |
|  | - GET /health     |    +-----------+----------+   |
|  +------------------+                |               |
|                                      v               |
|  +------------------+    +-----------+----------+    |
|  | Session Store    |    | MCP Server (McpServer)|   |
|  | Map<id,transport>|    | - tool registration  |   |
|  +------------------+    | - resource serving   |   |
|                          +-----------+----------+    |
|                                      |               |
|                          +-----------v----------+    |
|                          | Tool Handlers        |    |
|                          | (7 domain files)     |    |
|                          | - accounting.ts      |    |
|                          | - hr.ts              |    |
|                          | - expenses.ts        |    |
|                          | - knowledge.ts       |    |
|                          | - projects.ts        |    |
|                          | - decisions.ts       |    |
|                          | - approvals.ts       |    |
|                          +-----------+----------+    |
|                                      |               |
|                          +-----------v----------+    |
|                          | Odoo Service Layer   |    |
|                          | - OdooClient class   |    |
|                          | - Per-user instances  |    |
|                          | - Circuit breaker    |    |
|                          | - Rate limiter       |    |
|                          +-----------+----------+    |
+------------------------------------------------------+
                                       |
                                       | XML-RPC
                                       v
                            +----------+---------+
                            |   Odoo 19          |
                            |   (Odoo.sh)        |
                            |   /xmlrpc/2/common |
                            |   /xmlrpc/2/object |
                            +--------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Express Layer | HTTP routing, health check, CORS, body parsing | Auth Middleware, Session Store |
| Auth Middleware | Token validation, user identity extraction | OAuth Provider (local JWT verify), Express Layer |
| OAuth Provider | `/authorize`, `/token`, `/register`, `/.well-known/*` endpoints | Claude Client (authorization), Odoo (credential validation) |
| Session Store | Map session IDs to transports, cleanup on close | Express Layer, MCP Server |
| MCP Server | Protocol handling, tool/resource registration | Tool Handlers |
| Tool Handlers | Business logic per domain, input validation, response formatting | Odoo Service Layer |
| Odoo Service Layer | XML-RPC communication, credential management, resilience | Odoo 19 instance |
| Credential Store | Maps OAuth `sub` (user ID) to Odoo API key (encrypted) | OAuth Provider, Odoo Service Layer |

---

## Per-User Authentication Flow

### The Key Insight

The mrpeasy pattern creates ONE `MrpEasyClient` from env vars (line 127 of tools/index.ts: `const client = createMrpEasyClient()`). For per-user Odoo auth, the client must be created **per-session** based on the authenticated user's identity.

### Flow: Claude --> OAuth --> MCP --> Odoo

```
Step 1: Discovery (one-time per client registration)
  Claude --GET--> /.well-known/oauth-protected-resource
  Response: { resource, authorization_servers, scopes_supported }

  Claude --GET--> /.well-known/oauth-authorization-server
  Response: { issuer, authorization_endpoint, token_endpoint, registration_endpoint }

Step 2: Authorization (one-time per user)
  Claude --POST--> /register (Dynamic Client Registration)
  Claude --browser--> /authorize (user logs in, grants consent)
  OAuth Provider --redirect--> Claude callback (with auth code)
  Claude --POST--> /token (exchange code for access_token + refresh_token)

Step 3: Every MCP Request
  Claude --POST--> /mcp
    Headers: Authorization: Bearer <access_token>
             Mcp-Session-Id: <session-id> (after initialization)

  Express receives request
  --> requireBearerAuth middleware validates token
  --> Extracts user identity (sub claim from self-issued JWT)
  --> Populates req.auth with { token, clientId, scopes, extra: { userId, odooUid } }

  --> If new session (isInitializeRequest):
      Creates StreamableHTTPServerTransport
      Creates McpServer
      Binds user context to session

  --> Tool handler receives (args, extra: RequestHandlerExtra)
      extra.authInfo.extra.userId --> lookup Odoo API key
      --> Create or retrieve OdooClient for this user
      --> Execute XML-RPC call AS this user
      --> Return formatted response
```

### authInfo Flow in Detail (HIGH confidence - verified via SDK source and issue #397)

The MCP SDK's `requireBearerAuth` middleware from `@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js`:

1. Extracts `Authorization: Bearer <token>` header
2. Calls your `verifier.verifyAccessToken(token)` function
3. Your verifier returns: `{ token, clientId, scopes, expiresAt, extra: { userId, ... } }`
4. The middleware attaches this as `req.auth` on the Express request
5. The SDK's transport layer propagates this to `RequestHandlerExtra.authInfo`
6. Tool handlers access it via the second parameter: `async (args, extra) => { extra.authInfo?.extra?.userId }`

**Critical**: The `extra` field is where you put custom per-user data (Odoo user ID, email, etc.) that the tool handlers need.

---

## OAuth 2.1 Architecture Decision: Embedded vs External

### Option A: Embedded OAuth Provider (RECOMMENDED for this project)

The MCP server itself implements the OAuth endpoints (`/authorize`, `/token`, `/register`). For a small internal team (Natural Heroes), this is the pragmatic choice.

**Architecture:**
```
MCP Server (single container)
  |-- /.well-known/oauth-protected-resource  (metadata)
  |-- /.well-known/oauth-authorization-server (metadata)
  |-- /authorize  (login page, consent)
  |-- /token      (code exchange, refresh)
  |-- /register   (dynamic client registration)
  |-- /mcp        (MCP protocol endpoint)
  +-- /health     (health check)
```

**Why embedded:**
- Single Docker container on Dokploy (simpler deployment)
- Small team (5-10 users), no need for enterprise IdP
- Full control over the credential mapping logic
- The MCP spec explicitly supports "MCP server as both resource server and authorization server"

**Implementation approach:**
- Simple login form at `/authorize` (user enters Odoo email + API key)
- Server validates against Odoo XML-RPC (`/xmlrpc/2/common` authenticate endpoint)
- Issues JWT access token with user's Odoo UID as `sub` claim
- Stores `sub` --> Odoo API key mapping in SQLite (encrypted)
- Token validation is local JWT verification (no introspection needed since we issue the tokens)

### Option B: External OAuth Provider (Keycloak)

A separate Keycloak container handles auth, the MCP server does token introspection.

**Why NOT for this project:**
- Two containers to deploy and maintain
- Keycloak is complex for 5-10 users
- Still need a credential mapping layer (Keycloak user --> Odoo API key)
- Adds infrastructure complexity without proportional benefit

### Recommendation

Use **Option A (Embedded OAuth)** because:
1. Single container on Dokploy
2. Natural Heroes is a small team
3. The "login" is just validating Odoo credentials -- Odoo IS the identity provider
4. Simpler credential mapping (the OAuth flow itself captures the Odoo API key)

---

## User --> Odoo Credential Mapping

### The Core Problem

Claude authenticates to our MCP server via OAuth. Our MCP server must then authenticate to Odoo as that specific user. Where is the mapping stored?

### Recommended Approach: Odoo as Source of Truth

```
Registration Flow:
  1. User navigates to /authorize (redirected by Claude)
  2. User enters their Odoo login (email) and Odoo API key
  3. MCP server validates credentials against Odoo:
     POST /xmlrpc/2/common -> authenticate(db, login, apiKey)
     Returns: uid (Odoo user ID) or false
  4. If valid, MCP server stores the mapping:
     { oauthSub: <generated-uuid>, odooLogin: "user@company.com",
       odooUid: 42, odooApiKey: <encrypted> }
  5. Issues JWT with sub = <generated-uuid>
  6. Returns auth code to Claude (which exchanges for access token)

Subsequent requests:
  1. Claude sends Bearer token
  2. MCP server validates JWT, extracts sub
  3. Looks up credential mapping: sub -> odooApiKey (decrypt)
  4. Creates OdooClient with that user's API key
  5. All XML-RPC calls execute as that Odoo user
```

### Storage Options for Credential Mapping

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| SQLite file | Simple, no extra service, ACID, queryable | Need backup, single-node | RECOMMENDED |
| Encrypted JSON file | Simplest possible | No concurrent access, no query | OK for < 10 users |
| PostgreSQL | Full SQL, existing infra | Another container, overkill | Too complex |
| Odoo itself | No external storage | Complex to query, circular dep | Avoid |

**Recommendation: SQLite** via `better-sqlite3` (synchronous, fast, zero-config). Schema:
- `user_id` TEXT PRIMARY KEY (OAuth sub, UUID)
- `odoo_login` TEXT NOT NULL (email)
- `odoo_uid` INTEGER NOT NULL
- `odoo_api_key_encrypted` TEXT NOT NULL (AES-256-GCM)
- `odoo_api_key_iv` TEXT NOT NULL (unique IV per key)
- `created_at` TEXT NOT NULL
- `last_used_at` TEXT

### Encryption

API keys at rest MUST be encrypted. Use `aes-256-gcm` with a server-side key from environment variable (`ENCRYPTION_KEY`). Each key gets a unique IV stored alongside. The encryption key should be 32 bytes (64 hex chars).

---

## XML-RPC Client Architecture

### Per-Session vs Per-Request vs Pooled

| Strategy | Description | Verdict |
|----------|-------------|---------|
| Per-request | New client every tool call | Wasteful, no caching of uid |
| Per-session | One client per MCP session, reused across tool calls | Good, but sessions are ephemeral |
| LRU cache | Cache of clients keyed by userId, evicted after idle | RECOMMENDED |

**Recommendation: LRU cache keyed by userId.**

Each tool call looks up the user's OdooClient from the LRU cache. If not cached, create from credential store. Evict after 30 minutes of inactivity. This survives session restarts (user reconnects, gets same cached client).

### OdooClient Design

```typescript
interface OdooClientConfig {
  url: string;          // https://naturalheroes-odoo.odoo.com
  db: string;           // production database name
  login: string;        // user's Odoo login (email)
  apiKey: string;       // user's Odoo API key (used as password in XML-RPC)
}

class OdooClient {
  private uid: number | null = null;

  // Authenticate (lazy, on first call)
  async authenticate(): Promise<number>

  // Generic execute_kw wrapper
  async execute<T>(
    model: string,
    method: string,
    args: any[],
    kwargs?: Record<string, any>
  ): Promise<T>

  // Convenience methods
  async searchRead<T>(model: string, domain: any[][], fields: string[], options?: SearchReadOptions): Promise<T[]>
  async read<T>(model: string, ids: number[], fields: string[]): Promise<T[]>
  async create(model: string, vals: Record<string, any>): Promise<number>
  async write(model: string, ids: number[], vals: Record<string, any>): Promise<boolean>
  async unlink(model: string, ids: number[]): Promise<boolean>
}
```

### XML-RPC Protocol Details (Odoo 19)

Odoo 19 still supports XML-RPC at `/xmlrpc/2/common` and `/xmlrpc/2/object`, scheduled for removal in Odoo 20 (fall 2026). This gives 1+ year of stable API.

**Authentication:**
```
POST /xmlrpc/2/common
Method: authenticate
Args: [db, login, apiKey, {}]
Returns: uid (integer) or false
```

**execute_kw:**
```
POST /xmlrpc/2/object
Method: execute_kw
Args: [db, uid, apiKey, model, method, positionalArgs, keywordArgs]
Returns: varies by method
```

**Key point**: The API key is passed in the `password` field. Odoo's `_check_credentials` method handles both passwords and API keys transparently.

### XML-RPC Library Choice

| Library | TypeScript | Async | Maintenance | Recommendation |
|---------|-----------|-------|-------------|----------------|
| `odoo-xmlrpc-ts` | Native | Yes | Low activity | Reference only |
| `@tapni/odoo-xmlrpc` | Yes | Yes | Active | Viable |
| Raw `xmlrpc` npm | Needs types | Callback | Stable | Encoding only |
| Custom fetch-based | Full control | Yes | Self | RECOMMENDED |

**Recommendation: Custom XML-RPC client using native `fetch`.**

Rationale:
- XML-RPC is a simple protocol (HTTP POST with XML body)
- Existing libraries are thin wrappers with uncertain maintenance
- Full control over error handling, retries, timeouts
- No dependency on potentially unmaintained packages
- Can reuse resilience patterns from mrpeasy (circuit breaker, rate limiter)
- TypeScript-native from the start
- Use `xmlrpc` npm package only for XML encoding/decoding, or implement the small subset needed (Odoo uses: int, string, boolean, array, struct, nil, base64, double, dateTime)

---

## Resilience Patterns (from mrpeasy)

### Which to Adopt

| Pattern | mrpeasy Has | Adopt for Odoo? | Rationale |
|---------|-------------|-----------------|-----------|
| Circuit Breaker | Yes | YES | Protects against Odoo.sh downtime |
| Rate Limiter | Yes (100/10s) | YES (adapt limit) | Odoo.sh may throttle |
| Retry with backoff | Yes (429, 503) | YES | Transient XML-RPC failures |
| Request Queue | Yes (max 1 concurrent) | NO | Per-user, not global bottleneck |

### Placement

Resilience should be at the **OdooClient level**, not the tool level:

```
Tool Handler
  -> OdooClient.searchRead(...)
    -> circuitBreaker.execute(...)
      -> withRetry(...)
        -> rateLimiter.waitForToken()
          -> xmlrpcCall(...)
```

### Per-User vs Global Resilience

- **Rate limiter**: Global (Odoo.sh has server-wide limits)
- **Circuit breaker**: Global (if Odoo is down, it is down for everyone)
- **Retry**: Per-request (individual transient failures)

---

## Tool Handler Pattern (Per-User Context)

### How Tool Handlers Get User Context

The critical difference from mrpeasy: tool handlers receive user identity via `extra.authInfo`.

**mrpeasy pattern (SINGLE user):**
```typescript
export function registerOrderTools(server: McpServer, client: MrpEasyClient): void {
  server.tool('get_orders', '...', schema, async (params) => {
    const orders = await client.getOrders(params); // single shared client
    return { content: [...] };
  });
}
```

**Odoo pattern (PER user):**
```typescript
export function registerAccountingTools(server: McpServer, clientManager: OdooClientManager): void {
  server.tool('get_invoices', '...', schema, async (params, extra) => {
    const userId = extra.authInfo?.extra?.userId;
    if (!userId) throw new Error('Not authenticated');

    const client = await clientManager.getClient(userId);
    const invoices = await client.searchRead('account.move', [...], [...]);
    return { content: [...] };
  });
}
```

### OdooClientManager

```typescript
class OdooClientManager {
  private cache: LRUCache<string, OdooClient>;
  private credentialStore: CredentialStore;

  async getClient(userId: string): Promise<OdooClient> {
    let client = this.cache.get(userId);
    if (!client) {
      const creds = await this.credentialStore.getCredentials(userId);
      if (!creds) throw new Error('No Odoo credentials found for user');
      client = new OdooClient({
        url: config.ODOO_URL,
        db: config.ODOO_DB,
        login: creds.odooLogin,
        apiKey: creds.odooApiKey,
      });
      this.cache.set(userId, client);
    }
    return client;
  }
}
```

---

## Session Architecture

### Session Lifecycle

```
1. Claude sends Initialize request (no Mcp-Session-Id header)
   -> Express receives POST /mcp
   -> requireBearerAuth validates token, populates req.auth
   -> New StreamableHTTPServerTransport created
   -> New McpServer created, tools registered with clientManager
   -> Session ID generated (UUID), stored in Map
   -> Response includes Mcp-Session-Id header

2. Claude sends tool calls (with Mcp-Session-Id header)
   -> Express receives POST /mcp
   -> requireBearerAuth validates token (EVERY request, per spec)
   -> Existing transport found in Map
   -> transport.handleRequest() routes to tool handler
   -> Tool handler accesses extra.authInfo for user context

3. Session closes
   -> Claude sends DELETE /mcp (or session times out)
   -> Transport cleaned up, removed from Map
   -> OdooClient stays in LRU cache (may serve future sessions)
```

### Session Security

Per the MCP spec: "Treat Mcp-Session-Id as untrusted input; never tie authorization to it."

Authorization is ALWAYS from the Bearer token, not the session. The session is purely for transport continuity (maintaining SSE connections, tracking active sessions). A user cannot hijack another user's session because every request requires a valid Bearer token.

---

## Patterns to Follow

### Pattern 1: Higher-Order Auth Wrapper

Wrap all tool handlers to enforce authentication and provide typed Odoo client access.

```typescript
type AuthenticatedToolHandler<T> = (
  args: T,
  client: OdooClient,
  userContext: { userId: string; odooUid: number }
) => Promise<CallToolResult>;

function withOdooAuth<T>(
  clientManager: OdooClientManager,
  handler: AuthenticatedToolHandler<T>
) {
  return async (args: T, extra: RequestHandlerExtra): Promise<CallToolResult> => {
    const userId = extra.authInfo?.extra?.userId;
    if (!userId) {
      return {
        content: [{ type: 'text', text: 'Authentication required. Please reconnect.' }],
        isError: true,
      };
    }

    const client = await clientManager.getClient(userId);
    const odooUid = extra.authInfo?.extra?.odooUid;

    return handler(args, client, { userId, odooUid });
  };
}
```

**Usage:**
```typescript
server.tool('get_invoices', '...', schema,
  withOdooAuth(clientManager, async (args, client, ctx) => {
    const invoices = await client.searchRead('account.move',
      [['move_type', '=', 'out_invoice'], ['state', '=', args.status ?? 'posted']],
      ['name', 'partner_id', 'amount_total', 'state', 'invoice_date']
    );
    return { content: [{ type: 'text', text: formatInvoices(invoices) }] };
  })
);
```

### Pattern 2: Credential-at-Auth-Time Capture

During OAuth authorization, capture and store the user's Odoo API key:

```typescript
// In /authorize handler - renders login form
app.get('/authorize', (req, res) => {
  res.render('authorize', {
    client_id: req.query.client_id,
    state: req.query.state,
    redirect_uri: req.query.redirect_uri,
    code_challenge: req.query.code_challenge,
  });
});

// User submits Odoo credentials
app.post('/authorize', async (req, res) => {
  const { email, apiKey, state, redirect_uri, code_challenge } = req.body;

  // Validate against Odoo
  const uid = await odooAuthenticate(config.ODOO_URL, config.ODOO_DB, email, apiKey);
  if (!uid) return res.status(401).render('authorize', { error: 'Invalid Odoo credentials' });

  // Store credential mapping
  const userId = randomUUID();
  await credentialStore.save({
    userId,
    odooLogin: email,
    odooUid: uid,
    odooApiKey: apiKey  // encrypted by store
  });

  // Generate auth code bound to userId + code_challenge
  const code = generateAuthCode(userId, code_challenge);
  res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
});
```

### Pattern 3: createMcpServer with ClientManager

Unlike mrpeasy (which passes a single client), pass the ClientManager:

```typescript
export function createMcpServer(clientManager: OdooClientManager): McpServer {
  const server = new McpServer({
    name: 'odoo-mcp',
    version: '1.0.0',
    description: 'Odoo ERP integration for Natural Heroes team.',
  });

  // Register instructions resource
  server.resource('instructions', 'odoo://instructions', { ... }, async () => ({ ... }));

  // Register all tool domains
  registerAccountingTools(server, clientManager);
  registerHrTools(server, clientManager);
  registerExpenseTools(server, clientManager);
  registerKnowledgeTools(server, clientManager);
  registerProjectTools(server, clientManager);
  registerDecisionTools(server, clientManager);
  registerApprovalTools(server, clientManager);

  return server;
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared API Key

**What:** Using a single admin API key for all users (like mrpeasy's env var pattern).
**Why bad:** Bypasses Odoo's per-user ACLs and record rules. User A sees User B's payslips. Complete security failure.
**Instead:** Per-user API keys, always.

### Anti-Pattern 2: Token Passthrough

**What:** Using the MCP OAuth token directly to authenticate to Odoo.
**Why bad:** Odoo does not understand MCP OAuth tokens. The MCP spec explicitly prohibits passing the client's token to upstream services.
**Instead:** Map OAuth identity to stored Odoo API key.

### Anti-Pattern 3: Session-Based Authorization

**What:** Checking auth only at session initialization, trusting the session ID thereafter.
**Why bad:** MCP spec requires Bearer token on EVERY request. Session IDs can be guessed/intercepted.
**Instead:** Validate Bearer token on every POST/GET/DELETE to /mcp.

### Anti-Pattern 4: Global MCP Server Instance

**What:** Creating one McpServer and sharing it across all sessions.
**Why bad:** Tool handlers would need complex per-request context injection; mrpeasy already creates new server per session (line 82 of server.ts).
**Instead:** Create a new McpServer per session (lightweight).

### Anti-Pattern 5: Storing API Keys in Plain Text

**What:** SQLite with unencrypted API key column.
**Why bad:** Database file leak exposes all user credentials.
**Instead:** AES-256-GCM encryption with server-side key from env.

---

## Directory Structure (Recommended)

```
src/
|-- server.ts                    # Express app, routes, session management
|-- auth/
|   |-- middleware.ts            # requireBearerAuth configuration
|   |-- oauth-provider.ts       # /authorize, /token, /register endpoints
|   |-- token.ts                # JWT creation/validation utilities
|   +-- metadata.ts             # /.well-known endpoint configuration
|-- credentials/
|   |-- store.ts                # SQLite credential store (CRUD)
|   |-- encryption.ts           # AES-256-GCM encrypt/decrypt
|   +-- types.ts                # UserCredential interface
|-- services/
|   +-- odoo/
|       |-- client.ts           # OdooClient class (XML-RPC wrapper)
|       |-- client-manager.ts   # LRU cache of per-user clients
|       |-- xmlrpc.ts           # Low-level XML-RPC encoding/fetch
|       |-- circuit-breaker.ts  # From mrpeasy pattern
|       |-- rate-limiter.ts     # Token bucket (global)
|       |-- retry.ts            # Exponential backoff
|       +-- types.ts            # Odoo model interfaces
|-- mcp/
|   |-- index.ts                # createMcpServer factory
|   +-- tools/
|       |-- index.ts            # Tool registration orchestrator
|       |-- accounting.ts       # Invoice, transaction, report tools
|       |-- hr.ts               # Employee, payslip, time-off tools
|       |-- expenses.ts         # Expense tools
|       |-- knowledge.ts        # Knowledge article tools
|       |-- projects.ts         # Project/task tools
|       |-- decisions.ts        # Decision logging tools
|       |-- approvals.ts        # Approval tools
|       +-- error-handler.ts    # Unified error handling
|-- lib/
|   |-- logger.ts               # Winston/pino logger
|   |-- env.ts                  # Environment validation (Zod)
|   +-- errors.ts               # Custom error classes
+-- views/
    +-- authorize.html           # OAuth login form (Odoo credentials)
```

---

## Data Flow (Complete Request Lifecycle)

```
Claude iOS/Web/Desktop
  |
  | POST /mcp
  | Headers: Authorization: Bearer eyJ...
  |          Mcp-Session-Id: abc-123
  |          Content-Type: application/json
  | Body: { jsonrpc: "2.0", method: "tools/call",
  |         params: { name: "get_invoices", arguments: { status: "posted" } } }
  v
Express (server.ts)
  |
  | 1. express.json() parses body
  | 2. cors() handles preflight
  v
requireBearerAuth (auth/middleware.ts)
  |
  | 3. Extracts "Bearer eyJ..." from Authorization header
  | 4. Calls tokenVerifier.verifyAccessToken(token)
  |    - Decodes JWT, validates signature (local key)
  |    - Checks expiry, audience, issuer
  |    - Returns { token, clientId, scopes, extra: { userId: "uuid-1", odooUid: 42 } }
  | 5. Attaches to req.auth
  v
Session Router (server.ts)
  |
  | 6. Reads Mcp-Session-Id header
  | 7. Finds transport in Map
  | 8. Calls transport.handleRequest(req, res, body)
  v
StreamableHTTPServerTransport (SDK)
  |
  | 9. Propagates req.auth to RequestHandlerExtra.authInfo
  | 10. Routes JSON-RPC to registered tool handler
  v
Tool Handler (mcp/tools/accounting.ts) via withOdooAuth HOC
  |
  | 11. const userId = extra.authInfo?.extra?.userId
  | 12. const client = await clientManager.getClient(userId)
  | 13. Validates input with Zod
  v
OdooClientManager (services/odoo/client-manager.ts)
  |
  | 14. Checks LRU cache for userId
  | 15. If miss: credentialStore.getCredentials(userId)
  |     - Reads SQLite
  |     - Decrypts API key with AES-256-GCM
  | 16. Creates OdooClient with user's credentials
  | 17. Caches in LRU (TTL: 30 min)
  v
OdooClient (services/odoo/client.ts)
  |
  | 18. circuitBreaker.execute(async () => {
  | 19.   await rateLimiter.waitForToken()
  | 20.   return withRetry(async () => {
  | 21.     return xmlrpcCall('execute_kw',
  |            [db, uid, apiKey, 'account.move', 'search_read',
  |             [[['state','=','posted']]], { fields: [...], limit: 50 }])
  | 22.   })
  | 23. })
  v
XML-RPC (services/odoo/xmlrpc.ts)
  |
  | 24. Serializes args to XML-RPC format
  | 25. POST https://naturalheroes-odoo.odoo.com/xmlrpc/2/object
  | 26. Deserializes XML-RPC response
  v
Odoo 19 (Odoo.sh)
  |
  | 27. Validates API key for user 42
  | 28. Applies ACLs and record rules for user 42
  | 29. Returns only records user 42 is allowed to see
  v (response bubbles back up)

Tool Handler formats response (JSON with summary)
  -> StreamableHTTPServerTransport sends JSON-RPC response
    -> Express sends HTTP 200 to Claude
      -> Claude displays formatted results to user
```

---

## Scalability Considerations

| Concern | 5 users (MVP) | 50 users | 500 users |
|---------|---------------|----------|-----------|
| Session store | In-memory Map | In-memory Map | Redis or external store |
| Credential store | SQLite | SQLite | PostgreSQL |
| OdooClient cache | LRU (max 10) | LRU (max 100) | LRU with TTL eviction |
| Rate limiting | Global bucket | Per-user + global | Per-user + global |
| OAuth tokens | JWT (stateless) | JWT (stateless) | JWT + revocation list |
| Deployment | Single container | Single container | Multiple replicas + shared state |

For Natural Heroes (5-10 users), the MVP architecture handles everything in a single container with in-memory stores. No horizontal scaling needed.

---

## Docker Deployment

### Single Container (RECOMMENDED)

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY views/ ./views/
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
```

**Environment variables required:**
```env
PORT=3000
NODE_ENV=production
ODOO_URL=https://naturalheroes-odoo.odoo.com
ODOO_DB=naturalheroes-odoo-main-12345678
JWT_SECRET=<random-32-bytes-hex>
ENCRYPTION_KEY=<random-32-bytes-hex>
LOG_LEVEL=info
```

### Why NOT Multi-Container

Keycloak + MCP server would require Docker Compose, inter-container networking, two health checks, two log streams, and more complex Dokploy configuration. For 5-10 internal users, this complexity is not justified.

---

## Suggested Build Order (Dependencies)

Based on component dependencies, the recommended build order:

```
Phase 1: Foundation (Odoo connectivity)
  +-- lib/env.ts, lib/logger.ts, lib/errors.ts
  +-- services/odoo/xmlrpc.ts (XML-RPC encoding + fetch)
  +-- services/odoo/client.ts (OdooClient class)
  Can verify: connect to real Odoo, authenticate, searchRead

Phase 2: MCP Core (transport, no auth)
  +-- server.ts (Express + StreamableHTTP, no auth middleware)
  +-- mcp/index.ts (createMcpServer)
  +-- One test tool (e.g., ping or simple search)
  Can verify: Claude connects, calls tool, gets response

Phase 3: Auth Layer (OAuth + credentials)
  +-- credentials/encryption.ts (AES-256-GCM)
  +-- credentials/store.ts (SQLite CRUD)
  +-- auth/token.ts (JWT sign/verify)
  +-- auth/oauth-provider.ts (/authorize, /token, /register)
  +-- auth/metadata.ts (/.well-known endpoints)
  +-- auth/middleware.ts (requireBearerAuth config)
  +-- views/authorize.html (login form)
  Can verify: full OAuth flow in browser, token issued

Phase 4: Per-User Integration
  +-- services/odoo/client-manager.ts (LRU cache)
  +-- Wire auth middleware into server.ts
  +-- Wire clientManager into tool handlers
  +-- withOdooAuth HOC
  Can verify: two users get different data

Phase 5: All Tools (parallelizable)
  +-- mcp/tools/accounting.ts
  +-- mcp/tools/hr.ts
  +-- mcp/tools/expenses.ts
  +-- mcp/tools/knowledge.ts
  +-- mcp/tools/projects.ts
  +-- mcp/tools/decisions.ts
  +-- mcp/tools/approvals.ts

Phase 6: Resilience + Deployment
  +-- services/odoo/circuit-breaker.ts
  +-- services/odoo/rate-limiter.ts
  +-- services/odoo/retry.ts
  +-- Health check with Odoo connectivity test
  +-- Dockerfile + docker-compose.yml
  +-- Dokploy deployment config
```

**Rationale:** The Odoo XML-RPC client must work first (it is the foundation everything tests against). Then MCP core proves the transport works. Auth is built separately and wired in. Tools are independent of each other and can be parallelized. Resilience is polish, not blocking.

---

## Sources

- [MCP Authorization Specification (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) - HIGH confidence
- [MCP Authorization Tutorial with Keycloak](https://modelcontextprotocol.io/docs/tutorials/security/authorization) - HIGH confidence (official docs, includes full TypeScript implementation)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) - HIGH confidence
- [SDK Issue #397: Auth context in tool calls](https://github.com/modelcontextprotocol/typescript-sdk/issues/397) - HIGH confidence (resolved via PR #399, authInfo now in RequestHandlerExtra)
- [Portal One: Production MCP Server with OAuth & TypeScript](https://portal.one/blog/mcp-server-with-oauth-typescript/) - HIGH confidence (production implementation with per-user workspace access)
- [Odoo 19 External RPC API Documentation](https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html) - HIGH confidence (official, confirms XML-RPC deprecation timeline)
- [Odoo 19 External JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html) - HIGH confidence (new API, not used here but informs future migration)
- [odoo-xmlrpc-ts GitHub](https://github.com/iraycd/odoo-xmlrpc-ts) - MEDIUM confidence (reference for XML-RPC patterns)
- [MCP Authorization Patterns for Upstream API Calls (Solo.io)](https://www.solo.io/blog/mcp-authorization-patterns-for-upstream-api-calls) - MEDIUM confidence
- [DEV: Beyond API Keys - Token Exchange & MCP Servers](https://dev.to/stacklok/beyond-api-keys-token-exchange-identity-federation-mcp-servers-5dm8) - MEDIUM confidence
- [Red Hat: Advanced Auth for MCP Gateway](https://developers.redhat.com/articles/2025/12/12/advanced-authentication-authorization-mcp-gateway) - MEDIUM confidence (vault-based credential mapping pattern)
- mrpeasy reference implementation at `/Users/nevilhulspas/Code/workflows/mcp/mrpeasy/src/` - HIGH confidence (local code, verified patterns)
