# Phase 1: Foundation + Objectives - Research

**Researched:** 2026-01-23
**Domain:** GraphQL MCP Server infrastructure + Perdoo Objectives CRUD
**Confidence:** HIGH (patterns from live MRPeasy codebase + verified Perdoo API details)

## Summary

This phase establishes the full infrastructure for a GraphQL-to-MCP bridge server and proves the integration pattern end-to-end with Objectives (the highest-confidence entity). The architecture replicates the MRPeasy MCP server exactly -- same dependencies, same layered structure, same resilience stack -- with GraphQL-specific adaptations for error handling, request format, and pagination.

The standard approach is: copy MRPeasy's scaffolding (package.json, tsconfig.json, Dockerfile, server.ts, lib/), build a GraphQL-aware client (PerdooClient with `execute()` method), run introspection to discover the actual schema, then implement Objective tools using the discovered schema. The resilience stack (queue -> circuit breaker -> retry -> rate limiter) is reused from MRPeasy with two critical modifications: (1) response parsing checks for GraphQL `errors` array in 200 responses, and (2) mutations are never retried.

**Primary recommendation:** Start with project scaffolding and introspection query. The introspection results determine the exact query/mutation signatures for all subsequent tool work.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.15.0 | MCP protocol (McpServer, StreamableHTTPServerTransport) | Same as MRPeasy, proven pattern |
| express | ^4.21.0 | HTTP server for MCP-over-HTTP transport | Same as MRPeasy, session-based architecture |
| zod | ^3.25.0 | Tool input validation + env validation | Same as MRPeasy, MCP SDK integration |
| typescript | ^5.7.3 | Type safety | Same as MRPeasy |
| Node.js native fetch | >=18.0.0 | GraphQL HTTP client | No external HTTP library needed |

### Dev Dependencies

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | ^4.19.2 | Dev server with hot reload | Development only |
| @types/express | ^5.0.0 | Express type definitions | TypeScript compilation |
| @types/node | ^22.10.7 | Node.js type definitions | TypeScript compilation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw fetch | graphql-request | Adds ~474KB (graphql peer dep), unnecessary for POST+JSON |
| Raw fetch | Apollo Client | Massive (~50KB min), frontend caching we never need |
| Hand-typed interfaces | graphql-codegen | 5+ dev deps, requires introspection access at build time, API surface too small |
| Zod inline schemas | graphql-codegen TypedDocumentNode | Over-engineering for 5 entities x 4 operations |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk@^1.15.0 express@^4.21.0 zod@^3.25.0
npm install -D @types/express@^5.0.0 @types/node@^22.10.7 tsx@^4.19.2 typescript@^5.7.3
```

## Architecture Patterns

### Recommended Project Structure

```
mcp/perdoo/
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
└── src/
    ├── server.ts                          # Express + StreamableHTTP (copy from MRPeasy)
    ├── lib/
    │   ├── env.ts                         # PERDOO_API_TOKEN, PORT, NODE_ENV validation
    │   ├── errors.ts                      # PerdooApiError, McpToolError, error factories
    │   └── logger.ts                      # Structured logging to stderr (copy from MRPeasy)
    ├── mcp/
    │   ├── index.ts                       # Re-exports createMcpServer
    │   └── tools/
    │       ├── index.ts                   # createMcpServer(), resource + tool registration
    │       ├── objectives.ts              # registerObjectiveTools(server, client)
    │       └── error-handler.ts           # GraphQL/HTTP error -> MCP error mapping
    └── services/
        └── perdoo/
            ├── index.ts                   # createPerdooClient() factory + barrel exports
            ├── client.ts                  # PerdooClient class (execute + typed methods)
            ├── types.ts                   # Response/input interfaces
            ├── operations/
            │   ├── introspection.ts       # Schema introspection query
            │   └── objectives.ts          # Objective queries and mutations
            ├── rate-limiter.ts            # Token bucket (30 req/10s conservative)
            ├── retry.ts                   # Exponential backoff (queries only)
            ├── circuit-breaker.ts         # Circuit breaker (5 failures, 30s timeout)
            └── request-queue.ts           # Single-concurrency queue
