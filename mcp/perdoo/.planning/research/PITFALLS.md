# Domain Pitfalls: GraphQL-to-MCP Wrapping

**Domain:** MCP Server wrapping Perdoo GraphQL API for OKR management
**Researched:** 2026-01-23
**Focus:** GraphQL-specific pitfalls when exposing a single GraphQL endpoint as discrete MCP tools

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or fundamental architecture problems.

---

### Pitfall 1: Treating GraphQL 200 Responses as Success

**What goes wrong:**
GraphQL returns HTTP 200 for nearly all responses, including complete failures. The resilience stack from MRPeasy (which checks `response.ok` and HTTP status codes like 429, 503) will never trigger retries or circuit breaker logic for GraphQL errors. Authentication failures, validation errors, and even server errors all come back as `200 OK` with an `errors` array in the body.

**Why it happens:**
Developers port REST API client patterns directly. The MRPeasy client checks `!response.ok` to detect errors, but a GraphQL endpoint returns 200 even when the query completely fails. The retry module checks `error.status === 429` -- this condition will never be true for a GraphQL rate limit communicated via the errors array.

**Consequences:**
- Circuit breaker never opens (all requests appear "successful")
- Retry logic never triggers (no retryable HTTP status codes)
- Rate limiting not detected (429 equivalent comes as 200 with error message)
- Silent data corruption: partial responses treated as complete

**Prevention:**
- Parse the response body BEFORE determining success/failure
- Check for `errors` array in every response, even when `data` is present
- Extract error codes from `errors[].extensions.code` to determine retry eligibility
- Map GraphQL error codes to equivalent HTTP semantics:
  - `UNAUTHENTICATED` -> treat as 401 (not retryable, fail fast)
  - `RATE_LIMITED` / throttling message -> treat as 429 (retryable)
  - `INTERNAL_SERVER_ERROR` -> treat as 503 (retryable)
  - `VALIDATION_ERROR` -> treat as 400 (not retryable)
- Build a `GraphQLApiError` class that replaces `MrpEasyApiError`, deriving `isRetryable` from the parsed error body rather than HTTP status

**Detection (warning signs):**
- All API calls show status 200 in logs, yet tools return errors
- Circuit breaker stays closed even during sustained Perdoo outages
- Retry logic never executes despite transient failures
- Error responses are logged as successful requests

**Phase to address:** Phase 1 (Core Infrastructure) -- this is foundational to the entire resilience stack

**Confidence:** HIGH

