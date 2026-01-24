# Phase 1: Foundation - Research

**Researched:** 2026-01-24
**Domain:** MCP server with Streamable HTTP transport, Odoo JSON-2 API client, per-user session isolation
**Confidence:** HIGH

## Summary

Phase 1 builds the foundational infrastructure: an MCP server that accepts Streamable HTTP connections, talks to Odoo's JSON-2 API with bearer auth, and maintains per-user session isolation with TTL-based cleanup. This phase does NOT include OAuth (Phase 2) -- it uses hardcoded API keys for testing.

The standard approach is proven by the existing mrpeasy MCP server in the same workspace. The Odoo MCP server follows an identical structural pattern but adds session TTL cleanup (mrpeasy lacks this and is vulnerable to OOM) and a per-user client cache keyed by API key (mrpeasy uses a single shared client).

The JSON-2 API is remarkably simple: `POST /json/2/<model>/<method>` with a bearer token header and JSON body. No XML parsing, no special libraries -- just native fetch. The LRU cache for per-user OdooClient instances prevents recreation on every request while ensuring idle users are evicted.

**Primary recommendation:** Follow the mrpeasy pattern exactly for server.ts, lib/, and mcp/ structure, then add: (1) session TTL sweep via setInterval, (2) OdooClient class wrapping native fetch for JSON-2, (3) LRU cache for per-user clients keyed by API key.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.25.0 | MCP protocol, StreamableHTTPServerTransport | Official SDK. v1.25.2 is latest stable (Jan 2026). Has session management, DNS rebinding protection |
| Express | ^4.21.0 | HTTP server | Matches mrpeasy/Perdoo. Official SDK has Express middleware support |
| TypeScript | ^5.7.3 | Language | Type safety, matches existing servers |
| Zod | ^3.25.0 | Schema validation | Peer dependency of MCP SDK. Used for tool input schemas and env validation |
| Node.js | >=20.0.0 | Runtime | Native fetch (required for JSON-2 client), stable ESM |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lru-cache | ^11.0.0 | Per-user OdooClient cache | Session isolation with TTL eviction. Type-safe, battle-tested, supports TTL |
| dotenv | ^16.4.0 | Environment variables | Development only (not production) |
| tsx | ^4.19.2 | Dev runner | Watch mode during development |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lru-cache (npm) | Custom Map + setInterval | lru-cache handles TTL, max size, eviction callbacks out of the box. Custom is more code, more bugs |
| @modelcontextprotocol/express | Manual Express setup | express package provides createMcpExpressApp with DNS rebinding protection, but for Phase 1 the mrpeasy pattern is simpler and more explicit. Can adopt later |
| Native fetch | axios/got/node-fetch | JSON-2 is simple POST. No need for a library. Native fetch is zero-dependency and built into Node 20+ |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk@^1.25.0 express zod lru-cache dotenv
npm install -D @types/express @types/node tsx typescript
```

## Architecture Patterns

### Recommended Project Structure (Phase 1 Only)
```
src/
  server.ts                    # Express app, session management, TTL sweep
  lib/
    env.ts                     # Zod-validated environment variables
    logger.ts                  # stderr-only structured logger (match mrpeasy)
    errors.ts                  # McpToolError + Odoo error mapping
  services/
    odoo/
      client.ts                # OdooClient class (JSON-2 via native fetch)
      client-manager.ts        # LRU cache of per-user OdooClient instances
      types.ts                 # Odoo response types, error types
  mcp/
    index.ts                   # createMcpServer() factory
    tools/
      index.ts                 # Re-exports createMcpServer
      ping.ts                  # Connectivity test tool
      test-odoo.ts             # Test tool: calls Odoo JSON-2 and returns data
```

### Pattern 1: Session Store with TTL Sweep
**What:** In-memory Map of sessions with last-activity timestamps, cleaned by periodic setInterval.
**When to use:** Always in Phase 1. The SDK does NOT provide built-in session TTL.
**Example:**
```typescript
// Source: Custom pattern addressing SDK issue #812 (no built-in TTL)
interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
  apiKey: string; // For per-user client lookup
}

const sessions = new Map<string, SessionEntry>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 60 * 1000;   // Check every 60 seconds

// Periodic sweep
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      session.transport.close();
      sessions.delete(id);
      logger.info('Session evicted (TTL expired)', { sessionId: id });
    }
  }
}, SWEEP_INTERVAL_MS);