```

### Pattern 1: PerdooClient with Generic GraphQL Executor

**What:** Single client class with private `execute<T>()` for all GraphQL transport and public typed methods per entity operation.
**When to use:** All GraphQL communication goes through this class.
**Source:** Mirrors MRPeasy's `MrpEasyClient` pattern (private `request<T>()` + public domain methods).

```typescript
// services/perdoo/client.ts
export interface PerdooClientConfig {
  token: string;
  endpoint?: string;
  maxRetries?: number;
  circuitBreakerEnabled?: boolean;
}

export class PerdooClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly rateLimiter: TokenBucket;
  private readonly queue: RequestQueue;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries: number;

  constructor(config: PerdooClientConfig) {
    this.endpoint = config.endpoint ?? 'https://api-eu.perdoo.com/graphql/';
    this.token = config.token;
    this.rateLimiter = createRateLimiter();
    this.queue = createRequestQueue();
    this.circuitBreaker = createCircuitBreaker();
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Generic GraphQL executor. All operations flow through here.
   * Queue -> Circuit Breaker -> Retry (queries only) -> Rate Limiter -> fetch POST
   *
   * @param operation - GraphQL query or mutation string
   * @param variables - GraphQL variables object
   * @param options - Execution options (isMutation controls retry behavior)
   */
  async execute<T>(
    operation: string,
    variables?: Record<string, unknown>,
    options?: { isMutation?: boolean; operationName?: string }
  ): Promise<T> {
    return this.queue.enqueue(async () => {
      return this.circuitBreaker.execute(async () => {
        const executeFn = async () => {
          await this.rateLimiter.waitForToken();
          return this.executeRequest<T>(operation, variables, options?.operationName);
        };

        // CRITICAL: Never retry mutations (INFRA-04)
        if (options?.isMutation) {
          return executeFn();
        }

        return withRetry(executeFn, { maxAttempts: this.maxRetries });
      });
    });
  }

  /**
   * Raw HTTP request to GraphQL endpoint.
   * Handles both HTTP-level and GraphQL-level errors.
   */
  private async executeRequest<T>(
    operation: string,
    variables?: Record<string, unknown>,
    operationName?: string
  ): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        query: operation,
        variables,
        ...(operationName && { operationName }),
      }),
    });

    // HTTP-level errors (network, 5xx, 401, etc.)
    if (!response.ok) {
      throw new PerdooHttpError(response.status, response.statusText);
    }

    const json = await response.json() as GraphQLResponse<T>;

    // GraphQL-level errors (200 with errors array) -- INFRA-03
    if (json.errors?.length) {
      throw new PerdooApiError(json.errors);
    }

    if (!json.data) {
      throw new PerdooApiError([{ message: 'No data returned from GraphQL' }]);
    }

    return json.data;
  }

  // === Typed public methods ===

  async listObjectives(params?: { first?: number; after?: string }): Promise<ObjectivesData> {
    return this.execute<ObjectivesData>(
      OBJECTIVES_QUERY,
      { first: params?.first ?? 20, after: params?.after ?? null },
      { operationName: 'ListObjectives' }
    );
  }

  async getObjective(id: string): Promise<ObjectiveData> {
    return this.execute<ObjectiveData>(
      OBJECTIVE_QUERY,
      { id },
      { operationName: 'GetObjective' }
    );
  }

  async createObjective(input: CreateObjectiveInput): Promise<CreateObjectiveData> {
    return this.execute<CreateObjectiveData>(
      CREATE_OBJECTIVE_MUTATION,
      { input },
      { isMutation: true, operationName: 'CreateObjective' }
    );
  }

  async updateObjective(id: string, input: UpdateObjectiveInput): Promise<UpdateObjectiveData> {
    return this.execute<UpdateObjectiveData>(
      UPDATE_OBJECTIVE_MUTATION,
      { id, input },
      { isMutation: true, operationName: 'UpdateObjective' }
    );
  }

  async introspect(): Promise<IntrospectionData> {
    return this.execute<IntrospectionData>(
      INTROSPECTION_QUERY,
      undefined,
      { operationName: 'IntrospectionQuery' }
    );
  }
}
```

### Pattern 2: GraphQL Operations as String Constants

**What:** Query/mutation strings defined as exported constants in per-entity files.
**When to use:** All GraphQL operations. Never inline queries in tool files.
**Source:** Architecture decision from prior research.

```typescript
// services/perdoo/operations/objectives.ts

