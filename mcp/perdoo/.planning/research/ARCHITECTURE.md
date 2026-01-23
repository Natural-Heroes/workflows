# Architecture Patterns

**Domain:** GraphQL MCP Server (wrapping Perdoo OKR API)
**Researched:** 2026-01-23
**Confidence:** HIGH (based on existing MRPeasy codebase patterns + GraphQL community patterns)

## Recommended Architecture

### High-Level Component Layout

```
src/
├── server.ts                          # Express + StreamableHTTP (identical to MRPeasy)
├── lib/
│   ├── env.ts                         # PERDOO_API_TOKEN, PORT, NODE_ENV
│   ├── errors.ts                      # Error factory functions
│   ├── logger.ts                      # Structured logging (reuse from MRPeasy)
│   └── index.ts                       # Barrel export
├── mcp/
│   ├── index.ts                       # Re-exports createMcpServer
│   └── tools/
│       ├── index.ts                   # createMcpServer(), registers all tools
│       ├── objectives.ts              # list_objectives, get_objective, create_objective, update_objective
│       ├── key-results.ts             # list_key_results, get_key_result, create_key_result, update_key_result
│       ├── kpis.ts                    # list_kpis, get_kpi, create_kpi, update_kpi
│       ├── initiatives.ts             # list_initiatives, get_initiative, create_initiative, update_initiative
│       ├── strategic-pillars.ts       # list_strategic_pillars, get_strategic_pillar, create_strategic_pillar, update_strategic_pillar
│       └── error-handler.ts           # GraphQL error → MCP error mapping
└── services/
    └── perdoo/
        ├── index.ts                   # createPerdooClient() factory + barrel exports
        ├── client.ts                  # PerdooClient class (generic GraphQL executor + typed methods)
        ├── types.ts                   # Response/input types for all entities
        ├── operations/                # GraphQL operation strings (queries + mutations)
        │   ├── objectives.ts          # Objective queries and mutations
        │   ├── key-results.ts         # Key Result queries and mutations
        │   ├── kpis.ts                # KPI queries and mutations
        │   ├── initiatives.ts         # Initiative queries and mutations
        │   └── strategic-pillars.ts   # Strategic Pillar queries and mutations
        ├── rate-limiter.ts            # Token bucket (reuse pattern from MRPeasy)
        ├── retry.ts                   # Exponential backoff (reuse pattern)
        ├── circuit-breaker.ts         # Circuit breaker (reuse pattern)
        └── request-queue.ts           # Single-concurrency queue (reuse pattern)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `server.ts` | HTTP transport, session management | `mcp/tools/index.ts` |
| `mcp/tools/*.ts` | Tool registration, input validation (Zod), response formatting | `services/perdoo/client.ts` |
| `services/perdoo/client.ts` | GraphQL execution, resilience stack, auth | `services/perdoo/operations/*.ts` |
| `services/perdoo/operations/*.ts` | Query/mutation strings as constants | consumed by `client.ts` |
| `services/perdoo/types.ts` | TypeScript interfaces for API responses | consumed everywhere |
| `lib/` | Cross-cutting: logging, env, errors | consumed everywhere |

### Data Flow

```
LLM Tool Call
    → MCP SDK deserializes + validates (Zod schema)
    → Tool handler in mcp/tools/objectives.ts
    → Calls client.listObjectives(params) or client.createObjective(input)
    → PerdooClient.execute(operation, variables)
    → Queue → Circuit Breaker → Retry → Rate Limiter → fetch POST
    → Perdoo GraphQL endpoint (https://eu.perdoo.com/graphql/)
    → Response: parse JSON, check for GraphQL errors
    → Tool handler formats response as MCP content
    → MCP SDK serializes back to LLM
```

## Key Architectural Differences: REST vs GraphQL

The MRPeasy server wraps a REST API with multiple endpoints. The Perdoo server wraps a single GraphQL endpoint. This fundamentally changes the client layer while keeping the tool layer and transport layer nearly identical.

### What Stays the Same

| Layer | Pattern | Notes |
|-------|---------|-------|
| Transport | Express + StreamableHTTPServerTransport | Identical to MRPeasy |
| Session management | UUID-based, in-memory Map | Identical |
| Tool registration | `registerXTools(server, client)` pattern | Identical signature |
| Tool input validation | Zod schemas inline in tool() call | Identical |
| Tool response format | `{ content: [{ type: 'text', text: JSON.stringify(response) }] }` | Identical |
| Resilience stack | Queue → CB → Retry → Rate Limiter → fetch | Same pattern, tuning differs |
| Error handler | Tool-level catch → `handleToolError()` | Adapted for GraphQL errors |
| Client factory | `createPerdooClient()` with memoization | Identical pattern |

### What Changes

| Concern | MRPeasy (REST) | Perdoo (GraphQL) | Rationale |
|---------|----------------|-------------------|-----------|
| HTTP method | GET only | POST only | GraphQL uses POST for all operations |
| URL routing | `/items`, `/customer-orders`, etc. | Single endpoint: `/graphql/` | GraphQL single-endpoint model |
| Operation identity | URL path + query params | `query` string in request body | Operations encoded in body |
| Request body | None (params in URL) | `{ query, variables, operationName }` | GraphQL transport spec |
| Response shape | Direct JSON array/object | `{ data: {...}, errors: [...] }` | GraphQL response envelope |
| Error handling | HTTP status codes | GraphQL `errors` array (may have 200 status) | GraphQL returns 200 even for partial errors |
| Pagination | Range headers + Content-Range | Cursor-based (first/after) | Perdoo uses Relay-style pagination |
| Auth | Basic Auth (key:secret base64) | Bearer token | Perdoo uses API tokens |
| Typed methods | One method per endpoint | One execute() + typed wrappers per entity | Single transport, multiple operations |

## Service Client Design

### Recommended: Hybrid Pattern (Generic Executor + Typed Methods)

The client should have a single private `execute<T>()` method that handles the GraphQL transport, and typed public methods for each operation. This mirrors MRPeasy's pattern of private `request<T>()` + public domain methods.

```typescript
export class PerdooClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly rateLimiter: TokenBucket;
  private readonly queue: RequestQueue;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries: number;

  constructor(config: PerdooClientConfig) {
    this.endpoint = config.endpoint ?? 'https://eu.perdoo.com/graphql/';
    this.token = config.token;
    // ... initialize resilience components
  }

  /**
   * Generic GraphQL executor. All operations flow through here.
   * Handles: queue → circuit breaker → retry → rate limiter → fetch
   */
  private async execute<T>(
    operation: string,
    variables?: Record<string, unknown>,
    operationName?: string
  ): Promise<T> {
    return this.queue.enqueue(async () => {
      return this.circuitBreaker.execute(async () => {
        return withRetry(async () => {
          await this.rateLimiter.waitForToken();
          return this.executeRequest<T>(operation, variables, operationName);
        }, { maxAttempts: this.maxRetries });
      });
    });
  }

  /**
   * Raw HTTP request to GraphQL endpoint.
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

    const json = await response.json();

    // GraphQL can return 200 with errors
    if (json.errors?.length) {
      throw new PerdooApiError(json.errors);
    }

    return json.data as T;
  }

  // === Typed public methods (one per operation) ===

  async listObjectives(params?: ObjectivesParams): Promise<ObjectivesConnection> {
    return this.execute<ObjectivesConnection>(
      OBJECTIVES_QUERY,
      buildObjectivesVariables(params)
    );
  }

  async getObjective(id: string): Promise<Objective> {
    return this.execute<{ objective: Objective }>(
      OBJECTIVE_QUERY,
      { id }
    ).then(data => data.objective);
  }

  async createObjective(input: CreateObjectiveInput): Promise<Objective> {
    return this.execute<{ createObjective: Objective }>(
      CREATE_OBJECTIVE_MUTATION,
      { input }
    ).then(data => data.createObjective);
  }

  async updateObjective(id: string, input: UpdateObjectiveInput): Promise<Objective> {
    return this.execute<{ updateObjective: Objective }>(
      UPDATE_OBJECTIVE_MUTATION,
      { id, input }
    ).then(data => data.updateObjective);
  }

  // ... same pattern for keyResults, kpis, initiatives, strategicPillars
}
```

### Why This Over Alternatives

| Alternative | Why Not |
|-------------|---------|
| Only `execute()` (no typed methods) | Tool files would need to know query strings and parse `data` responses. Leaks GraphQL concerns into MCP layer. |
| Separate class per entity (ObjectivesService, etc.) | Over-abstraction for 5 entities. One class with grouped methods is simpler and matches MRPeasy. |
| Use `graphql-request` library | Adds 58KB dependency for minimal gain. Raw fetch is ~20 lines and the project already uses this pattern. |
| Use Apollo Client | Massive overkill for a server-side wrapper. Brings caching, SSR, React bindings we never need. |

## GraphQL Operations Organization

### Recommended: Separate Operations Files Per Entity

Co-locate query/mutation strings in `services/perdoo/operations/` as typed constants. This separates the "what to ask" (operations) from the "how to ask" (client transport) and the "when to ask" (tool handlers).

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
          timeframe {
            name
          }
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
    }
  }
`;

export const OBJECTIVE_QUERY = `
  query GetObjective($id: ID!) {
    objective(id: $id) {
      id
      name
      status
      progress
      timeframe { name }
      results {
        edges {
          node { id name type normalizedValue status }
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

### Why Separate Operations Files (Not Co-Located in Tools)

| Approach | Verdict | Reason |
|----------|---------|--------|
| Operations in `services/perdoo/operations/*.ts` | RECOMMENDED | Clean separation. Client imports operations, tools don't know about GraphQL. Testable: mock operations independently. |
| Operations inline in `client.ts` | Too bloated | Client file would be 500+ lines of query strings mixed with transport logic. |
| Operations in tool files (`mcp/tools/objectives.ts`) | Layer violation | Tool layer should not know about GraphQL syntax. Makes testing harder. |
| Single `operations.ts` file | Scaling issue | All 5 entities x 4 operations = 20+ query strings in one file. Per-entity files stay focused. |

## Tool Grouping Strategy

### Recommended: One File Per Entity (Matching MRPeasy Pattern)

Each entity gets its own tool file with all CRUD operations for that entity. This matches MRPeasy's pattern of `inventory.ts`, `orders.ts`, etc.

```
mcp/tools/
├── objectives.ts          # 4 tools: list, get, create, update
├── key-results.ts         # 4 tools: list, get, create, update
├── kpis.ts                # 4 tools: list, get, create, update
├── initiatives.ts         # 4 tools: list, get, create, update
├── strategic-pillars.ts   # 4 tools: list, get, create, update
└── error-handler.ts       # Shared error mapping
```

Each file exports a single `registerXTools(server: McpServer, client: PerdooClient)` function.

### Tool Naming Convention

```
Entity: Objectives
├── list_objectives        (query - paginated list with filters)
├── get_objective          (query - single by ID)
├── create_objective       (mutation - create new)
└── update_objective       (mutation - update existing)

Entity: Key Results
├── list_key_results
├── get_key_result
├── create_key_result
└── update_key_result

... same for KPIs, Initiatives, Strategic Pillars
```

Total: 20 tools (5 entities x 4 operations each)

### Why Not Group by Operation Type

| Grouping | Why Not |
|----------|---------|
| `queries.ts` + `mutations.ts` | Mixes unrelated entities. When you need to update objectives logic, you'd edit the same file as KPI logic. |
| `read.ts` + `write.ts` | Same problem. Entity cohesion is more important than operation-type cohesion. |
| One massive `tools.ts` | No modularity. All 20 tool definitions in one file would be 1000+ lines. |

## Handling GraphQL-Specific Concerns

### Variables

Variables are constructed in the client's typed methods from the params the tool passes in. The tool layer passes simple TypeScript objects; the client layer maps them to GraphQL variables.

```typescript
// In mcp/tools/objectives.ts (tool layer - no GraphQL knowledge)
const result = await client.listObjectives({
  first: params.limit,
  after: params.cursor,
});

// In services/perdoo/client.ts (client maps to GraphQL variables)
async listObjectives(params?: ObjectivesParams): Promise<ObjectivesConnection> {
  return this.execute<ObjectivesConnection>(OBJECTIVES_QUERY, {
    first: params?.first ?? 50,
    after: params?.after ?? null,
  });
}
```

### Cursor-Based Pagination

Perdoo uses Relay-style cursor pagination (`first`/`after`). The tool should expose this simply:

```typescript
// Tool input schema
{
  limit: z.number().int().min(1).max(50).default(20)
    .describe('Number of items to return (max 50)'),
  cursor: z.string().optional()
    .describe('Pagination cursor from previous response. Omit for first page.'),
}

// Tool response includes pagination info
{
  summary: "20 of 145 objectives",
  pagination: {
    hasNextPage: true,
    endCursor: "abc123",
    count: 20,
  },
  items: [...]
}
```

### GraphQL Error Responses

GraphQL errors require special handling because they can coexist with partial data (200 status).

```typescript
// services/perdoo/client.ts
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

    // Classify based on error extensions or messages
    this.isAuthError = errors.some(e =>
      e.extensions?.code === 'UNAUTHENTICATED' ||
      e.message.toLowerCase().includes('authentication')
    );
    this.isRateLimited = errors.some(e =>
      e.extensions?.code === 'RATE_LIMITED'
    );
    this.isRetryable = this.isRateLimited;
  }
}

interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
}
```

### HTTP-Level vs GraphQL-Level Errors

The error handler must handle both layers:

```typescript
// mcp/tools/error-handler.ts
export function handleToolError(error: unknown, toolName: string) {
  // HTTP-level errors (network failure, 5xx, etc.)
  if (error instanceof PerdooHttpError) {
    if (error.status === 401) return formatErrorForMcp(createAuthenticationError());
    if (error.status === 429) return formatErrorForMcp(createRateLimitError());
    return formatErrorForMcp(createServiceUnavailableError());
  }

  // GraphQL-level errors (returned in response body)
  if (error instanceof PerdooApiError) {
    if (error.isAuthError) return formatErrorForMcp(createAuthenticationError());
    if (error.isRateLimited) return formatErrorForMcp(createRateLimitError());
    // Return the actual GraphQL error messages (they're usually informative)
    return formatErrorForMcp(createGraphQLError(error.errors));
  }

  // Circuit breaker
  if (error instanceof CircuitBreakerOpenError) {
    return formatErrorForMcp(createServiceUnavailableError());
  }

  return formatErrorForMcp(createUnexpectedError(error));
}
```

### Fragments (Defer Until Needed)

GraphQL fragments could reduce duplication across operations (e.g., `ObjectiveFields` fragment used in both list and get queries). However, for 5 entities with simple field selections, inline fields are clearer and more explicit. Consider fragments only if field selections become complex or shared across many operations.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Exposing Raw GraphQL to the LLM

**What:** Creating a generic `execute_graphql` tool that lets the LLM write arbitrary queries.
**Why bad:** LLMs hallucinate field names. No input validation. Security risk (mutations without guardrails). Inconsistent response formats.
**Instead:** Fixed, tested operations with validated inputs and formatted outputs.

### Anti-Pattern 2: Over-Fetching in Queries

**What:** Requesting all possible fields in every query (deep nesting, all relations).
**Why bad:** Slow responses, large payloads, wasted tokens for the LLM context window.
**Instead:** Request only fields needed for each tool's purpose. List queries get summary fields; detail queries get full fields.

### Anti-Pattern 3: Ignoring Partial Errors

**What:** Treating any error in the `errors` array as a total failure.
**Why bad:** GraphQL can return partial data alongside errors. Throwing away valid partial results.
**Instead:** For queries, return partial data with a warning. For mutations, treat any error as failure.

### Anti-Pattern 4: Leaking GraphQL Structure to Tool Responses

**What:** Returning raw `{ data: { objectives: { edges: [{ node: {...} }] } } }` to the LLM.
**Why bad:** Relay connection structure (edges/node) is verbose and confusing. Wastes tokens.
**Instead:** Flatten connections to simple arrays in tool response formatting:

```typescript
// BAD: raw GraphQL structure in response
{ edges: [{ node: { id: "1", name: "Grow revenue" } }] }

// GOOD: flattened for LLM consumption
{ items: [{ id: "1", name: "Grow revenue" }] }
```

### Anti-Pattern 5: One Client Instance Per Request

**What:** Creating a new PerdooClient on every tool invocation.
**Why bad:** Defeats rate limiter, circuit breaker, and queue (they track state across requests).
**Instead:** Memoized singleton (same as MRPeasy's `createMrpEasyClient()` pattern).

## Build Order (Dependencies)

The architecture has clear layer dependencies. Build bottom-up:

```
Phase 1: Foundation (no deps)
├── lib/env.ts              (env validation: PERDOO_API_TOKEN, PORT)
├── lib/logger.ts           (can copy from MRPeasy)
├── lib/errors.ts           (error factory functions)
├── services/perdoo/types.ts (TypeScript interfaces)
└── package.json, tsconfig  (project setup)

Phase 2: Client Layer (depends on Phase 1)
├── services/perdoo/rate-limiter.ts    (can copy from MRPeasy, tune params)
├── services/perdoo/retry.ts           (can copy from MRPeasy)
├── services/perdoo/circuit-breaker.ts (can copy from MRPeasy)
├── services/perdoo/request-queue.ts   (can copy from MRPeasy)
├── services/perdoo/operations/objectives.ts (first entity - validates API works)
└── services/perdoo/client.ts          (PerdooClient with execute + listObjectives/getObjective)

Phase 3: First Entity Tools (depends on Phase 2)
├── mcp/tools/error-handler.ts         (GraphQL error mapping)
├── mcp/tools/objectives.ts            (list, get, create, update)
└── mcp/tools/index.ts                 (createMcpServer with objectives only)

Phase 4: Transport (depends on Phase 3)
└── server.ts                          (Express + session, can copy from MRPeasy)

--- Server is functional with 1 entity at this point ---

Phase 5: Remaining Entities (depends on Phase 2 patterns established)
├── services/perdoo/operations/key-results.ts
├── services/perdoo/operations/kpis.ts
├── services/perdoo/operations/initiatives.ts
├── services/perdoo/operations/strategic-pillars.ts
├── client.ts additions (typed methods per entity)
├── mcp/tools/key-results.ts
├── mcp/tools/kpis.ts
├── mcp/tools/initiatives.ts
└── mcp/tools/strategic-pillars.ts

Phase 6: Polish
├── Instructions resource (perdoo://instructions)
└── Tool descriptions tuned for LLM comprehension
```

### Why This Order

1. **Foundation first** because everything depends on env/logger/types.
2. **Client before tools** because tools call client methods.
3. **One entity end-to-end** before all entities, so you validate the GraphQL integration pattern works with real Perdoo API responses before replicating it 4 more times.
4. **Transport last** because it's the thinnest layer (copy from MRPeasy, change port/name).
5. **Remaining entities are parallelizable** once the pattern is established with objectives.

## Resilience Stack Tuning for GraphQL

The MRPeasy rate limiter is tuned for 100 requests/10 seconds. Perdoo's rate limits are unknown (not publicly documented). Start conservative and adjust:

| Parameter | MRPeasy Value | Perdoo Recommendation | Rationale |
|-----------|---------------|----------------------|-----------|
| Rate limit | 100/10s | 30/10s (start conservative) | Unknown limits, GraphQL ops are heavier |
| Max concurrent | 1 | 1 | Same single-queue pattern |
| Retry on | 429, 503 | 429, 503, network errors | Same transient failures |
| Max retries | 3 | 3 | Same |
| Circuit breaker threshold | 5 failures | 5 failures | Same |
| Circuit breaker timeout | 30s | 30s | Same |

## Types Strategy

Since the Perdoo API schema is only available via authenticated introspection, types must be defined manually based on observed API responses. Start minimal and extend as the schema is explored.

```typescript
// services/perdoo/types.ts

// === Pagination (Relay Connection Pattern) ===

export interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface Connection<T> {
  pageInfo: PageInfo;
  edges: Edge<T>[];
}

export interface Edge<T> {
  node: T;
  cursor?: string;
}

// === Entity Types ===

export interface Objective {
  id: string;
  name: string;
  status: string;
  progress: number;
  timeframe?: { name: string };
  // Extend as schema is explored
}

export interface KeyResult {
  id: string;
  name: string;
  type: string;
  normalizedValue: number;
  status: string;
  // Extend as schema is explored
}

// ... similar for KPI, Initiative, StrategicPillar

// === Input Types (for mutations) ===

export interface CreateObjectiveInput {
  name: string;
  timeframeId?: string;
  // Extend as mutations are explored
}

export interface UpdateObjectiveInput {
  name?: string;
  status?: string;
  // Extend as mutations are explored
}

// === GraphQL Response Wrappers ===

export type ObjectivesConnection = Connection<Objective>;
export type KeyResultsConnection = Connection<KeyResult>;
```

**Important:** These types are LOW confidence and will need validation against the actual API schema once introspection is performed. The first implementation phase should include running an introspection query to discover the real schema.

## Sources

- MRPeasy MCP server codebase (primary pattern reference): `/mcp/mrpeasy/src/`
- [Perdoo API Support Article](https://support.perdoo.com/en/articles/3629954-api) - confirms GraphQL standard, Bearer auth
- [Perdoo Power BI Integration](https://support.perdoo.com/en/articles/5069314-power-bi-integration) - confirms cursor pagination, field structure
- [Power Query Gist for Perdoo](https://gist.github.com/jmorrice/f7e4c08e9b5d73f8f3523621cf036ff5) - reveals query structure: `objectives(first, after)`, pageInfo, edges/node pattern
- [mcp-graphql by blurrah](https://github.com/blurrah/mcp-graphql) - generic GraphQL MCP server reference (introspect + query pattern)
- [GraphQL.org - Queries](https://graphql.org/learn/queries/) - variables, operation naming
- [graphql-request npm](https://www.npmjs.com/package/graphql-request) - evaluated and rejected (58KB for minimal gain over raw fetch)
- [Apollo GraphQL Blog - Future of MCP is GraphQL](https://www.apollographql.com/blog/the-future-of-mcp-is-graphql) - ecosystem direction