// Update activity on every request
function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}
```

### Pattern 2: OdooClient with JSON-2 API
**What:** A simple class wrapping native fetch for Odoo's JSON-2 endpoint.
**When to use:** All Odoo API calls.
**Example:**
```typescript
// Source: Odoo 19 External JSON-2 API documentation
// https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
class OdooClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly database: string,
  ) {}

  async call<T>(model: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}/json/2/${model}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${this.apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Odoo-Database': this.database,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new OdooApiError(
        error.message ?? `HTTP ${response.status}`,
        response.status,
        error.name,
      );
    }

    return response.json() as Promise<T>;
  }

  async searchRead<T>(
    model: string,
    domain: unknown[][],
    fields: string[],
    options?: { limit?: number; offset?: number; context?: Record<string, unknown> },
  ): Promise<T[]> {
    return this.call<T[]>(model, 'search_read', {
      domain,
      fields,
      limit: options?.limit,
      offset: options?.offset,
      context: options?.context ?? { lang: 'en_US' },
    });
  }
}
```

### Pattern 3: Per-User Client Manager with LRU Cache
**What:** LRU cache of OdooClient instances keyed by API key. For Phase 1 (no OAuth), the key is the API key itself.
**When to use:** Multi-user session isolation.
**Example:**
```typescript
// Source: lru-cache npm + architecture pattern from project research
import { LRUCache } from 'lru-cache';

class OdooClientManager {
  private cache: LRUCache<string, OdooClient>;

  constructor(
    private readonly odooUrl: string,
    private readonly odooDb: string,
    options?: { maxSize?: number; ttlMs?: number },
  ) {
    this.cache = new LRUCache<string, OdooClient>({
      max: options?.maxSize ?? 50,
      ttl: options?.ttlMs ?? 30 * 60 * 1000, // 30 minutes
      dispose: (_client, key) => {
        logger.info('OdooClient evicted from cache', { key: key.slice(0, 8) + '...' });
      },
    });
  }

  getClient(apiKey: string): OdooClient {
    let client = this.cache.get(apiKey);
    if (!client) {
      client = new OdooClient(this.odooUrl, apiKey, this.odooDb);
      this.cache.set(apiKey, client);
    }
    return client;
  }

  get size(): number {
    return this.cache.size;
  }
}
```

### Pattern 4: Server.ts Structure (Following mrpeasy Exactly)
**What:** Express app with POST/GET/DELETE /mcp endpoints, session management, health check.
**When to use:** The server entry point.
**Example:**
```typescript
// Source: mrpeasy/src/server.ts (verified local code)
import express from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(express.json());

// Health check (includes session count for monitoring)
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', sessions: sessions.size, clients: clientManager.size });
});

// POST /mcp - initialize or route to existing session
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  // Phase 1: API key from header (temporary, replaced by OAuth in Phase 2)
  const apiKey = req.headers['x-odoo-api-key'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    touchSession(sessionId);
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res, req.body);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    if (!apiKey) { res.status(401).json({ error: 'Missing x-odoo-api-key header' }); return; }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server, lastActivity: Date.now(), apiKey });
      },
    });
    transport.onclose = () => { /* find and delete from sessions map */ };

    const server = createMcpServer(clientManager, apiKey);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
  // ... error cases (same as mrpeasy)
});