export const OBJECTIVES_QUERY = `
  query ListObjectives($first: Int, $after: String) {
    objectives(first: $first, after: $after) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          name
          status
          progress
          timeframe { name }
        }
      }
    }
  }
`;

export const OBJECTIVE_QUERY = `
  query GetObjective($id: ID!) {
    objective(id: $id) {
      id
      name
      description
      status
      progress
      timeframe { name }
      lead { id name }
      groups { edges { node { id name } } }
      results {
        edges {
          node {
            id
            name
            type
            normalizedValue
            status
          }
        }
      }
    }
  }
`;

export const CREATE_OBJECTIVE_MUTATION = `
  mutation CreateObjective($input: CreateObjectiveInput!) {
    createObjective(input: $input) {
      id
      name
      status
    }
  }
`;

export const UPDATE_OBJECTIVE_MUTATION = `
  mutation UpdateObjective($id: ID!, $input: UpdateObjectiveInput!) {
    updateObjective(id: $id, input: $input) {
      id
      name
      status
      progress
    }
  }
`;
```

**IMPORTANT:** These operation signatures are LOW confidence. The introspection query (INFRA-07) MUST run first to discover exact field names, query argument names, and mutation input type names. The operations above are templates to be updated once introspection confirms the real schema.

### Pattern 3: Tool Registration (registerXTools)

**What:** Each entity file exports a `registerXTools(server, client)` function.
**When to use:** All tool files follow this pattern exactly.
**Source:** Copied from MRPeasy `inventory.ts`, `orders.ts`, etc.

```typescript
// mcp/tools/objectives.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PerdooClient } from '../../services/perdoo/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

export function registerObjectiveTools(
  server: McpServer,
  client: PerdooClient
): void {
  server.tool(
    'list_objectives',
    'List objectives from Perdoo with pagination. Returns name, status, progress, and timeframe. Use cursor parameter for subsequent pages.',
    {
      limit: z.number().int().min(1).max(50).default(20)
        .describe('Number of objectives to return (max 50)'),
      cursor: z.string().optional()
        .describe('Pagination cursor from previous response. Omit for first page.'),
    },
    async (params) => {
      logger.debug('list_objectives called', { params });
      try {
        const result = await client.listObjectives({
          first: params.limit,
          after: params.cursor,
        });

        // Flatten Relay connection for LLM consumption
        const objectives = result.objectives.edges.map(edge => edge.node);
        const { pageInfo } = result.objectives;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              summary: `${objectives.length} objectives returned${pageInfo.hasNextPage ? ' (more available)' : ''}`,
              pagination: {
                hasNextPage: pageInfo.hasNextPage,
                endCursor: pageInfo.endCursor,
                count: objectives.length,
              },
              items: objectives,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'list_objectives');
      }
    }
  );

  // ... get_objective, create_objective, update_objective follow same pattern

  logger.info('Objective tools registered');
}
```

### Pattern 4: Environment Validation (Fail-Fast)

**What:** Zod schema validates PERDOO_API_TOKEN at startup. Missing token causes immediate process.exit(1).
**When to use:** server.ts entry point, before any other initialization.
**Source:** MRPeasy `lib/env.ts` pattern.

```typescript
// lib/env.ts
import { z } from 'zod';
import { logger } from './logger.js';

const envSchema = z.object({
  PERDOO_API_TOKEN: z
    .string({ required_error: 'PERDOO_API_TOKEN is required' })
    .min(1, 'PERDOO_API_TOKEN cannot be empty'),
  PORT: z
    .string()
    .default('3001')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    logger.error('Environment validation failed', {
      errors: result.error.errors.map((e) => ({ path: e.path, message: e.message })),
    });
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  logger.info('Environment validated successfully', { port: result.data.PORT, env: result.data.NODE_ENV });
  return result.data;
}

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) { _env = validateEnv(); }
  return _env;
}
```

### Pattern 5: GraphQL Error Classification

**What:** Two-layer error handling: HTTP-level errors (network/status codes) and GraphQL-level errors (200 with errors array).
**When to use:** Every GraphQL response must be checked for both layers.
**Source:** GraphQL over HTTP specification + INFRA-03 requirement.

```typescript
// lib/errors.ts (GraphQL-specific additions)

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
}

