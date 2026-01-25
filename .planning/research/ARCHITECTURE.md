# Architecture Patterns: Inventory Planner MCP Server

**Domain:** Inventory Planner API Integration (MCP Server)
**Researched:** 2026-01-25
**Confidence:** HIGH (based on existing codebase analysis)

## Executive Summary

The Inventory Planner MCP server architecture is already substantially implemented following the established MRPeasy patterns. This research documents the architecture as-built and identifies what remains to complete the integration.

**Key Finding:** The codebase is approximately 85% complete. The layered architecture, resilience stack, tool registration, and error handling are all in place. What remains is primarily testing, documentation, and potentially additional tool coverage.

## Recommended Architecture

```
                    +------------------+
                    |   HTTP Client    |
                    | (LLM via Claude) |
                    +--------+---------+
                             |
                    +--------v---------+
                    |  HTTP Transport  |
                    |  (Express +      |
                    |   Streamable)    |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   MCP Server     |
                    | (Tool Registry)  |
                    +--------+---------+
                             |
         +-------------------+-------------------+
         |                   |                   |
+--------v-------+  +--------v-------+  +-------v--------+
| Variant Tools  |  | PO Tools       |  | Mutation Tools |
| (get_variants, |  | (get_purchase_ |  | (update_       |
|  get_variant,  |  |  orders, ...)  |  |  variant)      |
|  get_replen.)  |  |                |  |                |
+--------+-------+  +--------+-------+  +-------+--------+
         |                   |                   |
         +-------------------+-------------------+
                             |
                    +--------v---------+
                    | InventoryPlanner |
                    |     Client       |
                    +--------+---------+
                             |
                    +--------v---------+
                    | Resilience Stack |
                    | Queue -> CB ->   |
                    | Retry -> RL      |
                    +--------+---------+
                             |
                    +--------v---------+
                    | Inventory Planner|
                    |    REST API      |
                    +------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `server.ts` | HTTP routing, session management, Express middleware | MCP Server, Transport |
| `mcp/tools/index.ts` | Server factory, tool registration orchestration | All tool registrars, API client factory |
| `mcp/tools/variants.ts` | Variant query tools (get_variants, get_variant, get_replenishment) | Client, error-handler |
| `mcp/tools/purchase-orders.ts` | PO tools (list, detail, create, update, receive) | Client, error-handler |
| `mcp/tools/mutations.ts` | Variant mutations (update_variant) | Client, error-handler |
| `mcp/tools/error-handler.ts` | Unified error translation for all tools | Error factories |
| `services/inventory-planner/client.ts` | All API methods, resilience orchestration | Resilience stack, types |
| `services/inventory-planner/index.ts` | Client factory, singleton memoization | Client, env |
| `lib/errors.ts` | Error factories (rate limit, auth, validation, etc.) | Logger |
| `lib/env.ts` | Environment validation (Zod) | Logger |
| `lib/logger.ts` | Structured logging to stderr | None |

### Data Flow

**Read Operation (e.g., get_variants):**

1. Client sends HTTP POST to `/mcp` with MCP request
2. Express routes to StreamableHTTPServerTransport.handleRequest()
3. MCP server dispatches to `get_variants` tool handler
4. Tool validates params with Zod schema
5. Tool calls `client.getVariants(params)`
6. Client.request() enqueues the operation:
   - Queue waits for single-concurrent slot
   - Circuit breaker checks state (CLOSED/OPEN/HALF_OPEN)
   - Retry wrapper with exponential backoff
   - Rate limiter waits for token
   - fetch() executes HTTP request to Inventory Planner API
7. Response parsed with variant array and pagination meta
8. Tool formats response as JSON for LLM
9. Response returned to client

**Write Operation (e.g., create_purchase_order):**

1. Client sends HTTP POST with mutation params and `confirm: false`
2. Tool handler validates input with Zod
3. If `confirm: false` (default): return preview (request body without executing)
4. If `confirm: true`:
   - Tool calls `client.createPurchaseOrder(payload)`
   - Payload goes through same resilience stack as reads
   - fetch() sends POST with JSON body
   - Response parsed and returned to tool
   - Tool formats response for LLM

**Error Flow:**

1. Tool catches error (InventoryPlannerApiError, CircuitBreakerOpenError, etc.)
2. handleToolError() maps error to specific McpToolError factory
3. Factory creates error with:
   - userMessage (LLM-friendly)
   - suggestedAction (what to try next)
   - isRetryable flag (retry guidance)
   - errorCode (machine-readable identifier)
4. formatErrorForMcp() converts to MCP response with isError: true
5. Response sent to client with formatted message and suggestion

## Patterns to Follow

### Pattern 1: Tool Registration

Each domain group (variants, purchase-orders, mutations) has its own file that exports a `registerXTools(server, client)` function.

```typescript
// src/mcp/tools/variants.ts
export function registerVariantTools(
  server: McpServer,
  client: InventoryPlannerClient
): void {
  server.tool(
    'get_variants',
    'Tool description for LLM',
    { /* Zod schema */ },
    async (params) => {
      try {
        const result = await client.getVariants(params);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return handleToolError(error, 'get_variants');
      }
    }
  );
}
```

### Pattern 2: Zod Schema with LLM Hints

Use `.describe()` on every field to help LLM understand parameters.

```typescript
{
  vendor_id: z
    .string()
    .optional()
    .describe('Filter by vendor ID for vendor-specific reorders'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe('Items per page (max 1000)'),
}
```

### Pattern 3: Preview Mode for Mutations

All write tools default to `confirm: false` which shows a preview without executing.

```typescript
if (!params.confirm) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        preview: true,
        message: 'This is a preview. Set confirm=true to execute.',
        payload: { /* what would be sent */ }
      })
    }]
  };
}
// Execute actual mutation
```

### Pattern 4: API Client Authentication

Header-based authentication specific to Inventory Planner (different from MRPeasy Basic Auth).

```typescript
const headers: Record<string, string> = {
  Authorization: this.apiKey,  // Direct API key, not Basic Auth
  Account: this.accountId,     // Account ID header (unique to IP)
  'Content-Type': 'application/json',
  Accept: 'application/json',
};
```

### Pattern 5: Resilience Stack Composition

Layer protection mechanisms without tight coupling.

**Stack Order (outside to inside):**
1. **Queue** - wraps all requests (enforces 1 concurrent)
2. **Circuit Breaker** - wraps retry (protects against cascading failures)
3. **Retry** - wraps rate limiter (handles transient failures)
4. **Rate Limiter** - wraps fetch (respects API limits)

**Key Detail:** Only 5xx errors trip the circuit breaker, not 4xx.

## What Can Be Copied from MRPeasy

**Identical (copy directly):**
- `src/lib/logger.ts` - Already identical
- `src/server.ts` structure - Already follows same pattern
- Tool registration pattern in `mcp/tools/index.ts` - Already identical
- Error handling pattern in `mcp/tools/error-handler.ts` - Already adapted

**Adapted (same pattern, different details):**
- `src/lib/env.ts` - Uses IP-specific env vars (INVENTORY_PLANNER_*)
- `src/lib/errors.ts` - IP-specific error messages
- `src/services/*/client.ts` - IP-specific API methods and auth
- `src/services/*/types.ts` - IP-specific type definitions

**Resilience stack (same implementation):**
- `rate-limiter.ts` - May need different token/refill rates
- `request-queue.ts` - Identical (1 concurrent)
- `retry.ts` - Identical (same backoff logic)
- `circuit-breaker.ts` - Identical (5 failures, 30s timeout)

## What Needs to Be Different

### Authentication Mechanism

**MRPeasy:** Basic Auth (base64-encoded `apiKey:apiSecret`)
**Inventory Planner:** Header-based auth (API key + Account ID as separate headers)

**Already implemented correctly in client.ts.**

### API Response Shapes

**MRPeasy:** Direct arrays with Content-Range pagination
**Inventory Planner:** Wrapped responses with meta object

**Already handled correctly in client.ts methods.**

### Environment Variables

**MRPeasy:** `MRPEASY_API_KEY`, `MRPEASY_API_SECRET`
**Inventory Planner:** `INVENTORY_PLANNER_API_KEY`, `INVENTORY_PLANNER_ACCOUNT_ID`

**Already implemented in env.ts.**

## Current Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| HTTP Server (`server.ts`) | COMPLETE | Follows MRPeasy pattern exactly |
| MCP Server Factory (`mcp/tools/index.ts`) | COMPLETE | All tool registrars wired up |
| Environment Validation (`lib/env.ts`) | COMPLETE | IP-specific env vars |
| Logger (`lib/logger.ts`) | COMPLETE | Identical to MRPeasy |
| Error Factories (`lib/errors.ts`) | COMPLETE | IP-specific messages |
| API Client (`services/ip/client.ts`) | COMPLETE | All methods implemented |
| Resilience Stack | COMPLETE | All 4 components |
| Variant Tools | COMPLETE | get_variants, get_variant, get_replenishment |
| PO Tools | COMPLETE | get_purchase_orders, get_purchase_order, create, update, receive |
| Mutation Tools | COMPLETE | update_variant |
| Error Handler (`error-handler.ts`) | COMPLETE | Handles all error types |
| Types (`types.ts`) | COMPLETE | Variant, PO, and payload types |
| Tests | NOT STARTED | No test files found |
| Docker | EXISTS | Dockerfile present, needs validation |

## Sources

- Existing codebase analysis:
  - `/mcp/inventory-planner/src/**/*.ts`
  - `/.planning/codebase/ARCHITECTURE.md`
  - `/.planning/codebase/STRUCTURE.md`
- MRPeasy MCP server (reference implementation):
  - `/mcp/mrpeasy/src/**/*.ts`