// GET /mcp - SSE for server-to-client notifications
// DELETE /mcp - explicit session termination
// ... (same as mrpeasy pattern)
```

### Anti-Patterns to Avoid
- **Shared OdooClient across users:** Creates data leakage. Each user MUST have their own client with their own API key.
- **No session TTL:** Causes OOM. The mrpeasy pattern has no cleanup -- do NOT copy this gap.
- **Console.log in MCP servers:** Corrupts the protocol (stdout is MCP communication). Use console.error via logger.
- **Global MCP server instance:** Create a new McpServer per session (it is lightweight). This ensures tool handlers have the correct user context.
- **Skipping touch on activity:** If lastActivity is not updated on each request, active sessions get evicted.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU cache with TTL | Custom Map + timers | `lru-cache` npm (v11) | Handles max size, TTL, eviction callbacks, thread-safe. Custom solutions miss edge cases (timer drift, concurrent access) |
| Rate limiting | Custom token counter | Token bucket from mrpeasy (copy) | Already tested pattern with proper refill math and async waiting |
| Circuit breaker | Custom failure counter | Circuit breaker from mrpeasy (copy) | Already handles CLOSED/OPEN/HALF_OPEN states, threshold config, recovery |
| Retry with backoff | Custom retry loop | `withRetry` from mrpeasy (copy) | Handles jitter, Retry-After header, configurable strategies |
| Environment validation | Manual process.env checks | Zod schema (same as mrpeasy env.ts) | Type-safe, fail-fast, clear error messages |
| Session ID generation | Custom random strings | `crypto.randomUUID()` | Cryptographically secure, built-in, UUID v4 |
| JSON-2 HTTP calls | xmlrpc/axios/got libraries | Native `fetch` (Node 20+) | Zero dependencies. JSON-2 is just HTTP POST with JSON. No XML parsing needed |

**Key insight:** Phase 1 copies most infrastructure patterns directly from mrpeasy (logger, env, errors, resilience). The only new code is the OdooClient (trivial fetch wrapper) and session TTL (simple setInterval).

## Common Pitfalls

### Pitfall 1: Session Memory Leak (OOM)
**What goes wrong:** Sessions accumulate in the Map as clients disconnect without sending DELETE. Mobile/web clients frequently abandon sessions (app backgrounded, tab closed). Each orphaned transport holds references to event emitters and buffered messages.
**Why it happens:** The SDK's `onclose` handler only fires on explicit protocol-level close, NOT on TCP disconnection. The mrpeasy pattern has no TTL cleanup.
**How to avoid:** Implement session TTL sweep via setInterval (see Pattern 1 above). Track lastActivity per session. Evict after 30 minutes idle.
**Warning signs:** Health endpoint shows ever-increasing session count. Container memory climbs linearly. Exit code 137 (OOM kill).

### Pitfall 2: User Session Isolation Failure
**What goes wrong:** User A's API key is used for User B's request. This happens when the session-to-apiKey mapping is broken or a shared client instance is reused.
**Why it happens:** Unlike mrpeasy (single API key), this server has per-user credentials. If the client is instantiated once and shared, or credential lookup uses the wrong session, privilege escalation occurs.
**How to avoid:** Each session stores its own apiKey at initialization time. The clientManager creates/retrieves clients keyed by apiKey. Never cache a client without a user-specific key.
**Warning signs:** Users seeing unexpected data. Audit logs showing wrong API key for a session.

### Pitfall 3: Odoo API Key 90-Day Expiration
**What goes wrong:** Odoo enforces max 90-day lifetime on API keys. After expiration, all JSON-2 calls return 401. The MCP server returns generic errors.
**Why it happens:** No programmatic API to auto-rotate keys. Keys must be manually regenerated.
**How to avoid:** Return specific actionable error message on 401: "Your Odoo API key may have expired. Generate a new one in Odoo Settings > Security > API Keys." Log key usage timestamps for monitoring.
**Warning signs:** 401 errors appearing after ~3 months of operation.

### Pitfall 4: Odoo Rate Limiting (429 Without Backoff)
**What goes wrong:** Rapid tool calls trigger Odoo.sh rate limits. 429 responses are propagated as generic errors. The LLM retries immediately, making it worse.
**Why it happens:** Odoo.sh rate limits are undocumented. Multiple users with multi-step workflows can collectively exceed limits.
**How to avoid:** Use the circuit-breaker + retry + rate-limiter stack from mrpeasy. Adapt limits for Odoo (more conservative: 20 req/10s capacity, 2 tokens/second refill).
**Warning signs:** 429 responses in logs. Cascading failures. LLM retry storms.

### Pitfall 5: Missing Context Parameter in JSON-2 Calls
**What goes wrong:** Odoo returns data in wrong language or timezone because `context` was not passed.
**Why it happens:** The JSON-2 API supports a `context` parameter but it is optional. Developers forget to include it.
**How to avoid:** Always pass `context: { lang: 'en_US' }` as default in the OdooClient. Make it configurable but never omit.
**Warning signs:** Data returned in unexpected languages. Date/time values in wrong timezone.

### Pitfall 6: Graceful Shutdown Failure
**What goes wrong:** On SIGTERM (Docker stop), SSE connections prevent shutdown. Docker kills after 10s (SIGKILL). All sessions lost.
**Why it happens:** Express does not handle graceful shutdown natively. SSE connections are persistent.
**How to avoid:** Register SIGTERM handler that: (1) stops accepting new connections, (2) closes all transports, (3) clears the sweep interval, (4) calls process.exit(0). Use `node` as Docker entrypoint (not npm).
**Warning signs:** Exit code 137 in Docker logs. Users losing sessions during deploys.

## Code Examples

Verified patterns from official sources and reference implementations:

### Odoo JSON-2 API: Complete Request/Response
```typescript
// Source: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html