interface GraphQLResponse<T> {
  data: T | null;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}

export class PerdooApiError extends Error {
  public readonly errors: GraphQLError[];
  public readonly isAuthError: boolean;
  public readonly isRateLimited: boolean;
  public readonly isRetryable: boolean;

  constructor(errors: GraphQLError[]) {
    const message = errors.map(e => e.message).join('; ');
    super(message);
    this.name = 'PerdooApiError';
    this.errors = errors;

    this.isAuthError = errors.some(e =>
      e.extensions?.code === 'UNAUTHENTICATED' ||
      e.message.toLowerCase().includes('authentication') ||
      e.message.toLowerCase().includes('unauthorized')
    );
    this.isRateLimited = errors.some(e =>
      e.extensions?.code === 'RATE_LIMITED' ||
      e.message.toLowerCase().includes('rate limit') ||
      e.message.toLowerCase().includes('throttl')
    );
    this.isRetryable = this.isRateLimited && !this.isAuthError;
  }
}

export class PerdooHttpError extends Error {
  public readonly status: number;
  public readonly isRetryable: boolean;

  constructor(status: number, statusText: string) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'PerdooHttpError';
    this.status = status;
    this.isRetryable = [429, 502, 503, 504].includes(status);
  }
}
```

### Pattern 6: Instructions Resource

**What:** Server-level resource (`perdoo://instructions`) providing LLM usage guidance.
**When to use:** Registered in createMcpServer(), same pattern as MRPeasy.
**Source:** MRPeasy `tools/index.ts` INSTRUCTIONS_RESOURCE pattern.

```typescript
// In mcp/tools/index.ts
server.resource(
  'instructions',
  'perdoo://instructions',
  {
    description: 'Usage guide for the Perdoo MCP server. Read this to understand available tools, best practices, and entity relationships.',
    mimeType: 'text/markdown',
  },
  async () => ({
    contents: [{
      uri: 'perdoo://instructions',
      mimeType: 'text/markdown',
      text: INSTRUCTIONS_RESOURCE,
    }],
  })
);
```

### Anti-Patterns to Avoid

- **Retrying mutations:** NEVER retry create/update operations. Network timeout does not mean the mutation failed on the server side. Duplicates are unrecoverable.
- **Checking only HTTP status:** GraphQL returns 200 for failures. Always parse the response body `errors` array.
- **Exposing raw GraphQL structure:** Flatten edges/node/pageInfo before returning to LLM. Never return raw Relay connection format.
- **String interpolation in queries:** ALWAYS use GraphQL variables for dynamic values. Never interpolate user input into query strings.
- **Over-fetching fields:** List operations return summary fields only. Detail operations return full fields.
- **Creating new client per request:** Use memoized singleton (same as MRPeasy `createMrpEasyClient()`).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token bucket rate limiting | Simple counter | Copy MRPeasy `rate-limiter.ts` | Refill timing, concurrent access, burst handling are subtle |
| Exponential backoff retry | Simple loop with sleep | Copy MRPeasy `retry.ts` | Jitter, Retry-After parsing, max delay cap |
| Circuit breaker | Boolean flag | Copy MRPeasy `circuit-breaker.ts` | State machine (CLOSED/OPEN/HALF_OPEN), threshold management |
| Request queue | Array + processing flag | Copy MRPeasy `request-queue.ts` | Promise chaining, FIFO ordering, error propagation |
| MCP session management | Custom WebSocket | StreamableHTTPServerTransport from SDK | Session lifecycle, SSE, protocol compliance |
| Env validation | Manual process.env checks | Zod schema with safeParse | Type inference, clear error messages, defaults |
| Structured logging | console.log | Copy MRPeasy `logger.ts` | stderr-only (never corrupt MCP stdout), timestamps, levels |

