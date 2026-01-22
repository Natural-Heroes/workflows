# Architecture Research

**Domain:** MCP (Model Context Protocol) Server for External API Integration
**Researched:** 2026-01-19
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Client Layer                         │
│  (Claude Desktop, IDEs, AI Applications)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │ JSON-RPC 2.0 over HTTP/SSE
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server (Host)                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Protocol │  │Transport │  │ Session  │  │   Auth   │        │
│  │  Handler │  │  Layer   │  │ Manager  │  │  Layer   │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
├───────┴──────────────┴──────────────┴──────────────┴────────────┤
│                     Business Logic Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              McpServer / Tool Registry                   │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           │    │
│  │  │   Tools   │  │Resources  │  │  Prompts  │           │    │
│  │  └───────────┘  └───────────┘  └───────────┘           │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                    Integration Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   API    │  │   Rate   │  │ Circuit  │  │  Retry   │        │
│  │  Client  │  │ Limiter  │  │ Breaker  │  │  Logic   │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
├───────┴──────────────┴──────────────┴──────────────┴────────────┤
│                      Data Layer                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │  Cache   │  │  Queue   │  │  State   │                       │
│  │ (Redis)  │  │ (Redis)  │  │ (Memory) │                       │
│  └──────────┘  └──────────┘  └──────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    External API Services                         │
│  (MRPeasy, GitHub, Jira, Yahoo Finance, etc.)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Protocol Handler** | JSON-RPC 2.0 message routing, request/response correlation, capability negotiation | `Protocol` class from SDK (extended by `Server` and `Client`) |
| **Transport Layer** | Manages communication channel (HTTP/SSE), handles connection lifecycle | `StreamableHTTPServerTransport` (modern), `SSEServerTransport` (deprecated) |
| **Session Manager** | Maintains client session state, assigns session IDs, handles cleanup | Map-based storage with `sessionIdGenerator`, lifecycle callbacks |
| **McpServer** | High-level API for registering tools/resources/prompts, schema validation | Wrapper around low-level `Server` with Zod schema support |
| **Tool Registry** | Registers, validates, and routes tool execution requests | Map of tool name → handler with input/output schemas |
| **API Client** | Interfaces with external APIs, handles authentication, request formatting | Axios/fetch with interceptors for auth, logging |
| **Rate Limiter** | Enforces request rate limits per session/client/tool | Token bucket or sliding window with Map/Redis storage |
| **Circuit Breaker** | Prevents cascading failures from failing external services | State machine (closed/open/half-open) with failure threshold |
| **Cache** | Stores API responses to reduce external calls | Redis with TTL or in-memory Map for simple cases |

## Recommended Project Structure

```
mrpeasy-mcp/
├── src/
│   ├── server.ts              # Main entry point, Express app setup
│   ├── mcp/
│   │   ├── index.ts           # McpServer initialization
│   │   ├── tools/             # Tool implementations
│   │   │   ├── index.ts       # Tool registry
│   │   │   ├── orders.ts      # Order-related tools
│   │   │   ├── customers.ts   # Customer-related tools
│   │   │   └── inventory.ts   # Inventory-related tools
│   │   ├── resources/         # Resource providers (optional)
│   │   └── prompts/           # Prompt templates (optional)
│   ├── services/
│   │   ├── mrpeasy/
│   │   │   ├── client.ts      # MRPeasy API client
│   │   │   ├── auth.ts        # Authentication logic
│   │   │   └── types.ts       # API type definitions
│   │   ├── cache.ts           # Caching service (Redis/Memory)
│   │   └── metrics.ts         # Monitoring/logging
│   ├── middleware/
│   │   ├── ratelimiter.ts     # Rate limiting middleware
│   │   ├── circuitbreaker.ts  # Circuit breaker implementation
│   │   └── retry.ts           # Retry logic with exponential backoff
│   ├── types/
│   │   ├── mcp.ts             # MCP-specific types
│   │   └── api.ts             # External API types
│   └── utils/
│       ├── logger.ts          # Structured logging
│       ├── config.ts          # Configuration management
│       └── errors.ts          # Custom error classes
├── tests/
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   └── e2e/                   # End-to-end tests
├── dist/                      # Compiled JavaScript output
├── .env.example               # Environment variable template
├── tsconfig.json              # TypeScript configuration
├── package.json               # Dependencies and scripts
└── Dockerfile                 # Container definition
```