// Request: search_read partners
const response = await fetch('https://naturalheroes-odoo.odoo.com/json/2/res.partner/search_read', {
  method: 'POST',
  headers: {
    'Authorization': 'bearer YOUR_API_KEY',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Odoo-Database': 'naturalheroes-odoo-main-xxxxxxx',
  },
  body: JSON.stringify({
    domain: [['is_company', '=', true]],
    fields: ['name', 'email', 'phone'],
    limit: 20,
    offset: 0,
    context: { lang: 'en_US' },
  }),
});

// Success response (HTTP 200): JSON array of records
// [{"id": 1, "name": "Company A", "email": "...", "phone": "..."}]

// Error response (HTTP 4xx/5xx): JSON error object
// {"name": "odoo.exceptions.AccessError", "message": "...", "arguments": [...], "debug": "..."}
```

### Odoo JSON-2 API: Other ORM Methods
```typescript
// Source: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html

// search_count
await client.call('res.partner', 'search_count', {
  domain: [['is_company', '=', true]],
});
// Returns: number (e.g., 42)

// read (by IDs)
await client.call('res.partner', 'read', {
  ids: [1, 2, 3],
  fields: ['name', 'email'],
});
// Returns: [{id: 1, name: "...", email: "..."}, ...]

// create
await client.call('res.partner', 'create', {
  name: 'New Partner',
  email: 'new@example.com',
  is_company: true,
});
// Returns: number (new record ID)

// write
await client.call('res.partner', 'write', {
  ids: [42],
  email: 'updated@example.com',
});
// Returns: true

// unlink
await client.call('res.partner', 'unlink', {
  ids: [42],
});
// Returns: true
```

### StreamableHTTPServerTransport Constructor Options
```typescript
// Source: MCP TypeScript SDK v1.25.x
// Import: @modelcontextprotocol/sdk/server/streamableHttp.js
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const transport = new StreamableHTTPServerTransport({
  // Required: generates session IDs for stateful mode
  sessionIdGenerator: () => randomUUID(),

  // Called when session is fully initialized (after initialize handshake)
  onsessioninitialized: (sessionId: string) => {
    sessions.set(sessionId, { transport, ... });
  },

  // Optional: DNS rebinding protection (for localhost servers)
  enableDnsRebindingProtection: true,
  allowedHosts: ['localhost', '127.0.0.1'],
  allowedOrigins: ['https://yourdomain.com'],
});