**Key insight:** All resilience components can be copied from MRPeasy with minimal modification. The only new code is the GraphQL-specific request/response handling in `client.ts` and `errors.ts`.

## Common Pitfalls

### Pitfall 1: GraphQL 200 Responses Treated as Success

**What goes wrong:** GraphQL returns HTTP 200 for errors. The resilience stack from MRPeasy (checking `response.ok`) misses GraphQL-level failures entirely. Circuit breaker never opens, retry never triggers.
**Why it happens:** Direct port of REST error handling patterns.
**How to avoid:** Parse response body BEFORE determining success. Check `json.errors` array even when HTTP status is 200. Map `errors[].extensions.code` to retry/auth/validation categories.
**Warning signs:** All API calls log status 200 but tools return errors. Circuit breaker stays closed during outages.

### Pitfall 2: Mutation Retry Creating Duplicates

**What goes wrong:** `create_objective` mutation times out, retry sends it again, duplicate objective created in Perdoo.
**Why it happens:** MRPeasy only does GET requests (all idempotent). Perdoo has mutations with side effects.
**How to avoid:** `execute()` method accepts `isMutation` option. When true, skip retry entirely. Only retry queries.
**Warning signs:** Duplicate entities in Perdoo after network blips.

### Pitfall 3: Bearer Token Expiry Mid-Session

**What goes wrong:** Token validated at startup but expires later. All tools fail with opaque errors.
**Why it happens:** MRPeasy uses non-expiring Basic Auth credentials.
**How to avoid:** Detect auth errors specifically from GraphQL errors. Return clear "token expired" message. Exclude auth errors from circuit breaker failure counting (they are not infrastructure failures).
**Warning signs:** All tools failing simultaneously after a period of working.

### Pitfall 4: Undocumented Rate Limits

**What goes wrong:** Rate limiter configured incorrectly because Perdoo does not publicly document limits.
**Why it happens:** No official rate limit documentation available.
**How to avoid:** Start conservative (30 req/10s, capacity 30, refill 3/s). Log all error responses for pattern discovery. Watch for rate-limit-related error messages. Adjust after observing real behavior.
**Warning signs:** Unexpected failures under moderate load, errors mentioning "rate" or "throttle".

### Pitfall 5: Schema Mismatch After Introspection

**What goes wrong:** Introspection discovers field names/types, but hardcoded operations use wrong names (from prior research guesses).
**Why it happens:** Operations defined before introspection runs; developer forgets to update.
**How to avoid:** Introspection (INFRA-07) runs BEFORE any operation file is finalized. Operation strings are written/updated based on introspection output.
**Warning signs:** GraphQL validation errors referencing unknown fields.

## Code Examples

### Express Server Entry Point (server.ts)

```typescript
// Source: MRPeasy server.ts (copy with name/port changes)
import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './lib/logger.js';
import { validateEnv, getEnv } from './lib/env.js';
import { createMcpServer } from './mcp/index.js';

// Fail fast on missing PERDOO_API_TOKEN (INFRA-01)
try {
  validateEnv();
} catch (error) {
  logger.error('Failed to start server: environment validation failed');
  process.exit(1);
}

const env = getEnv();
const app = express();
app.use(express.json());

const transports: Map<string, StreamableHTTPServerTransport> = new Map();

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', version: '0.1.0', sessions: transports.size });
});

// MCP POST (session init + requests) -- identical to MRPeasy
app.post('/mcp', async (req: Request, res: Response) => {
  // ... same session management as MRPeasy server.ts
});

// MCP GET (SSE) + DELETE (session close) -- identical to MRPeasy
// ... copy from MRPeasy

app.listen(env.PORT, () => {
  logger.info('Perdoo MCP server started', { port: env.PORT, env: env.NODE_ENV });
});
```

### Introspection Query (INFRA-07)