### Structure Rationale

- **src/mcp/tools/**: Organized by domain (orders, customers, inventory) for easy navigation. Each file exports tool definitions with schemas and handlers. Centralized `index.ts` aggregates all tools for registration.

- **src/services/**: External API clients isolated from MCP logic. Makes testing easier (mock the service layer). `mrpeasy/` subfolder allows adding more API integrations later (e.g., `github/`, `jira/`).

- **src/middleware/**: Cross-cutting concerns (rate limiting, circuit breakers, retry logic) as reusable components. Applied as decorators or wrappers around tool handlers.

- **src/types/**: Centralized type definitions prevent circular dependencies and improve IDE autocomplete. Separates MCP protocol types from external API types.

- **tests/**: Mirrors `src/` structure with unit tests for individual functions, integration tests for service interactions, and e2e tests for full request flows.

## Architectural Patterns

### Pattern 1: Tool Handler with Zod Schema Validation

**What:** Define tools with strict input/output schemas using Zod v3+, automatically validated by the SDK.

**When to use:** All tool implementations to ensure type safety and provide clear contract to LLMs.

**Trade-offs:**
- Pros: Compile-time and runtime validation, excellent developer experience, auto-generated types
- Cons: Adds dependency on Zod, slightly more verbose than plain TypeScript interfaces

**Example:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';

const server = new McpServer({ name: 'mrpeasy-server', version: '1.0.0' });

server.registerTool(
  'get-order',
  {
    title: 'Get Order',
    description: 'Retrieve order details by ID',
    inputSchema: {
      orderId: z.string().regex(/^\d+$/).describe('Order ID (numeric string)')
    },
    outputSchema: {
      order: z.object({
        id: z.string(),
        status: z.enum(['pending', 'processing', 'shipped', 'delivered']),
        total: z.number(),
        items: z.array(z.object({
          sku: z.string(),
          quantity: z.number()
        }))
      })
    }
  },
  async ({ orderId }) => {
    // Auto-validated input, fully typed
    const order = await mrpeasyClient.getOrder(orderId);
    return {
      content: [{ type: 'text', text: JSON.stringify(order) }],
      structuredContent: { order }
    };
  }
);
```

### Pattern 2: Session-Based HTTP Transport with State Management

**What:** Use `StreamableHTTPServerTransport` with session ID generation and lifecycle callbacks to maintain client state across requests.

**When to use:** Production deployments where you need to track per-client usage, rate limits, or maintain conversation context.

**Trade-offs:**
- Pros: Enables resumable sessions, per-client rate limiting, SSE for server-initiated notifications
- Cons: Requires session storage (memory/Redis), more complex than stateless mode
- Alternative: Use `sessionIdGenerator: undefined` for stateless REST-like operation

**Example:**
```typescript
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing session
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New session
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
        console.log('Session initialized:', id);
      },
      onsessionclosed: (id) => {
        delete transports[id];
        console.log('Session closed:', id);
      }
    });
    await server.connect(transport);
  } else {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid session' },
      id: null
    });
  }

  await transport.handleRequest(req, res, req.body);
});
```

### Pattern 3: Rate Limiting with Token Bucket

**What:** Implement per-session rate limiting using a token bucket algorithm stored in a Map.

**When to use:** Prevent abuse and stay within external API rate limits. Essential for production deployments.

**Trade-offs:**
- Pros: Simple to implement, memory-efficient, granular control per session/tool
- Cons: In-memory state doesn't survive restarts (use Redis for persistence), needs cleanup for expired sessions

**Example:**
```typescript
interface RateLimitConfig {
  limit: number;    // Max requests
  window: number;   // Time window in ms
}

const rateLimiter = new Map<string, number[]>();

function withRateLimit(config: RateLimitConfig) {
  return function <T>(handler: (args: any, context: any) => Promise<T>) {
    return async (args: any, context: any): Promise<T | { content: any[], isError: true }> => {
      const key = context.sessionId || 'global';
      const now = Date.now();
      const timestamps = rateLimiter.get(key) || [];

      // Remove old timestamps outside window
      const recent = timestamps.filter(t => now - t < config.window);

      if (recent.length >= config.limit) {
        return {
          content: [{
            type: 'text',
            text: `Rate limit exceeded. Max ${config.limit} requests per ${config.window/1000}s.`
          }],
          isError: true
        };
      }

      recent.push(now);
      rateLimiter.set(key, recent);
      return handler(args, context);
    };
  };
}

// Usage
server.registerTool(
  'expensive-operation',
  schema,
  withRateLimit({ limit: 10, window: 60000 })(async (args) => {
    // Handler logic
  })
);
```

### Pattern 4: Circuit Breaker for External API Resilience

**What:** Implement a circuit breaker state machine (closed → open → half-open) to prevent cascading failures from unreliable external APIs.

**When to use:** Any tool that calls external APIs, especially those prone to timeouts or 5xx errors.

**Trade-offs:**
- Pros: Prevents wasted resources on failing services, fast-fails during outages, automatic recovery
- Cons: Adds complexity, requires tuning thresholds for your specific use case

**Example:**
```typescript
enum CircuitState { CLOSED, OPEN, HALF_OPEN }

class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failures = 0;
  private lastFailTime = 0;

  constructor(
    private failureThreshold = 5,
    private recoveryTimeout = 30000 // 30s
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailTime > this.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
}

// Usage
const mrpeasyCircuitBreaker = new CircuitBreaker(5, 30000);

async function callMRPeasyAPI(endpoint: string, params: any) {
  return mrpeasyCircuitBreaker.execute(async () => {
    const response = await axios.get(`${API_BASE}/${endpoint}`, { params });
    return response.data;
  });
}
```

### Pattern 5: Retry with Exponential Backoff and Jitter

**What:** Automatically retry failed requests with increasing delays and randomization to prevent thundering herd.

**When to use:** Transient failures (network timeouts, 429/503 errors) that are likely to succeed on retry.

**Trade-offs:**
- Pros: Improves reliability, handles temporary outages gracefully
- Cons: Increases latency on failures, can mask underlying issues if not logged properly

**Example:**
```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatuses: number[];
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on client errors (4xx except 429)
      if (error.response?.status &&
          !config.retryableStatuses.includes(error.response.status)) {
        throw error;
      }

      if (attempt < config.maxAttempts - 1) {
        // Exponential backoff: 2^attempt * baseDelay
        const delay = Math.min(
          config.baseDelay * Math.pow(2, attempt),
          config.maxDelay
        );
        // Add jitter (0-50% of delay)
        const jitter = delay * Math.random() * 0.5;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
  }

  throw lastError!;
}

// Usage
const retryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableStatuses: [429, 500, 502, 503, 504]
};

async function getMRPeasyOrder(orderId: string) {
  return retryWithBackoff(
    () => axios.get(`/orders/${orderId}`),
    retryConfig
  );
}
```

### Pattern 6: Custom Error Classes with User/Internal Messages

**What:** Separate user-facing messages from internal diagnostic information for security and clarity.

**When to use:** All error handling to avoid leaking sensitive information (API keys, stack traces) to LLMs.

**Trade-offs:**
- Pros: Better security, clearer errors for users, rich internal diagnostics
- Cons: Slightly more boilerplate than throwing raw errors

**Example:**
```typescript
class MCPError extends Error {
  constructor(
    public userMessage: string,
    public internalMessage: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(userMessage);
    this.name = 'MCPError';
  }
}

class RateLimitError extends MCPError {
  constructor(retryAfter: number) {
    super(
      `Rate limit exceeded. Please try again in ${retryAfter}s.`,
      `Rate limit hit, retry-after: ${retryAfter}`,
      'RATE_LIMIT_EXCEEDED',
      429
    );
  }
}

class APIError extends MCPError {
  constructor(serviceName: string, statusCode: number, details?: string) {
    super(
      `${serviceName} service is temporarily unavailable.`,
      `${serviceName} returned ${statusCode}: ${details}`,
      'EXTERNAL_API_ERROR',
      502
    );
  }
}

// Usage in tool handler
try {
  const data = await mrpeasyClient.getOrder(orderId);
  return { content: [...], structuredContent: data };
} catch (error) {
  if (axios.isAxiosError(error)) {
    const apiError = new APIError(
      'MRPeasy',
      error.response?.status || 500,
      error.message
    );
    logger.error(apiError.internalMessage, { error, orderId });
    return {
      content: [{ type: 'text', text: apiError.userMessage }],
      isError: true
    };
  }
  throw error;
}
```

## Data Flow

### Request Flow (Typical Tool Execution)

```
[LLM Client Request]
    ↓ (HTTP POST /mcp with JSON-RPC 2.0)
[Express Middleware] → [Rate Limiter] → [Auth Check]
    ↓
[StreamableHTTPServerTransport]
    ↓ (parse JSON-RPC, validate session)
[Protocol Layer] → [Request Router]
    ↓
[McpServer.handleToolCall]
    ↓ (validate input schema with Zod)
[Tool Handler] → [Circuit Breaker Check]
    ↓
[Retry Wrapper] → [External API Client]
    ↓ (HTTP request to MRPeasy)
[MRPeasy API] → [JSON Response]
    ↓
[Cache Layer] ← [Store response with TTL]
    ↓ (validate output schema with Zod)
[Tool Handler] → [Format Response]
    ↓
[Protocol Layer] → [JSON-RPC Response]
    ↓
[HTTP Response] → [LLM Client]
```

### Pagination Flow (Large Result Sets)

```
[Client Request] → tools/list (no cursor)
    ↓
[McpServer] → [Generate Page 1 + nextCursor]
    ↓
[Client Request] → tools/list (cursor: "page2")
    ↓
[McpServer] → [Validate cursor, return Page 2]
    ↓ (repeat until no nextCursor)
[Complete Result Set]
```

### Error Handling Flow

```
[External API Call]
    ↓
[Network Timeout / 429 / 503]
    ↓
[Retry Logic] → [Exponential Backoff]
    ↓ (after 3 attempts)
[Circuit Breaker] → [Trip OPEN]
    ↓
[Return JSON-RPC Error]
    ↓ (code: -32603, message: sanitized)
[Log Internal Details] → [Monitoring System]
```

### Key Data Flows

1. **Session Initialization:** Client sends `initialize` request → Server generates UUID session ID → Server stores transport in Map → Returns session ID in response headers → Subsequent requests include `mcp-session-id` header

2. **Rate Limit Enforcement:** Extract session ID → Lookup timestamp array in Map → Filter expired timestamps → Check count against limit → Either allow request (add timestamp) or reject with 429 error

3. **Caching Strategy:** Before API call → Check cache with key (endpoint + params hash) → If hit, return cached data → If miss, call API → Store response with TTL → Return data

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-1k requests/day** | Single Node.js process, in-memory rate limiting, no cache needed. StreamableHTTPServerTransport in stateless mode works fine. |
| **1k-100k requests/day** | Add Redis for rate limiting and caching. Use session-based transport for better tracking. Implement circuit breakers for external API calls. Monitor error rates and latency. |
| **100k-1M+ requests/day** | Horizontal scaling: multiple server instances behind load balancer. Redis cluster for distributed cache/rate limiting. Move to queue-based architecture (Redis/Bull) for async processing. Add CDN for static responses. Implement per-tenant quotas. |

### Scaling Priorities

1. **First bottleneck: External API rate limits**
   - Symptoms: Frequent 429 errors from MRPeasy, increased latency
   - Fix: Implement aggressive caching (Redis with 5-15min TTL), rate limit client requests to stay under API quota, add request queueing to smooth traffic spikes

2. **Second bottleneck: Session storage memory**
   - Symptoms: Memory leaks, session lookup slowdowns, OOM crashes
   - Fix: Migrate from in-memory Map to Redis with automatic expiration, implement session cleanup on timeout (use `onsessionclosed` callback), consider stateless mode if session state isn't critical

3. **Third bottleneck: Single process CPU/concurrency**
   - Symptoms: High event loop lag, slow response times under load
   - Fix: Run multiple Node.js processes (PM2 cluster mode), use Docker + Kubernetes for orchestration, move CPU-intensive work (schema validation, JSON parsing) to worker threads

## Anti-Patterns

### Anti-Pattern 1: Storing API Credentials in Code

**What people do:** Hard-code API keys, tokens, or passwords in source files or commit `.env` to git.

**Why it's wrong:** Credentials leak in git history, can't rotate secrets without redeploying, violates security best practices, makes it impossible to use different credentials per environment.

**Do this instead:** Use environment variables loaded from `.env` (gitignored), store secrets in secure vaults (AWS Secrets Manager, HashiCorp Vault), inject credentials at runtime via container orchestration.

```typescript
// ❌ BAD
const API_KEY = 'sk-1234567890abcdef';

// ✅ GOOD
import { config } from './utils/config';
const API_KEY = config.mrpeasyApiKey; // Loaded from process.env
```

### Anti-Pattern 2: Not Implementing Pagination

**What people do:** Return all results in a single response, exceeding JSON-RPC size limits or overwhelming clients.

**Why it's wrong:** Large responses cause timeouts, memory issues, poor UX. MCP spec requires pagination support for `tools/list`, `resources/list`.

**Do this instead:** Implement cursor-based pagination, return `nextCursor` in response, validate cursors and return `-32602` for invalid ones.

```typescript
// ❌ BAD
server.listTools(() => {
  return { tools: allTools }; // Could be 1000s of tools
});

// ✅ GOOD
server.listTools((cursor?: string) => {
  const pageSize = 50;
  const startIdx = cursor ? parseInt(Buffer.from(cursor, 'base64').toString()) : 0;
  const tools = allTools.slice(startIdx, startIdx + pageSize);
  const nextCursor = startIdx + pageSize < allTools.length
    ? Buffer.from(String(startIdx + pageSize)).toString('base64')
    : undefined;
  return { tools, nextCursor };
});
```

### Anti-Pattern 3: Ignoring Error Codes from External APIs

**What people do:** Catch all errors generically, retry on 4xx errors, don't distinguish between transient and permanent failures.

**Why it's wrong:** Wastes resources retrying client errors (400, 401, 404), doesn't handle rate limits (429) or server errors (503) appropriately, provides poor error messages to users.

**Do this instead:** Check HTTP status codes, handle 429 (rate limit) by respecting `Retry-After` header, retry only on transient errors (429, 500, 502, 503, 504), fail fast on client errors (400, 401, 403, 404).

```typescript
// ❌ BAD
try {
  return await axios.get(url);
} catch (error) {
  // Retry everything indiscriminately
  return retryWithBackoff(() => axios.get(url));
}

// ✅ GOOD
try {
  return await axios.get(url);
} catch (error) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
      throw new RateLimitError(retryAfter);
    }
    if ([500, 502, 503, 504].includes(status!)) {
      return retryWithBackoff(() => axios.get(url));
    }
    // Don't retry 4xx client errors
    throw new APIError('MRPeasy', status!, error.message);
  }
  throw error;
}
```

### Anti-Pattern 4: Mixing Transport and Business Logic

**What people do:** Put API client code, validation, error handling directly in Express route handlers.

**Why it's wrong:** Tightly couples transport layer to business logic, makes testing difficult, prevents reusing logic with different transports (stdio vs HTTP).

**Do this instead:** Separate concerns: Express handles HTTP/session management, McpServer handles protocol, tool handlers contain business logic, services layer interfaces with external APIs.

```typescript
// ❌ BAD
app.post('/mcp', async (req, res) => {
  const { method, params } = req.body;
  if (method === 'tools/call' && params.name === 'get-order') {
    const order = await axios.get(`${MRPEASY_API}/orders/${params.arguments.orderId}`);
    res.json({ result: order.data });
  }
});

// ✅ GOOD
// server.ts - Transport layer
app.post('/mcp', async (req, res) => {
  await transport.handleRequest(req, res, req.body);
});

// mcp/tools/orders.ts - Business logic
server.registerTool('get-order', schema, async ({ orderId }) => {
  const order = await mrpeasyService.getOrder(orderId);
  return { content: [...], structuredContent: { order } };
});

// services/mrpeasy/client.ts - API layer
export async function getOrder(orderId: string) {
  return circuitBreaker.execute(() =>
    retryWithBackoff(() => axios.get(`/orders/${orderId}`))
  );
}
```

### Anti-Pattern 5: Not Setting Timeouts

**What people do:** Make unbounded HTTP requests without timeouts, rely on default timeouts (often 0 = infinite).

**Why it's wrong:** Hanging requests tie up resources, can cause cascading failures, poor UX with no feedback.

**Do this instead:** Set aggressive timeouts on all external API calls (e.g., 5-30 seconds), configure separate connect and request timeouts, fail fast and return error to user.

```typescript
// ❌ BAD
await axios.get(url); // No timeout, waits forever

// ✅ GOOD
await axios.get(url, {
  timeout: 10000, // 10 second total timeout
  timeoutErrorMessage: 'MRPeasy API request timed out'
});

// Even better: Global axios defaults
axios.defaults.timeout = 10000;
axios.defaults.validateStatus = (status) => status < 500;
```

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **MRPeasy API** | REST client with OAuth 2.0 / API key | Rate limits: ~100 req/min per API key. Requires circuit breaker for 503 errors during maintenance windows. |
| **Redis Cache** | Direct connection via `ioredis` | Use for caching API responses (TTL 5-15min), session storage, rate limiting. Single instance OK for <100k req/day, cluster for production scale. |
| **Redis Queue** | Bull/BullMQ for async jobs | Optional: Use for long-running operations (bulk imports, reports). Decouple tool execution from HTTP request lifecycle. |
| **Monitoring (Datadog/Sentry)** | SDK integration, error reporting | Track error rates, latency percentiles (p50, p95, p99), external API call counts. Set alerts on circuit breaker trips. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **McpServer ↔ Services** | Direct function calls | Keep services framework-agnostic. Services should not import MCP SDK types. Return domain objects, let tool handlers format responses. |
| **Tools ↔ Middleware** | Decorator/wrapper functions | Rate limiter, circuit breaker, retry logic wrap tool handlers. Applied at registration time, not inside handler. |
| **Cache ↔ API Client** | Cache-aside pattern | Check cache before API call. On miss, call API then populate cache. Handle cache failures gracefully (log and proceed). |
| **Session Manager ↔ Transport** | Callback hooks | Transport fires `onsessioninitialized`, `onsessionclosed` callbacks. Session manager maintains Map/Redis of active sessions. |

## Production Deployment Checklist

### Environment Configuration
- [ ] All secrets loaded from environment variables or vault
- [ ] Separate configs for dev/staging/production
- [ ] Connection pooling configured for Redis
- [ ] Timeouts set on all external HTTP calls

### Resilience
- [ ] Rate limiting implemented per session/client
- [ ] Circuit breakers on all external API calls
- [ ] Retry logic with exponential backoff and jitter
- [ ] Caching strategy for frequently accessed data
- [ ] Request timeouts to prevent hanging connections

### Monitoring
- [ ] Structured logging with correlation IDs
- [ ] Error tracking (Sentry/Datadog)
- [ ] Metrics: request count, latency, error rate
- [ ] Circuit breaker state changes logged/alerted
- [ ] Session count and memory usage tracked

### Security
- [ ] Input validation with Zod schemas on all tools
- [ ] Output sanitization (no internal errors to LLMs)
- [ ] API credentials rotated regularly
- [ ] HTTPS enforced in production
- [ ] Rate limiting to prevent abuse

### Scalability
- [ ] Horizontal scaling tested (multiple instances)
- [ ] Session state stored in Redis (not in-memory)
- [ ] Load balancer configured with health checks
- [ ] Graceful shutdown implemented (drain connections)
- [ ] Database connection pooling configured

## Transport Evolution (2024-2025)

### Deprecated: SSE Transport (Pre-March 2025)

The original SSE implementation required **two separate endpoints**:
- `/sse` - Persistent SSE connection for server → client messages
- `/sse/messages` - HTTP POST endpoint for client → server requests

**Problems:**
- Connection management complexity (coordinate two connections)
- Resource intensive (long-lived SSE connections per client)
- Reliability issues (responses lost if SSE connection drops)
- Implementation overhead (synchronize state between endpoints)

### Modern: Streamable HTTP (Post-March 2025)

The **current standard** uses a **single HTTP endpoint** (`/mcp`):
- Client sends JSON-RPC requests via HTTP POST
- Server responds with either:
  - `Content-Type: application/json` (single response)
  - `Content-Type: text/event-stream` (SSE stream for notifications)
- Client includes `Accept: application/json, text/event-stream` header

**Benefits:**
- Simpler architecture (one connection, one endpoint)
- Better scalability (stateless mode option)
- Easier to deploy behind load balancers/proxies
- Backward compatible with SSE for notifications

**When to Use:**
- **Stateless mode** (`sessionIdGenerator: undefined`): Simple REST-like deployments, no session tracking needed
- **Session mode** (`sessionIdGenerator: () => randomUUID()`): Multi-turn conversations, per-client rate limiting, resumable sessions

## Sources

### Official Documentation (HIGH Confidence)
- [Model Context Protocol Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25) - Official MCP spec from Anthropic
- [MCP TypeScript SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk) - Official TypeScript SDK repository and API docs
- [MCP Transports Documentation](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) - Official transport layer specification

### Implementation Guides (HIGH Confidence)
- [Add Custom Tools to TypeScript MCP Servers](https://mcpcat.io/guides/adding-custom-tools-mcp-server-typescript/) - Practical guide for tool implementation
- [Error Handling in MCP Servers - Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) - Error handling patterns
- [Error Handling in MCP TypeScript SDK](https://dev.to/yigit-konur/error-handling-in-mcp-typescript-sdk-2ol7) - SDK-specific error patterns

### Best Practices (MEDIUM-HIGH Confidence)
- [Microsoft MCP for Beginners - Best Practices](https://github.com/microsoft/mcp-for-beginners/blob/main/08-BestPractices/README.md) - Microsoft's guide to MCP best practices
- [Production-Ready MCP Server (Yahoo Finance)](https://github.com/kanishka-namdeo/yfnhanced-mcp) - Real-world example with caching, rate limiting, circuit breakers
- [Building Production-Ready MCP Server](https://medium.com/@arifdewi/building-your-first-production-ready-mcp-server-a-weekend-project-that-actually-shipped-131305c69d54) - Production deployment case study

### Architecture & Patterns (MEDIUM Confidence)
- [Why MCP Deprecated SSE and Went with Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) - Transport evolution rationale
- [Understanding MCP HTTP+SSE Change](https://blog.christianposta.com/ai/understanding-mcp-recent-change-around-http-sse/) - Technical deep dive on transport changes
- [MCP Best Practices: Architecture & Implementation](https://modelcontextprotocol.info/docs/best-practices/) - Community best practices guide

### Project Structure Examples (MEDIUM Confidence)
- [MCP Server Starter TypeScript](https://github.com/alexanderop/mcp-server-starter-ts) - Minimal starter template
- [How to Build MCP Server with TypeScript](https://www.freecodecamp.org/news/how-to-build-a-custom-mcp-server-with-typescript-a-handbook-for-developers/) - Step-by-step tutorial
- [Build MCP Server Tutorial](https://collabnix.com/how-to-build-mcp-server-using-typescript-from-scratch-complete-tutorial/) - Complete tutorial from scratch

### Ecosystem & Adoption (LOW-MEDIUM Confidence)
- [One Year of MCP: November 2025 Spec Release](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/) - Official anniversary post
- [Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol) - Original announcement from Anthropic
- [MCP Guide: Enterprise Adoption 2025](https://guptadeepak.com/the-complete-guide-to-model-context-protocol-mcp-enterprise-adoption-market-trends-and-implementation-strategies/) - Market trends and adoption

### Context7 Documentation (HIGH Confidence)
- [MCP TypeScript SDK Examples](https://context7.com/modelcontextprotocol/typescript-sdk/llms.txt) - Code examples from Context7
- [MCP Python SDK](https://context7.com/modelcontextprotocol/python-sdk) - Python implementation patterns (for comparison)

---
*Architecture research for: MCP Server for External API Integration (MRPeasy)*
*Researched: 2026-01-19*
*Primary sources: Official MCP specification, TypeScript SDK documentation, production implementations*