// Cleanup hook - fires on explicit protocol close
transport.onclose = () => {
  // Remove from session store
};
```

### createMcpServer Factory (Phase 1 Variant)
```typescript
// Source: mrpeasy/src/mcp/tools/index.ts (adapted for per-user)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function createMcpServer(clientManager: OdooClientManager, apiKey: string): McpServer {
  const server = new McpServer({
    name: 'odoo-mcp',
    version: '0.1.0',
    description: 'Odoo ERP integration for Natural Heroes team.',
  });

  // Ping tool (connectivity test)
  server.tool('ping', 'Test connectivity. Returns pong.', {}, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }));

  // Test Odoo tool (Phase 1 verification)
  server.tool(
    'test_odoo',
    'Test Odoo JSON-2 API connectivity. Reads current user info.',
    { model: z.string().default('res.users') },
    async (params) => {
      const client = clientManager.getClient(apiKey);
      const result = await client.searchRead(
        params.model,
        [['id', '>', 0]],
        ['name', 'login'],
        { limit: 5 },
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
```

### Graceful Shutdown Handler
```typescript
// Source: Best practice for Node.js Docker containers
function setupGracefulShutdown(httpServer: ReturnType<typeof app.listen>): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    // 1. Stop accepting new connections
    httpServer.close();

    // 2. Close all active sessions
    for (const [id, session] of sessions.entries()) {
      try {
        await session.transport.close();
      } catch (e) {
        logger.warn('Error closing session during shutdown', { sessionId: id });
      }
      sessions.delete(id);
    }

    // 3. Clear sweep interval
    clearInterval(sweepInterval);

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| XML-RPC (`/xmlrpc/2/object`) | JSON-2 (`/json/2/<model>/<method>`) | Odoo 19 (2025) | No XML parsing needed. Native fetch + JSON. Bearer auth instead of password-in-body |
| SSE Transport (MCP 2024-11-05) | Streamable HTTP (MCP 2025-03-26) | April 2025 | Single endpoint. Better resource usage. Session resumability |
| `StreamableHTTPServerTransport` without DNS protection | With `enableDnsRebindingProtection` | SDK 1.24.0 (CVE-2025-66414) | Security fix. Must enable for any server |
| MCP SDK v1.15.0 (mrpeasy) | v1.25.0 (current) | Jan 2026 | Auth helpers, strict spec compliance, tasks support. Backwards compatible |

**Deprecated/outdated:**
- XML-RPC: Deprecated in Odoo 19, removed in Odoo 20 (fall 2026). Do NOT use.
- JSON-RPC (`/jsonrpc`): Also deprecated alongside XML-RPC. Do NOT use.
- SSE Transport: Deprecated by MCP spec. Use Streamable HTTP.
- `@modelcontextprotocol/sdk` < 1.24.0: Contains DNS rebinding vulnerability (CVE-2025-66414).

## Open Questions

Things that could not be fully resolved:

1. **Exact Odoo.sh rate limits**
   - What we know: Rate limiting exists, returns HTTP 429. Undocumented.
   - What is unclear: Exact requests/second threshold, per-user vs global, whether JSON-2 has different limits than XML-RPC.
   - Recommendation: Start conservative (20 req/10s), monitor 429s, adjust.

2. **StreamableHTTPServerTransport class name in SDK 1.25.x**
   - What we know: v1.x uses `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`. The v2 branch (pre-alpha) uses `NodeStreamableHTTPServerTransport` in the `@modelcontextprotocol/node` package.
   - What is unclear: Whether the 1.24.2 "refactor: make Server class framework-agnostic by moving express to separate module" affected the import path.
   - Recommendation: Use `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js` (same as mrpeasy). Verify at npm install time.

3. **`@modelcontextprotocol/express` value for Phase 1**
   - What we know: It provides `createMcpExpressApp()` with DNS rebinding protection (for localhost) and `hostHeaderValidation()` middleware.
   - What is unclear: Whether it adds value for a remote server (not localhost). DNS rebinding is primarily a localhost attack vector.
   - Recommendation: Skip for Phase 1. Use manual Express setup matching mrpeasy. The remote server uses OAuth (Phase 2) which provides defense-in-depth. Can revisit if needed.

4. **JSON-2 API error response structure consistency**
   - What we know: Errors return JSON with `name`, `message`, `arguments`, `context`, `debug` fields.
   - What is unclear: Whether all Odoo versions return this exact structure. Whether some errors return non-JSON responses.
   - Recommendation: Always try JSON parse in error handler, fall back to raw text. Map `name` field to error categories (AccessError, ValidationError, MissingError, UserError).

## Sources

### Primary (HIGH confidence)
- [Odoo 19 External JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html) - Request format, auth, response structure
- [MCP TypeScript SDK repository](https://github.com/modelcontextprotocol/typescript-sdk) - StreamableHTTPServerTransport, session management
- [MCP TypeScript SDK server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) - Express integration, DNS rebinding
- [MCP SDK releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) - Version history, breaking changes
- mrpeasy reference implementation at `/Users/nevilhulspas/Code/workflows/mcp/mrpeasy/src/` - Proven patterns for server.ts, lib/, services/, mcp/
- [SDK Issue #812: Idle Session Timeout](https://github.com/modelcontextprotocol/typescript-sdk/issues/812) - Confirms no built-in TTL
- [CVE-2025-66414: DNS rebinding](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w) - Security fix in 1.24.0

### Secondary (MEDIUM confidence)
- [lru-cache npm](https://www.npmjs.com/package/lru-cache) - v11 API, TTL support, TypeScript types
- [Odoo API 101 / XML-RPC Deprecation](https://oduist.com/blog/odoo-experience-2025-ai-summaries-2/286-xmlrpc-is-dead-all-hail-json-2-288) - Deprecation timeline confirmed
- [Koyeb MCP deployment tutorial](https://www.koyeb.com/tutorials/deploy-remote-mcp-servers-to-koyeb-using-streamable-http-transport) - Express + StreamableHTTP patterns
- [MCP Transport Future (official blog)](http://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/) - Transport direction confirmed

### Tertiary (LOW confidence)
- Odoo.sh rate limits (inferred from forum posts, never officially documented)
- SDK v2 Q1 2026 timeline (mentioned in README, may slip)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified via mrpeasy implementation, npm, and official SDK docs
- Architecture: HIGH - copied from working mrpeasy server, adapted with well-known patterns
- Pitfalls: HIGH - documented in SDK issues, Odoo forums, and security advisories
- Odoo JSON-2 API: HIGH - verified via official Odoo 19 documentation
- Session TTL: HIGH - SDK issue #812 confirms no built-in mechanism, community pattern is setInterval

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (stable domain, 30-day validity)