```typescript
// services/perdoo/operations/introspection.ts
export const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType {
        fields {
          name
          args {
            name
            type { name kind ofType { name kind ofType { name kind } } }
          }
          type { name kind ofType { name kind ofType { name kind } } }
        }
      }
      mutationType {
        fields {
          name
          args {
            name
            type { name kind ofType { name kind ofType { name kind } } }
          }
          type { name kind ofType { name kind ofType { name kind } } }
        }
      }
      types {
        name
        kind
        fields {
          name
          type { name kind ofType { name kind ofType { name kind } } }
        }
        inputFields {
          name
          type { name kind ofType { name kind ofType { name kind } } }
        }
        enumValues { name }
      }
    }
  }
`;
```

### GraphQL Error Handler (error-handler.ts)

```typescript
// mcp/tools/error-handler.ts
import { PerdooApiError, PerdooHttpError } from '../../services/perdoo/index.js';
import { CircuitBreakerOpenError } from '../../services/perdoo/circuit-breaker.js';
import { logger } from '../../lib/logger.js';

export function handleToolError(
  error: unknown,
  toolName: string
): { content: { type: 'text'; text: string }[]; isError: true } {
  logger.error(`${toolName} error`, {
    error: error instanceof Error ? error.message : String(error),
  });

  // HTTP-level errors (network, 5xx, etc.)
  if (error instanceof PerdooHttpError) {
    if (error.status === 401 || error.status === 403) {
      return formatMcpError('Authentication failed. PERDOO_API_TOKEN may be invalid or expired.', 'Check token and restart server.');
    }
    if (error.status === 429) {
      return formatMcpError('Rate limit exceeded. Try again in a few seconds.', 'Wait and retry.');
    }
    return formatMcpError('Perdoo service is temporarily unavailable.', 'Try again later.');
  }

  // GraphQL-level errors (200 with errors array)
  if (error instanceof PerdooApiError) {
    if (error.isAuthError) {
      return formatMcpError('Authentication failed. PERDOO_API_TOKEN may be invalid or expired.', 'Check token and restart server.');
    }
    if (error.isRateLimited) {
      return formatMcpError('Rate limit exceeded. Try again in a few seconds.', 'Wait and retry.');
    }
    // Return actual GraphQL error messages (usually informative for validation errors)
    return formatMcpError(error.message, 'Check input parameters.');
  }

  // Circuit breaker
  if (error instanceof CircuitBreakerOpenError) {
    return formatMcpError('Perdoo service is temporarily unavailable (circuit breaker open).', 'Wait 30 seconds and try again.');
  }

  return formatMcpError('An unexpected error occurred.', 'Try again.');
}

function formatMcpError(
  message: string,
  suggestion: string
): { content: { type: 'text'; text: string }[]; isError: true } {
  return {
    content: [{ type: 'text' as const, text: `${message}\n\nSuggestion: ${suggestion}` }],
    isError: true,
  };
}
```

### Rate Limiter (Conservative for Perdoo)

```typescript
// services/perdoo/rate-limiter.ts
// Copy from MRPeasy, change only the factory defaults:
export function createRateLimiter(): TokenBucket {
  // Conservative: 30 capacity, 3 tokens/second
  // Perdoo rate limits are undocumented; start safe
  return new TokenBucket(30, 3);
}
```

### Retry (Query-Only)

```typescript
// services/perdoo/retry.ts
// Copy from MRPeasy with one critical change:
// The client.execute() method controls whether retry is used.
// Retry is ONLY called for queries, NEVER for mutations (INFRA-04).
// The retry module itself stays the same -- the PerdooClient
// decides whether to wrap a call in withRetry() based on isMutation.

// Additional change: retryable determination must handle PerdooApiError
function isRetryable(error: unknown, config: RetryConfig): boolean {
  if (error instanceof PerdooApiError) {
    return error.isRetryable; // Only rate-limited errors
  }
  if (error instanceof PerdooHttpError) {
    return error.isRetryable; // 429, 502, 503, 504
  }
  return false;
}
```

### Client Factory with Memoization

```typescript
// services/perdoo/index.ts
import { getEnv } from '../../lib/env.js';
import { PerdooClient } from './client.js';

export * from './types.js';
export { PerdooClient, PerdooApiError, PerdooHttpError } from './client.js';
export { CircuitBreakerOpenError } from './circuit-breaker.js';

