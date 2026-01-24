# Technology Stack

**Project:** Odoo MCP Server
**Researched:** 2026-01-23
**Overall Confidence:** HIGH

## Critical Finding: Use Odoo 19 JSON-2 API, NOT XML-RPC

The PROJECT.md specifies XML-RPC connectivity, but research reveals this is wrong. Odoo 19 deprecates XML-RPC with removal on Odoo Online (SaaS) in 19.1 and Odoo.sh/on-prem in Odoo 20 (fall 2026). The replacement is the **JSON-2 API** -- a simple HTTP+JSON interface at `/json/2/<model>/<method>` with bearer token auth via API keys.

**Implication:** No XML-RPC library needed. Use native `fetch` with the JSON-2 endpoint. This is simpler, more type-safe, and future-proof.

**Source:** [Odoo 19 External JSON-2 API docs](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html), [Deprecation notice](https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| TypeScript | ^5.7.3 | Language | Type safety, matches mrpeasy/Perdoo pattern | HIGH |
| Node.js | >=20.0.0 | Runtime | Native fetch, stable ESM, matches existing servers | HIGH |
| Express | ^4.21.0 | HTTP server | Matches mrpeasy pattern, official SDK middleware support | HIGH |
| Zod | ^3.25.0 | Schema validation | Peer dependency of MCP SDK; supports both v3 and v4 subpaths | HIGH |

### MCP Protocol

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @modelcontextprotocol/sdk | ^1.25.0 | MCP server SDK | Official SDK. Latest stable is 1.25.3 (Jan 20, 2026). Streamable HTTP, OAuth auth helpers, session management | HIGH |
| @modelcontextprotocol/express | latest | Express middleware | Official thin adapter for Express. Provides `createMcpExpressApp()` with DNS rebinding protection, Host header validation | HIGH |

**Version note:** The existing mrpeasy/Perdoo servers pin `^1.15.0`. The SDK is backwards-compatible within 1.x; upgrading to ^1.25.0 is safe and gains OAuth/auth helper improvements. The v2 pre-alpha is on the main branch but NOT recommended for production yet (Q1 2026 stable target).

### Odoo Connectivity

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Native `fetch` | Built-in (Node 20+) | HTTP client for Odoo JSON-2 API | Zero dependencies. JSON-2 is just `POST /json/2/<model>/<method>` with JSON body + bearer header. No XML parsing needed | HIGH |

**What this replaces:** No `xmlrpc`, `odoo-xmlrpc-ts`, `@foxglove/xmlrpc`, or any XML-RPC library is needed.

### Authentication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| SDK auth helpers | (bundled with @modelcontextprotocol/sdk) | OAuth 2.1 provider implementation | Built-in `OAuthServerProvider` interface, `ProxyOAuthServerProvider` for delegating to external IdPs | HIGH |
| jose | ^5.x | JWT signing/verification | Lightweight, TypeScript-native JOSE implementation for access token generation | MEDIUM |
| pkce-challenge | ^4.x | PKCE support | Already a transitive dependency of the MCP SDK | HIGH |

### Infrastructure & Dev

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker | - | Containerization | Dokploy deployment, matches mrpeasy/Perdoo | HIGH |
| tsx | ^4.19.2 | Dev runner | Watch mode, fast TypeScript execution, matches existing | HIGH |
| esbuild (via tsc) | - | Build | TypeScript compilation, matches existing | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| express-rate-limit | ^7.x | Rate limiting | Protect MCP and OAuth endpoints | HIGH |
| pino | ^9.x | Structured logging | Production logging (or keep custom logger matching mrpeasy pattern) | MEDIUM |
| dotenv | ^16.x | Environment vars | Local development | HIGH |

---

## Odoo 19 JSON-2 API Details

### Endpoint Format

```
POST https://<odoo-host>/json/2/<model>/<method>
```

### Authentication

```http
Authorization: bearer <API_KEY>
X-Odoo-Database: <database_name>
Content-Type: application/json; charset=utf-8
```

- API keys replace passwords for machine-to-machine auth
- Generated in Odoo: Preferences > Account Security > New API Key
- 160-bit random values, displayed only once
- Default max lifetime: 90 days for regular users (admins can create permanent keys)
- Keys are scoped to user permissions -- enforces ACLs and record rules automatically

### Request Format

```json
{
  "domain": [["field", "operator", "value"]],
  "fields": ["name", "email"],
  "limit": 10,
  "offset": 0,
  "context": {"lang": "en_US"}
}
```

### Available ORM Methods

| Method | Purpose | Request Body |
|--------|---------|-------------|
| `search` | Find record IDs | `{"domain": [...]}` |
| `read` | Read fields by IDs | `{"ids": [1,2,3], "fields": [...]}` |
| `search_read` | Combined search+read | `{"domain": [...], "fields": [...]}` |
| `create` | Create records | `{"name": "value", ...}` |
| `write` | Update records | `{"ids": [1], "name": "new_value"}` |
| `unlink` | Delete records | `{"ids": [1,2,3]}` |
| `search_count` | Count matching records | `{"domain": [...]}` |

### Response Format

- Success: HTTP 200 with JSON-serialized method result
- Error: HTTP 4xx/5xx with structured error object
- Each call runs in its own SQL transaction (commit on success, rollback on error)

### TypeScript Client Pattern

```typescript
class OdooClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private database: string
  ) {}

  async call<T>(model: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}/json/2/${model}/${method}`, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${this.apiKey}`,
        'X-Odoo-Database': this.database,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new OdooApiError(error.message, response.status, error.name);
    }

    return response.json() as Promise<T>;
  }

  async searchRead<T>(model: string, domain: unknown[][], fields: string[], options?: { limit?: number; offset?: number }): Promise<T[]> {
    return this.call<T[]>(model, 'search_read', {
      domain,
      fields,
      ...options,
    });
  }
}
```

### API Documentation Discovery

Every Odoo 19 database ships with live docs at `/doc` -- browse models, fields, methods, and copy sample code. Use this to verify available fields per model.

**Source:** [Odoo 19 JSON-2 API documentation](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)

---

## OAuth 2.1 for Claude Remote MCP Integrations

### Architecture Decision: Embedded Authorization Server

For an internal team tool (~5 users), implement the OAuth 2.1 authorization server **embedded in the MCP server** rather than delegating to a third-party IdP (Auth0, Clerk, etc.). This is simpler and matches the fact that user identity maps directly to Odoo API keys.

**Flow:** Claude authenticates user via OAuth > user logs in with team credentials > server issues access token > token maps to user's Odoo API key > all Odoo calls use that user's key.

### Required Endpoints (MCP Spec 2025-03-26)

The MCP server must implement these OAuth endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/oauth-protected-resource` | GET | Protected Resource Metadata (RFC 9728) -- advertises authorization server location |
| `/.well-known/oauth-authorization-server` | GET | Authorization Server Metadata (RFC 8414) -- advertises supported capabilities |
| `/authorize` | GET | Authorization endpoint -- user-facing login/consent |
| `/token` | POST | Token exchange -- auth code for access token |
| `/register` | POST | Dynamic Client Registration (RFC 7591) -- Claude registers itself |
| `/mcp` | POST/GET/DELETE | MCP endpoint (protected resource) |

### Claude's OAuth Callback

```
https://claude.ai/api/mcp/auth_callback
```

May migrate to `https://claude.com/api/mcp/auth_callback` in the future.

### Discovery Flow (What Claude Does)

1. Claude sends MCP request without token
2. Server responds **401 Unauthorized** with:
   ```http
   WWW-Authenticate: Bearer resource_metadata="https://your-server.com/.well-known/oauth-protected-resource"
   ```
3. Claude fetches Protected Resource Metadata, gets `authorization_servers` URL
4. Claude fetches Authorization Server Metadata from `/.well-known/oauth-authorization-server`
5. Claude performs Dynamic Client Registration (POST `/register`)
6. Claude opens browser for user authorization (GET `/authorize` with PKCE code_challenge)
7. User authenticates, server redirects to Claude's callback with auth code
8. Claude exchanges code for tokens (POST `/token` with code_verifier)
9. Claude includes `Authorization: Bearer <token>` on all subsequent MCP requests

### Key Requirements

- **PKCE is mandatory** -- S256 code challenge method
- **Dynamic Client Registration** -- Claude registers itself automatically
- **Token in every request** -- even within same session
- **Resource parameter** (RFC 8707) -- Claude includes `resource` param in auth/token requests
- **Token expiry + refresh** -- supported by Claude
- **HTTPS mandatory** -- all OAuth endpoints (Dokploy with SSL)

### Per-User Auth Implementation Pattern

```typescript
// OAuth token -> User mapping
interface UserSession {
  userId: string;
  odooApiKey: string;  // Per-user Odoo API key
  odooUid: number;     // Odoo user ID
  email: string;
}

// Token store (in-memory for small team, or SQLite for persistence)
const tokenToUser: Map<string, UserSession> = new Map();

// In MCP request handler, extract user context from token:
function getUserFromRequest(req: Request): UserSession {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = tokenToUser.get(token);
  if (!user) throw new AuthError('Invalid or expired token');
  return user;
}

// Create per-user Odoo client:
function createOdooClientForUser(user: UserSession): OdooClient {
  return new OdooClient(ODOO_URL, user.odooApiKey, ODOO_DATABASE);
}
```

### Protected Resource Metadata Document

```json
{
  "resource": "https://your-mcp-server.com/mcp",
  "authorization_servers": ["https://your-mcp-server.com"],
  "scopes_supported": ["odoo:read", "odoo:write", "odoo:admin"],
  "bearer_methods_supported": ["header"]
}
```

### Authorization Server Metadata Document

```json
{
  "issuer": "https://your-mcp-server.com",
  "authorization_endpoint": "https://your-mcp-server.com/authorize",
  "token_endpoint": "https://your-mcp-server.com/token",
  "registration_endpoint": "https://your-mcp-server.com/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["odoo:read", "odoo:write", "odoo:admin"]
}
```

**Sources:**
- [MCP Authorization Spec (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [MCP Authorization Spec (draft/latest)](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [Claude Custom Connectors Help](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Descope MCP Auth Spec Deep Dive](https://www.descope.com/blog/post/mcp-auth-spec)

---

## Session Architecture: Per-User MCP Context

### The Challenge

The existing mrpeasy server creates a single `MrpEasyClient` (one API key in env vars). The Odoo server needs per-user clients -- each user's OAuth token maps to their Odoo API key, and each session gets its own `OdooClient` instance.

### Solution Pattern

```typescript
// Per-session state: user context + Odoo client
interface SessionContext {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  user: UserSession;
  odooClient: OdooClient;
}

const sessions: Map<string, SessionContext> = new Map();

// On initialize: validate token, resolve user, create per-user Odoo client
app.post('/mcp', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = validateToken(token); // Throws 401 if invalid

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        const odooClient = new OdooClient(ODOO_URL, user.odooApiKey, ODOO_DATABASE);
        const server = createMcpServer(odooClient, user);
        sessions.set(id, { transport, server, user, odooClient });
      },
    });
    // ...
  }
});
```

### Tool Context Injection

Each tool registration receives the per-user Odoo client:

```typescript
function registerAccountingTools(server: McpServer, odooClient: OdooClient): void {
  server.tool('read_invoices', 'Read invoices for the authenticated user', {
    status: z.enum(['draft', 'posted', 'cancelled']).optional(),
    limit: z.number().max(50).default(20),
  }, async (params) => {
    const invoices = await odooClient.searchRead('account.move',
      [['move_type', 'in', ['out_invoice', 'in_invoice']],
       ...(params.status ? [['state', '=', params.status]] : [])],
      ['name', 'partner_id', 'amount_total', 'state', 'invoice_date'],
      { limit: params.limit }
    );
    return { content: [{ type: 'text', text: JSON.stringify(invoices) }] };
  });
}
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Odoo API | JSON-2 (native fetch) | XML-RPC via odoo-xmlrpc-ts | XML-RPC deprecated in Odoo 19, removed in 20. JSON-2 is simpler (just HTTP+JSON), no library needed |
| Odoo API | JSON-2 (native fetch) | JSON-RPC via /jsonrpc | Also deprecated alongside XML-RPC. Same removal timeline |
| MCP SDK | @modelcontextprotocol/sdk ^1.25.0 | express-mcp-handler (community) | Official SDK has built-in auth helpers, Express middleware. Community package adds unnecessary indirection |
| OAuth | Embedded auth server | Auth0/Clerk/external IdP | Over-engineered for 5-user internal tool. User-to-Odoo-key mapping is the core auth logic, not identity federation |
| OAuth | Embedded auth server | ProxyOAuthServerProvider | Has known Zod validation bugs with some providers (GitHub issue #754). Embedded is simpler for our use case |
| HTTP framework | Express | Hono/Fastify | Express matches existing mrpeasy/Perdoo servers. Official @modelcontextprotocol/express middleware. Team familiarity |
| Logging | Custom logger (match mrpeasy) | pino/winston | Consistency with existing servers. Simple structured logging to stderr is sufficient |
| Token storage | In-memory Map | Redis/SQLite | 5-user team, single-instance deployment. In-memory is fine. Add persistence later if needed |
| Zod version | ^3.25.0 (supports v4 subpath) | zod@4.0.0 | MCP SDK uses `zod/v4` internally but peer-depends on `^3.25.0`. Stay on 3.25+ for compatibility |
| Build | tsc | esbuild/swc | Matches existing servers. TypeScript compilation is fast enough |
| Node.js | >=20 | >=18 (mrpeasy minimum) | Node 20+ has stable native fetch, better ESM support. mrpeasy's >=18 minimum is unnecessarily low |

---

## What NOT to Use

| Technology | Reason |
|------------|--------|
| `xmlrpc` (npm) | Last updated 9 years ago. XML-RPC deprecated in Odoo 19 |
| `odoo-xmlrpc-ts` | Targets deprecated XML-RPC endpoints. Do not build on deprecated APIs |
| `@foxglove/xmlrpc` | Inactive (3 years no release), focused on ROS robotics |
| `node-xmlrpc` | 9 years old, JavaScript-only, targets deprecated protocol |
| Python FastMCP | Would break consistency with mrpeasy/Perdoo TypeScript pattern |
| Cloudflare Workers MCP | Not needed -- Dokploy + Docker is existing infra |
| SSE transport | Deprecated by MCP. Use Streamable HTTP |
| Passport.js | Over-engineered for embedded OAuth. Raw implementation is clearer |
| express-session | Not needed. OAuth tokens are self-contained, no server-side sessions needed for auth |

---

## Installation

```bash
# Core dependencies
npm install @modelcontextprotocol/sdk@^1.25.0 @modelcontextprotocol/express express zod

# Auth (if using JWT tokens)
npm install jose

# Infrastructure
npm install express-rate-limit dotenv

# Dev dependencies
npm install -D @types/express @types/node tsx typescript
```

### package.json

```json
{
  "name": "odoo-mcp",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0",
    "@modelcontextprotocol/express": "latest",
    "express": "^4.21.0",
    "express-rate-limit": "^7.5.0",
    "jose": "^5.9.0",
    "zod": "^3.25.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

## Project Structure

Following the mrpeasy pattern, extended for per-user auth:

```
src/
  server.ts                    # Express app, session management, MCP routing
  lib/
    env.ts                     # Environment validation
    errors.ts                  # Error types
    logger.ts                  # Structured logging
  auth/
    oauth-provider.ts          # OAuth 2.1 server implementation
    token-store.ts             # Token-to-user mapping
    user-store.ts              # User credentials + Odoo API keys
    middleware.ts              # Express auth middleware (token validation)
    endpoints.ts               # /authorize, /token, /register, /.well-known/*
  services/
    odoo/
      client.ts                # OdooClient (JSON-2 API via fetch)
      types.ts                 # Odoo model type definitions
      rate-limiter.ts          # Token bucket for Odoo API calls
      circuit-breaker.ts       # Circuit breaker for Odoo connectivity
      retry.ts                 # Retry with backoff
  mcp/
    index.ts                   # createMcpServer(odooClient, user)
    tools/
      index.ts                 # Tool registration orchestrator
      accounting.ts            # Invoice, transaction, report tools
      hr.ts                    # Employee, payslip, time-off tools
      expenses.ts              # Expense tools
      knowledge.ts             # Knowledge article CRUD tools
      projects.ts              # Project/task CRUD + template tools
      decisions.ts             # Decision logging tools
      approvals.ts             # Approval workflow tools
      error-handler.ts         # Shared error handling for tool responses
    resources/
      instructions.ts          # LLM usage guide resource
```

---

## Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production

# Odoo
ODOO_URL=https://naturalheroes-odoo.odoo.com
ODOO_DATABASE=naturalheroes-odoo-main-xxxxxxx

# OAuth (embedded auth server)
OAUTH_ISSUER=https://your-mcp-domain.com
OAUTH_JWT_SECRET=<generated-secret>
OAUTH_ACCESS_TOKEN_TTL=3600      # 1 hour
OAUTH_REFRESH_TOKEN_TTL=604800   # 7 days

# User Registry (small team - can be env vars or JSON file)
# Format: USER_1_EMAIL, USER_1_PASSWORD_HASH, USER_1_ODOO_API_KEY
# Or: USERS_FILE=/config/users.json
```

---

## Key Architectural Decisions Summary

| Decision | Rationale |
|----------|-----------|
| JSON-2 over XML-RPC | XML-RPC deprecated in Odoo 19, removed in 20. JSON-2 is simpler, uses standard HTTP+JSON |
| Native fetch over HTTP libraries | Zero dependencies. JSON-2 is just POST with JSON body |
| Embedded OAuth over external IdP | 5-user internal tool. User identity = Odoo API key mapping. External IdP is over-engineering |
| Per-session Odoo client | Each user's session gets their own OdooClient with their API key. Enforces Odoo permissions |
| MCP SDK ^1.25.0 over ^1.15.0 | Latest stable, has auth helpers. Backwards-compatible within 1.x |
| Express over alternatives | Matches existing servers. Official middleware package. Team knowledge |
| In-memory token store | Single-instance, 5 users. SQLite/Redis when scaling |

---

## Sources

### HIGH Confidence (Official Documentation)
- [Odoo 19 External JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
- [Odoo 19 External RPC API (deprecated)](https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html)
- [MCP Authorization Specification (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [MCP Authorization Specification (draft/latest)](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP SDK Server Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [Claude Custom Connectors Help](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [MCP Transports Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Zod v4 Versioning](https://zod.dev/v4/versioning)

### MEDIUM Confidence (Verified Community Sources)
- [MCP Auth Spec Deep Dive (Descope)](https://www.descope.com/blog/post/mcp-auth-spec)
- [MCP Spec Updates June 2025 (Auth0)](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [Odoo API 101 / XML-RPC Deprecation (oduist)](https://oduist.com/blog/odoo-experience-2025-ai-summaries-2/286-xmlrpc-is-dead-all-hail-json-2-288)
- [MCP Transport Future (official blog)](http://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/)

### LOW Confidence (Single Source / Unverified)
- MCP SDK v2 Q1 2026 timeline (mentioned in README, may slip)
- Zod `^3.25.0` peer dep requirement (inferred from SDK behavior, not explicitly documented)