**Sources:**
- [GraphQL spec: Response format](https://graphql.org/learn/response/)
- [200 OK! Error Handling in GraphQL](https://sachee.medium.com/200-ok-error-handling-in-graphql-7ec869aec9bc)
- [Mastering GraphQL Error Handling](https://testfully.io/blog/graphql-error-handling/)

---

### Pitfall 2: Partial Data Responses Treated as Failures

**What goes wrong:**
GraphQL can return BOTH `data` and `errors` simultaneously. If the client treats any presence of `errors` as a complete failure (discarding `data`), valid partial results are lost. Conversely, if errors are ignored when data is present, the tool returns incomplete data without warning.

**Why it happens:**
REST APIs return either success OR error -- never both. Developers apply this mental model to GraphQL, implementing either "errors means failure" or "data means success" when reality is more nuanced. The GraphQL spec explicitly allows partial responses where some fields succeed and others fail.

**Consequences:**
- Discarding partial data: Tool returns error when 90% of requested data was available
- Ignoring errors: Tool returns incomplete data, LLM makes decisions on partial information
- Null confusion: Cannot distinguish "field is genuinely null" from "field errored out"

**Prevention:**
- Implement a three-state response model:
  1. `data` only: Full success
  2. `errors` only: Complete failure (e.g., query validation failed)
  3. Both `data` and `errors`: Partial success -- return data with warning
- When both are present, include error context in MCP tool response:
  ```
  { content: [{ type: "text", text: JSON.stringify({ data: ..., warnings: ["field X unavailable: reason"] }) }] }
  ```
- For mutations: treat ANY error as failure (mutations are all-or-nothing semantically)
- For queries: return available data with explicit warnings about missing fields

**Detection (warning signs):**
- Tools return "error" when most data was actually available
- LLM receives incomplete data without realizing fields are missing
- Logs show GraphQL responses with both `data` and `errors` but only one is processed

**Phase to address:** Phase 1 (Core Infrastructure) -- part of GraphQL client response parsing

**Confidence:** HIGH

**Sources:**
- [GraphQL Spec: Section 7 -- Response](https://github.com/graphql/graphql-spec/blob/main/spec/Section%207%20--%20Response.md)
- [Apollo: Handling operation errors](https://www.apollographql.com/docs/react/data/error-handling)
- [Guide to GraphQL Errors](https://productionreadygraphql.com/2020-08-01-guide-to-graphql-errors/)

---

### Pitfall 3: Mutation Retry Creates Duplicate OKR Entities

**What goes wrong:**
When a `create_objective` mutation times out or returns a network error, the retry logic re-sends the mutation. If the first request actually succeeded on Perdoo's side, a duplicate objective is created. Unlike idempotent GET requests, mutations have side effects. The MRPeasy retry pattern (which only does GET requests) is fundamentally unsafe for GraphQL mutations.

**Why it happens:**
The MRPeasy server only performs GET requests -- every retry is safe because reads are idempotent. The Perdoo server performs mutations (create/update), and the retry logic from MRPeasy does not distinguish between safe and unsafe operations.

**Consequences:**
- Duplicate objectives, key results, or initiatives in Perdoo
- Incorrect progress tracking (same KR counted twice)
- Data cleanup requires manual intervention in Perdoo UI
- LLM may not detect duplicates and continues operating on both

**Prevention:**
- NEVER retry mutations by default -- only retry on confirmed network failures where the request provably did not reach the server
- Implement a `isMutation` flag in the GraphQL client that disables automatic retry
- For mutations, use a two-phase approach:
  1. Execute mutation (no retry)
  2. On timeout/network error: query for the entity to check if it was created
  3. Only retry if query confirms the entity was NOT created
- If Perdoo supports `clientMutationId` or idempotency keys, use them
- For updates: updates are generally safer to retry (last write wins) but verify semantics

**Detection (warning signs):**
- Duplicate entities appearing in Perdoo after network blips
- Retry logs showing mutation re-execution
- Tool responses mentioning "created" when entity already existed

**Phase to address:** Phase 1 (Core Infrastructure) -- retry logic must be mutation-aware from the start

**Confidence:** HIGH

**Sources:**
- [Building Resilient GraphQL APIs Using Idempotency (Shopify)](https://shopify.engineering/building-resilient-graphql-apis-using-idempotency)
- [Robust GraphQL mutations the Relay way](https://blog.logrocket.com/robust-graphql-mutations-the-relay-way/)
- Existing MRPeasy retry.ts (only handles GET, retryableStatuses: [429, 503])

---

### Pitfall 4: Undiscoverable Rate Limits on Perdoo's API

**What goes wrong:**
Perdoo's public documentation does not specify rate limits, error codes, or throttling behavior. The rate limiter configuration (tokens, refill rate, burst) has no official reference to base decisions on. You might configure 100 req/10s (like MRPeasy) when Perdoo's actual limit is 10 req/minute, or vice versa.

**Why it happens:**
Perdoo's API documentation is only accessible to Superadmins within the platform settings. Public support articles do not describe rate limiting. Without official documentation, developers must discover limits empirically -- which means hitting them in production.

**Consequences:**
- Rate limiter configured too aggressively: unnecessary self-throttling
- Rate limiter configured too loosely: actual API rate limit hit, requests fail
- No `Retry-After` header to inform backoff timing
- GraphQL rate limit errors may look different from REST 429 responses

**Prevention:**
- Start with conservative rate limits (e.g., 10 req/s with burst of 20) and adjust based on observed behavior
- Implement adaptive rate limiting that detects throttling from error responses and adjusts automatically
- Log all responses that contain rate-limit-related error messages for pattern discovery
- Use the Apollo GraphQL Explorer at `https://studio.apollographql.com/public/Perdoo-GQL/variant/current/home` to test rate limit behavior before building the client
- Monitor for error messages containing keywords: "rate", "limit", "throttl", "too many", "slow down"
- Document discovered limits in the codebase once identified empirically
- Contact Perdoo support (support@perdoo.com) for official rate limit documentation

**Detection (warning signs):**
- Unexpected error responses during normal operation
- Error messages mentioning rate/throttle that don't match configured limits
- Inconsistent request failures under moderate load

**Phase to address:** Phase 1 (Core Infrastructure) -- rate limiter must be configurable; Phase 2 (Tools) -- observe and tune during integration testing

**Confidence:** LOW (Perdoo's rate limits are undocumented publicly)

**Sources:**
- [Perdoo API Support Article](https://support.perdoo.com/en/articles/3629954-api) (no rate limit details)
- [Perdoo Apollo GraphQL Explorer](https://studio.apollographql.com/public/Perdoo-GQL/variant/current/home) (schema exploration)

---

### Pitfall 5: Schema Drift Breaking Hardcoded Queries

**What goes wrong:**
GraphQL queries are hardcoded strings referencing specific field names and types. When Perdoo updates their schema (renames a field, changes a type, deprecates a query), all affected tools silently break. Unlike REST where a path change returns 404, a GraphQL field change returns `null` for the renamed field or a validation error.

**Why it happens:**
GraphQL's "versionless" philosophy means the schema evolves continuously. Fields get deprecated with `@deprecated` directive, new fields appear, types change. With a raw fetch client (no codegen or schema validation), there is no compile-time check that queries still match the schema.

**Consequences:**
- Fields returning `null` when they used to have data (field was renamed/deprecated)
- Query validation errors breaking all tools that use the affected query
- No advance warning -- Perdoo may not notify API consumers of deprecations
- Impossible to distinguish "data is null" from "field doesn't exist anymore"

**Prevention:**
- Run introspection query on startup (or periodically) to verify expected types and fields exist
- Implement a schema validation check:
  ```typescript
  // On startup, verify critical fields exist
  const introspection = await client.query(`{ __type(name: "Objective") { fields { name } } }`);
  const fields = introspection.data.__type.fields.map(f => f.name);
  if (!fields.includes('title')) throw new Error('Schema changed: Objective.title missing');
  ```
- Use `@deprecated` checks in introspection to detect upcoming removals
- Pin queries to specific known fields (don't use `...fragment` spreading entire types)
- Log when any expected field returns unexpected null
- Subscribe to Perdoo changelog/release notes for API changes

**Detection (warning signs):**
- Fields that previously returned data now return null consistently
- GraphQL validation errors mentioning unknown fields
- Introspection showing `@deprecated` on fields your queries use

**Phase to address:** Phase 2 (Tools) -- queries must be defined; Phase 3 (Resilience) -- add startup validation

**Confidence:** MEDIUM (standard GraphQL evolution risk, not Perdoo-specific confirmed)

**Sources:**
- [Handling Breaking Changes in GraphQL](https://gitnation.com/contents/handling-breaking-changes-in-graphql)
- [Making breaking GraphQL changes without breaking anything](https://sophiabits.com/blog/making-breaking-graphql-changes-without-breaking-anything)
- [GitHub: Breaking changes policy](https://docs.github.com/en/graphql/overview/breaking-changes)

---

## Moderate Pitfalls

Mistakes that cause delays, bugs in production, or significant technical debt.

---

### Pitfall 6: Over-fetching Bloating MCP Tool Responses

**What goes wrong:**
GraphQL's power is requesting exactly the fields you need. But when building tools, developers often request all available fields "just in case" or because they don't know which fields the LLM will need. This creates tool responses with 50+ fields per entity, consuming excessive tokens and confusing the LLM.

**Why it happens:**
Unlike REST (where the response shape is fixed by the server), GraphQL requires the client to explicitly choose fields. Without clear tool schemas, developers add every field to avoid missing something. The LLM then receives massive JSON responses where most fields are irrelevant to the current task.

**Prevention:**
- Define minimal field sets per tool purpose:
  - `list_objectives`: id, title, status, owner, progress (5-6 fields for overview)
  - `get_objective_details`: full field set for deep inspection
- Never use introspection to build "fetch everything" queries
- Calculate token budget: aim for <1000 tokens per tool response for list operations
- Use the `inputSchema` in MCP to document exactly what fields are returned
- Create separate "summary" vs "detail" tools rather than one tool with variable verbosity

**Detection (warning signs):**
- Tool responses exceeding 2000 tokens for list operations
- LLM responses referencing irrelevant fields from tool output
- Large JSON payloads where most fields are null or unused

**Phase to address:** Phase 2 (Tool Design) -- field selection is part of query definition

**Confidence:** HIGH

**Sources:**
- [Solving context explosion in GraphQL MCP servers (Grafbase)](https://grafbase.com/blog/managing-mcp-context-graphql)
- [Apollo GraphQL Blog: Building MCP Tools with GraphQL](https://www.apollographql.com/blog/building-mcp-tools-with-graphql-a-better-way-to-connect-llms-to-your-api)

---

### Pitfall 7: Pagination Model Mismatch

**What goes wrong:**
MRPeasy uses Range-header pagination (offset-based). GraphQL APIs commonly use Relay-style cursor-based pagination (edges/nodes/pageInfo). If Perdoo uses cursor-based pagination, the MRPeasy pagination patterns (offset + limit) don't apply. Conversely, if Perdoo uses simple offset pagination, implementing complex cursor handling is wasted effort.

**Why it happens:**
Developers assume one pagination model without verifying Perdoo's actual implementation. GraphQL has no standard pagination requirement -- each API chooses its own approach (cursor, offset, keyset, or none).

**Consequences:**
- If Perdoo uses cursors but tool exposes offset: tool must translate, losing cursor benefits
- If Perdoo limits page size but tool requests all: silent data truncation
- If pagination is required but tool doesn't implement it: tool returns partial results without indicating more data exists
- Edge cases with `hasNextPage`/`hasPreviousPage` logic

**Prevention:**
- Introspect the Perdoo schema to discover pagination patterns BEFORE building tools:
  ```graphql
  { __type(name: "ObjectiveConnection") { fields { name type { name } } } }
  ```
- Check for Relay-style patterns: `edges`, `node`, `cursor`, `pageInfo`
- Check for simple patterns: `items`, `totalCount`, `offset`, `limit`
- Build pagination abstraction that works regardless of underlying model
- Always indicate in tool response whether more data exists:
  ```json
  { "objectives": [...], "pagination": { "hasMore": true, "nextCursor": "abc123", "totalCount": 47 } }
  ```
- Set reasonable page sizes for MCP tool context (10-20 items per page, not 100)

**Detection (warning signs):**
- Tools returning exactly N items with no indication of whether more exist
- Inconsistent result counts between direct API calls and tool responses
- Missing pagination fields in tool response schemas

**Phase to address:** Phase 2 (Tool Design) -- pagination pattern must be discovered and implemented per Perdoo's schema

**Confidence:** MEDIUM (Perdoo pagination style not verified; likely cursor-based given Apollo GraphQL Explorer)

**Sources:**
- [GraphQL Pagination](https://graphql.org/learn/pagination/)
- [Relay Cursor Connections Specification](https://relay.dev/graphql/connections.htm)
- [Perdoo Apollo Explorer](https://studio.apollographql.com/public/Perdoo-GQL/variant/current/home)

---

### Pitfall 8: Bearer Token Expiry Without Graceful Handling

**What goes wrong:**
Perdoo uses Bearer token authentication. If the token expires or is revoked, all subsequent requests return authentication errors. Without detection and clear error reporting, the MCP server continues operating with a dead token, returning auth errors as generic tool failures.

**Why it happens:**
MRPeasy uses Basic Auth (key + secret) which doesn't expire. Developers carry over the "validate once at startup" pattern. Bearer tokens can expire, be rotated, or be revoked at any time. The server has no mechanism to detect this mid-session.

**Consequences:**
- All tools fail with opaque errors after token expiry
- LLM retries repeatedly, wasting tokens on guaranteed-to-fail requests
- No clear signal to the user that re-authentication is needed
- Circuit breaker may open (auth errors look like sustained failures)

**Prevention:**
- Detect authentication errors specifically from GraphQL error responses:
  ```typescript
  const isAuthError = errors.some(e =>
    e.extensions?.code === 'UNAUTHENTICATED' ||
    e.message?.toLowerCase().includes('unauthorized') ||
    e.message?.toLowerCase().includes('authentication')
  );
  ```
- On auth error: immediately stop retrying (auth errors are never transient)
- Return a specific, actionable MCP error: "Perdoo authentication failed. Token may have expired. Please provide a new PERDOO_API_TOKEN."
- Exclude auth errors from circuit breaker failure counting (they are not infrastructure failures)
- Implement token validation on startup AND periodic health checks
- Consider: can Perdoo tokens be refreshed programmatically? (Investigate JWT/refresh token flow mentioned in SSO documentation)

**Detection (warning signs):**
- All tools failing simultaneously with the same error
- Error messages mentioning "unauthorized" or "unauthenticated"
- Circuit breaker opening after auth token expiry (false positive)
- Retry logic executing on auth errors (wasted effort)

**Phase to address:** Phase 1 (Core Infrastructure) -- auth error detection is foundational

**Confidence:** MEDIUM (Perdoo token expiry behavior not documented publicly; Bearer tokens typically have expiry)

**Sources:**
- [Perdoo API: Bearer token auth](https://support.perdoo.com/en/articles/3629954-api)
- [Perdoo SSO/JWT mention](https://support.perdoo.com/en/articles/5069314-power-bi-integration)
- [JWT best practices with GraphQL](https://hasura.io/blog/best-practices-of-using-jwt-with-graphql)

---

### Pitfall 9: N+1 Query Problem in Entity Relationship Tools

**What goes wrong:**
When a tool needs to return objectives WITH their key results, a naive implementation queries objectives first, then loops through each objective making a separate query for its key results. With 20 objectives, this becomes 21 API calls (1 + 20) -- hitting rate limits and adding latency.

**Why it happens:**
REST API thinking: "get list, then get details for each." GraphQL solves this by allowing nested queries in a single request, but developers unfamiliar with GraphQL don't leverage this capability.

**Consequences:**
- 1 tool call = 20+ API requests (rate limit exhaustion)
- Response latency multiplied by number of entities
- Rate limiter throttling subsequent tool calls
- Circuit breaker may open under load

**Prevention:**
- Always use nested GraphQL queries for related data:
  ```graphql
  query {
    objectives {
      id
      title
      keyResults {
        id
        title
        progress
      }
    }
  }
  ```
- NEVER implement "fetch list, then fetch details for each" pattern
- Design tool queries to fetch the complete data graph in a single request
- For cases where nesting isn't supported in Perdoo's schema, batch queries using GraphQL aliases:
  ```graphql
  query {
    obj1: objective(id: "1") { ... }
    obj2: objective(id: "2") { ... }
  }
  ```
- Monitor: if a single tool call generates >3 GraphQL requests, refactor

**Detection (warning signs):**
- Single tool call generating multiple sequential API requests
- Tool response time scaling linearly with entity count
- Rate limiter engaging during single tool operations

**Phase to address:** Phase 2 (Tool Design) -- queries must be designed as single requests per tool call

**Confidence:** HIGH (standard GraphQL anti-pattern, high likelihood of occurring)

**Sources:**
- GraphQL nested query capability (fundamental feature)
- MRPeasy pattern: each tool = 1 API call (same target for Perdoo)

---

### Pitfall 10: Mutation Input Validation Errors Not Actionable for LLM

**What goes wrong:**
GraphQL mutations fail with validation errors like "Field 'title' of required type 'String!' was not provided" or "Variable '$input' got invalid value". These errors are verbose, reference GraphQL-internal concepts (types, variables), and don't tell the LLM what valid values look like.

**Why it happens:**
GraphQL's type system produces detailed validation errors meant for developers reading them in GraphiQL, not for LLMs interpreting them programmatically. Raw GraphQL errors are passed through to the MCP tool response without translation.

**Consequences:**
- LLM cannot determine what to fix without understanding GraphQL type system
- Retry with same invalid input (error message not actionable)
- User sees cryptic GraphQL errors instead of clear guidance
- LLM may hallucinate valid values rather than asking the user

**Prevention:**
- Implement Zod validation BEFORE sending mutations to Perdoo:
  ```typescript
  const CreateObjectiveSchema = z.object({
    title: z.string().min(1).max(255),
    ownerId: z.string().uuid(),
    timeframe: z.enum(['Q1', 'Q2', 'Q3', 'Q4', 'annual']),
  });
  ```
- Catch validation errors locally and return LLM-friendly messages:
  ```
  "Cannot create objective: title is required (1-255 characters), timeframe must be one of: Q1, Q2, Q3, Q4, annual"
  ```
- For GraphQL validation errors that slip through, translate them:
  ```typescript
  function translateGraphQLError(error: GraphQLError): string {
    if (error.message.includes('required type')) {
      return `Missing required field: ${extractFieldName(error)}`;
    }
    // ...
  }
  ```
- Include valid enum values and field constraints in error messages
- Use the MCP tool `inputSchema` to enforce types before GraphQL ever sees the request

**Detection (warning signs):**
- Tool error messages containing GraphQL jargon: "NonNull", "variable", "$input"
- LLM retrying mutations with the same invalid values
- Users seeing raw GraphQL error messages in responses

**Phase to address:** Phase 2 (Tool Design) -- input validation is part of tool schema design

**Confidence:** HIGH

**Sources:**
- [How Not to Write an MCP Server](https://towardsdatascience.com/how-not-to-write-an-mcp-server/)
- MRPeasy error-handler.ts pattern (translates API errors for LLM consumption)

---

## Minor Pitfalls

Mistakes that cause annoyance, confusion, or suboptimal behavior but are fixable without rewrites.

---

### Pitfall 11: GraphQL Query String Construction Injection

**What goes wrong:**
Building GraphQL queries via string interpolation opens injection vectors. If any user-provided value is interpolated directly into a query string (rather than passed as a variable), malicious or accidental input can alter the query structure.

**Prevention:**
- ALWAYS use GraphQL variables for dynamic values:
  ```typescript
  // WRONG: string interpolation
  const query = `{ objective(id: "${userInput}") { title } }`;

  // RIGHT: variables
  const query = `query($id: ID!) { objective(id: $id) { title } }`;
  const variables = { id: userInput };
  ```
- Validate all variable values with Zod before passing to GraphQL
- Never construct field names dynamically from user input

**Phase to address:** Phase 1 (Core Infrastructure) -- GraphQL client must enforce variable usage

**Confidence:** HIGH

---

### Pitfall 12: MCP Tool Descriptions Not Reflecting GraphQL Capabilities

**What goes wrong:**
Tool descriptions say "get objectives" but don't tell the LLM what filters, sorting, or pagination are available. The LLM doesn't know it can filter by owner, timeframe, or status because the tool description doesn't mention these capabilities.

**Prevention:**
- Include filtering capabilities explicitly in tool descriptions:
  ```
  "List objectives. Can filter by: owner (user ID), timeframe (Q1-Q4, annual),
   status (on_track, at_risk, behind). Returns paginated results (max 20 per page).
   Use 'cursor' parameter for next page."
  ```
- Mirror the MRPeasy pattern: detailed `inputSchema` with descriptions on every field
- Test tool descriptions by asking an LLM "what can this tool do?" and verifying understanding

**Phase to address:** Phase 2 (Tool Design)

**Confidence:** HIGH

---

### Pitfall 13: Ignoring GraphQL Operation Names

**What goes wrong:**
All GraphQL requests go to the same `/graphql/` endpoint. Without operation names, logging and debugging becomes impossible -- you see 50 POST requests to the same URL with no way to distinguish which tool triggered which request.

**Prevention:**
- Always name GraphQL operations:
  ```graphql
  query ListObjectives($filter: ObjectiveFilter) { ... }
  mutation CreateKeyResult($input: CreateKeyResultInput!) { ... }
  ```
- Include operation name in all log entries
- Use operation names for rate limiting granularity (if needed)

**Phase to address:** Phase 1 (Core Infrastructure) -- naming convention from the start

**Confidence:** HIGH

---

### Pitfall 14: Entity ID Type Mismatch

**What goes wrong:**
GraphQL APIs may use different ID types than expected (string UUIDs vs numeric IDs vs opaque base64 IDs). If the MCP tool schema declares `id: z.number()` but Perdoo uses string UUIDs, every tool call fails with type validation before even reaching the API.

**Prevention:**
- Introspect the actual ID type from Perdoo's schema before defining tool schemas
- Check the Apollo Explorer for ID field types on each entity
- Use `z.string()` for IDs by default (GraphQL ID scalar is always serialized as string)
- Never assume numeric IDs -- GraphQL `ID` type is a string

**Phase to address:** Phase 2 (Tool Design) -- verify during schema discovery

**Confidence:** HIGH (GraphQL ID type is string per spec, but developers often assume number)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation | Severity |
|-------|---------------|------------|----------|
| Core Infrastructure | HTTP 200 treated as success (Pitfall 1) | Parse response body for errors before success determination | CRITICAL |
| Core Infrastructure | Mutation retry creating duplicates (Pitfall 3) | Separate retry policy for queries vs mutations | CRITICAL |
| Core Infrastructure | Query string injection (Pitfall 11) | Enforce variables-only pattern in GraphQL client | MODERATE |
| Core Infrastructure | Auth token expiry undetected (Pitfall 8) | Specific auth error detection, not counted as infra failure | MODERATE |
| Tool Design | Over-fetching fields (Pitfall 6) | Minimal field sets per tool, token budget per response | MODERATE |
| Tool Design | Pagination mismatch (Pitfall 7) | Discover Perdoo's pagination pattern via introspection first | MODERATE |
| Tool Design | N+1 queries (Pitfall 9) | Single GraphQL request per tool call, use nested queries | MODERATE |
| Tool Design | Validation errors not actionable (Pitfall 10) | Zod validation before GraphQL, translate errors for LLM | MODERATE |
| Tool Design | Entity ID type wrong (Pitfall 14) | Verify ID types via introspection, use string by default | LOW |
| Resilience | Rate limits unknown (Pitfall 4) | Start conservative, implement adaptive rate limiting | MODERATE |
| Resilience | Schema drift (Pitfall 5) | Startup introspection validation of critical fields | LOW |

## Key Difference from MRPeasy: GraphQL Changes Everything

The MRPeasy server's resilience stack was designed for REST:
- **Error detection**: HTTP status codes (429, 503, 401, etc.)
- **Retry safety**: All operations are GET (idempotent)
- **Pagination**: Range headers with Content-Range
- **Rate limiting**: Known limits (100/10s), standard 429 responses

For Perdoo's GraphQL API, every assumption changes:
- **Error detection**: Must parse response body, not HTTP status
- **Retry safety**: Mutations are NOT safe to retry
- **Pagination**: Likely cursor-based (Relay-style), discovered via introspection
- **Rate limiting**: Unknown limits, may not use standard error codes

The resilience stack architecture (queue -> circuit breaker -> retry -> rate limiter -> fetch) is correct, but the DETECTION and DECISION logic at each layer must be rewritten for GraphQL semantics.

## Sources

### High-Confidence Sources (Official Documentation)
- [GraphQL Spec: Response format](https://graphql.org/learn/response/)
- [GraphQL Spec: Section 7 -- Response](https://github.com/graphql/graphql-spec/blob/main/spec/Section%207%20--%20Response.md)
- [GraphQL: Pagination](https://graphql.org/learn/pagination/)
- [Relay Cursor Connections Specification](https://relay.dev/graphql/connections.htm)
- [Perdoo API Support Article](https://support.perdoo.com/en/articles/3629954-api)

### Medium-Confidence Sources (Verified with Multiple References)
- [Grafbase: Solving context explosion in GraphQL MCP servers](https://grafbase.com/blog/managing-mcp-context-graphql)
- [Apollo GraphQL Blog: Building MCP Tools with GraphQL](https://www.apollographql.com/blog/building-mcp-tools-with-graphql-a-better-way-to-connect-llms-to-your-api)
- [Apollo GraphQL Blog: The Future of MCP is GraphQL](https://www.apollographql.com/blog/the-future-of-mcp-is-graphql)
- [Shopify Engineering: Building Resilient GraphQL APIs Using Idempotency](https://shopify.engineering/building-resilient-graphql-apis-using-idempotency)
- [Mastering GraphQL Error Handling (Testfully)](https://testfully.io/blog/graphql-error-handling/)
- [Handling Breaking Changes in GraphQL](https://gitnation.com/contents/handling-breaking-changes-in-graphql)

### Low-Confidence Sources (Perdoo-Specific, Unverified)
- [Perdoo Apollo GraphQL Explorer](https://studio.apollographql.com/public/Perdoo-GQL/variant/current/home) (schema exploration available but not fully inspected)
- Perdoo rate limiting behavior (undocumented publicly, needs empirical discovery)
- Perdoo pagination model (likely cursor-based, unverified)
- Perdoo token expiry behavior (Bearer token mentioned, expiry semantics unknown)

---

*Pitfalls research for: Perdoo MCP Server (GraphQL-to-MCP wrapping)*
*Researched: 2026-01-23*
*Primary focus: GraphQL error handling, mutation safety, schema evolution, pagination, and resilience stack adaptation*