let clientInstance: PerdooClient | null = null;

export function createPerdooClient(): PerdooClient {
  if (!clientInstance) {
    const env = getEnv();
    clientInstance = new PerdooClient({
      token: env.PERDOO_API_TOKEN,
    });
  }
  return clientInstance;
}
```

### Dockerfile

```dockerfile
# Copy from MRPeasy, change only CMD and exposed port if different
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

### package.json

```json
{
  "name": "perdoo-mcp",
  "version": "0.1.0",
  "description": "MCP server for Perdoo OKR GraphQL API integration",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "introspect": "tsx src/scripts/introspect.ts",
    "docker:build": "docker build -t perdoo-mcp .",
    "docker:run": "docker run -p 3001:3001 --env-file .env perdoo-mcp"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.15.0",
    "express": "^4.21.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.7",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Perdoo API Details

### Endpoint

| Property | Value | Confidence |
|----------|-------|------------|
| GraphQL Endpoint | `https://api-eu.perdoo.com/graphql/` | HIGH (confirmed in Power BI Gist) |
| Auth | `Authorization: Bearer <token>` | HIGH (confirmed in Power BI Gist + support docs) |
| Method | POST with `Content-Type: application/json` | HIGH (GraphQL standard) |
| Request Body | `{ "query": "...", "variables": {...} }` | HIGH (GraphQL standard) |
| Rate Limits | Unknown (not publicly documented) | LOW |
| Introspection | Likely available (Apollo GraphOS Studio reference exists) | MEDIUM |

### Pagination (Confirmed)

Perdoo uses Relay-style cursor-based pagination:
- Request: `first: Int`, `after: String`
- Response: `pageInfo { endCursor, hasNextPage }`, `edges { node { ... } }`
- Batch size in Power BI example: 50
- Recommended for MCP tools: 20 (smaller for LLM context window)

### Objective Fields (Confirmed from Power BI Gist)

| Field | Type | Confidence |
|-------|------|------------|
| `name` | String | HIGH |
| `status` | String/Enum | HIGH |
| `progress` | Float | HIGH |
| `timeframe` | Object (`{ name }`) | HIGH |
| `company` | Object (`{ name }`) | HIGH |
| `groups` | Connection (edges/node/name) | HIGH |
| `results` | Connection (edges/node with `name`, `type`, `normalizedValue`, `status`) | HIGH |

### Objective Fields (Inferred)

| Field | Type | Confidence |
|-------|------|------------|
| `id` | ID (string) | HIGH (GraphQL ID scalar is always string) |
| `description` | String | MEDIUM |
| `lead` | Object | MEDIUM |
| `owner` | Object | MEDIUM |
| `tags` | Connection | MEDIUM |
| `alignedTo` | Object | MEDIUM |
| `archived` | Boolean | MEDIUM |
| `createdAt` | DateTime | MEDIUM |

### Mutation Signatures (Best Guess - LOW Confidence)

These MUST be confirmed via introspection:
- `createObjective(input: CreateObjectiveInput!)` -- name assumed from convention
- `updateObjective(id: ID!, input: UpdateObjectiveInput!)` -- name assumed from convention
- Exact input fields unknown until introspection

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| graphql-request library | Raw fetch + thin wrapper | 2024+ (graphql-request transitioning to Graffle) | Zero external deps for GraphQL client |
| SSE transport for MCP | StreamableHTTPServerTransport | MCP SDK 1.x | Unified POST+SSE on single endpoint |
| REST wrapper patterns | GraphQL-aware error parsing | N/A (new for this project) | Must check response body, not just HTTP status |

**Deprecated/outdated:**
- graphql-request v6: Transitioning to Graffle (pre-release), unstable API surface
- MCP stdio transport: Not suitable for multi-session server deployment
- Apollo Client for server-side: Overkill, designed for frontend React apps

## Resilience Stack Configuration

| Parameter | MRPeasy Value | Perdoo Value | Rationale |
|-----------|---------------|--------------|-----------|
| Rate limit capacity | 75 | 30 | Unknown limits, start conservative |
| Rate limit refill/s | 7.5 | 3 | Conservative (30 req/10s effective) |
| Max concurrent | 1 | 1 | Same single-queue pattern |
| Retry on (queries) | 429, 503 | PerdooApiError.isRetryable + PerdooHttpError.isRetryable | GraphQL errors in body, not HTTP status |
| Retry on (mutations) | N/A (GET only) | NEVER | Mutations have side effects |
| Max retries | 5 | 3 | Conservative |
| Base delay | 2000ms | 2000ms | Same |
| Circuit breaker threshold | 5 failures | 5 failures | Same |
| Circuit breaker timeout | 30s | 30s | Same |

## Open Questions

Things that cannot be fully resolved until introspection runs:

1. **Exact query/mutation names**
   - What we know: Convention suggests `objectives`, `objective`, `createObjective`, `updateObjective`
   - What's unclear: Could be `allObjectives`, `objectiveCreate`, or other naming
   - Recommendation: Run introspection first (INFRA-07), update operations after

2. **Mutation input type structure**
   - What we know: GraphQL convention uses `input: CreateObjectiveInput!`
   - What's unclear: Exact input fields, which are required
   - Recommendation: Introspection reveals InputObject types with their fields

3. **Available filters on list queries**
   - What we know: UI has status, timeframe, owner, lead, tag filters
   - What's unclear: Which filters are available as query arguments
   - Recommendation: Introspection shows args on `objectives` query

4. **Rate limit behavior**
   - What we know: Not publicly documented
   - What's unclear: Exact limits, error format when hit
   - Recommendation: Start conservative (30/10s), log all errors, adjust empirically

5. **Token expiry behavior**
   - What we know: Bearer token auth confirmed
   - What's unclear: Whether tokens expire, if so after how long
   - Recommendation: Handle auth errors gracefully, clear error message for expired tokens

## Sources

### Primary (HIGH confidence)
- MRPeasy MCP server source code: `/mcp/mrpeasy/src/` (all patterns)
- [Power BI Gist](https://gist.github.com/jmorrice/f7e4c08e9b5d73f8f3523621cf036ff5) - Confirmed endpoint (`api-eu.perdoo.com/graphql/`), auth (Bearer), pagination (Relay cursor), and objective fields
- [GraphQL over HTTP spec](https://github.com/graphql/graphql-over-http/blob/main/spec/GraphQLOverHTTP.md) - Response format, status codes, error structure
- [GraphQL introspection](https://graphql.org/learn/introspection/) - Introspection query structure

### Secondary (MEDIUM confidence)
- [Perdoo API Support Article](https://support.perdoo.com/en/articles/3629954-api) - Confirms GraphQL, Bearer auth
- [Apollo GraphOS Studio (Perdoo-GQL)](https://studio.apollographql.com/public/Perdoo-GQL/variant/current/explorer) - Public schema explorer (client-rendered, not fetchable)
- [Perdoo Power BI Integration](https://support.perdoo.com/en/articles/5069314-power-bi-integration) - Field structure references
- Prior `.planning/research/` files - Architecture, stack, pitfalls, features research

### Tertiary (LOW confidence)
- Mutation signatures (inferred from conventions, not verified)
- Filter arguments on list queries (inferred from UI, not verified)
- Rate limit behavior (undocumented)
- Token expiry behavior (undocumented)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Identical to proven MRPeasy stack
- Architecture: HIGH - Direct replication of MRPeasy patterns with documented GraphQL adaptations
- GraphQL client: HIGH - Standard fetch + JSON POST, well-understood pattern
- Resilience stack: HIGH - Copy from MRPeasy with documented modifications
- Perdoo endpoint/auth: HIGH - Confirmed in Power BI Gist
- Objective fields (confirmed): HIGH - From Power BI Gist source code
- Objective fields (inferred): MEDIUM - From support articles, needs introspection
- Mutation signatures: LOW - Inferred from conventions, must run introspection first
- Rate limits: LOW - Undocumented, empirical discovery needed

**Research date:** 2026-01-23
**Valid until:** 60 days (stack is stable, API schema may change)
