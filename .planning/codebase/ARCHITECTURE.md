# Architecture

**Analysis Date:** 2026-01-25

## Pattern Overview

**Overall:** Layered MCP (Model Context Protocol) server with resilient API client integration

**Key Characteristics:**
- Session-based HTTP architecture with StreamableHTTPServerTransport
- Pluggable tool registration pattern using factory functions
- Resilience stack: queue → circuit breaker → retry → rate limiter → fetch
- Error translation layer that converts API errors to LLM-friendly messages
- Zod-based input validation for all MCP tools

## Layers

**HTTP Transport Layer:**
- Purpose: Handle MCP protocol over HTTP with session management
- Location: `src/server.ts`
- Contains: Express middleware, session store (Map<sessionId, transport>), request routing
- Depends on: StreamableHTTPServerTransport from @modelcontextprotocol/sdk, MCP server instance
- Used by: Client applications connecting via HTTP

**MCP Server Layer:**
- Purpose: Create and register tools, serve instruction resources, manage tool lifecycle
- Location: `src/mcp/tools/index.ts` (main factory) and `src/mcp/index.ts` (re-export)
- Contains: Tool registration functions, instruction resources (Markdown), ping tool
- Depends on: McpServer from SDK, API client, individual tool registrars
- Used by: HTTP transport for tool execution

**Tool Layer:**
- Purpose: Define individual MCP tools that execute business operations
- Location: `src/mcp/tools/*.ts` (inventory.ts, orders.ts, mutations.ts, etc.)
- Contains: Tool definitions (Zod schemas, tool handlers), tool registration functions
- Depends on: MCP SDK, API client, error handler, logger
- Used by: MCP server for tool discovery and registration

**API Client Layer:**
- Purpose: Encapsulate MRPeasy API communication with resilience patterns
- Location: `src/services/mrpeasy/client.ts`
- Contains: Typed API methods (getStockItems, createCustomerOrder, etc.), resilience orchestration
- Depends on: Rate limiter, request queue, circuit breaker, retry logic
- Used by: Tools, services layer

**Resilience Layer:**
- Purpose: Protect against transient failures, rate limits, and service degradation
- Location: `src/services/mrpeasy/{rate-limiter,request-queue,retry,circuit-breaker}.ts`
- Contains: Token bucket implementation, FIFO queue, exponential backoff, circuit breaker state machine
- Depends on: Logger
- Used by: API client (composed into request pipeline)

**Error Handling Layer:**
- Purpose: Translate API errors to LLM-friendly messages with suggestions
- Location: `src/lib/errors.ts` (error factories), `src/mcp/tools/error-handler.ts` (tool-level wrapper)
- Contains: McpToolError class, specific error factories (rate limit, auth, validation, etc.), error formatting
- Depends on: Logger
- Used by: Tools and tool error handler

**Configuration Layer:**
- Purpose: Validate and provide typed environment variables
- Location: `src/lib/env.ts`
- Contains: Zod schema for env vars, validation logic, lazy initialization
- Depends on: Zod, Logger
- Used by: Server startup, API client initialization

**Logging Layer:**
- Purpose: Centralize structured logging to stderr (critical for MCP protocol)
- Location: `src/lib/logger.ts`
- Contains: Log level functions (debug, info, warn, error), timestamp formatting
- Depends on: None
- Used by: All layers

## Data Flow

**Read Operation (e.g., get_inventory):**

1. Client sends HTTP POST to `/mcp` with MCP request
2. Express routes to StreamableHTTPServerTransport.handleRequest()
3. MCP server dispatches to `get_inventory` tool handler
4. Tool validates params with Zod schema
5. Tool calls `client.getStockItems(params)`
6. Client.request() enqueues the operation:
   - Queue waits for single-concurrent slot
   - Circuit breaker checks state (CLOSED/OPEN/HALF_OPEN)
   - Retry wrapper with exponential backoff
   - Rate limiter waits for token
   - fetch() executes HTTP request to MRPeasy API
7. Response parsed, Content-Range header extracted for pagination metadata
8. Tool formats response as hybrid JSON/text for LLM
9. Response returned to client

**Write Operation (e.g., create_customer_order):**

1. Client sends HTTP POST with mutation params and `confirm: false`
2. Tool handler validates input with Zod
3. If `confirm: false` (default): return preview (request body without executing)
4. If `confirm: true`:
   - Tool calls `client.createCustomerOrder(payload)`
   - Payload goes through same resilience stack as reads
   - fetch() sends POST with JSON body
   - Response (201/202) returned to tool
   - Tool formats response for LLM

**Error Flow:**

1. Tool catches error (MrpEasyApiError, CircuitBreakerOpenError, etc.)
2. handleToolError() maps error to specific McpToolError factory
3. Factory creates error with:
   - userMessage (LLM-friendly)
   - suggestedAction (what to try next)
   - isRetryable flag (retry guidance)
   - errorCode (machine-readable identifier)
4. formatErrorForMcp() converts to MCP response with isError: true
5. Response sent to client with formatted message and suggestion

**State Management:**

- Session state: In-memory Map<sessionId, transport> on server instance
- Circuit breaker state: In-memory state machine (CLOSED/OPEN/HALF_OPEN)
- Rate limiter state: Token bucket with last refill timestamp
- Request queue state: FIFO array with processing flag
- No persistence layer - all state ephemeral to process lifetime

## Key Abstractions

**MrpEasyClient:**
- Purpose: Provides typed API methods and hides resilience complexity
- Examples: `src/services/mrpeasy/client.ts` (main class, 900+ lines)
- Pattern: Public typed methods (getStockItems, createCustomerOrder, etc.) that call private request() method
- Resilience stack is private implementation detail

**Tool Registration Pattern:**
- Purpose: Decouple tool implementations from server setup
- Examples: `registerInventoryTools()`, `registerOrderTools()`, `registerMutationTools()` functions
- Pattern: Each tool group has a register function that receives server and client, calls server.tool() multiple times
- Server factory (`createMcpServer()`) calls all register functions

**Error Translation:**
- Purpose: Bridge gap between API errors and LLM-friendly responses
- Examples: `createRateLimitError()`, `createAuthenticationError()`, `createApiValidationError()`
- Pattern: Error factories return McpToolError with context. handleToolError() wrapper maps API errors to factories.

**Zod Validation:**
- Purpose: Type-safe input validation for MCP tools
- Examples: `GetCustomerOrdersInputSchema`, `CreateCustomerOrderSchema` in `src/mcp/tools/orders.ts`
- Pattern: Define schema as `z.object()`, attach `.describe()` for LLM hints, pass to server.tool()

**Resilience Stack Composition:**
- Purpose: Layer protection mechanisms without tight coupling
- Pattern: Each resilience component (queue, circuit breaker, retry, rate limiter) is independent
  - Queue: wraps all requests (enforces 1 concurrent)
  - Circuit breaker: wraps retry (protects against cascading failures)
  - Retry: wraps rate limiter (handles transient failures)
  - Rate limiter: wraps fetch (respects API limits)

## Entry Points

**HTTP Server:**
- Location: `src/server.ts`
- Triggers: Node process startup, executed as main module
- Responsibilities:
  - Express app creation and middleware setup
  - Session management (transports map)
  - Route handling for /mcp GET/POST/DELETE
  - Health check at /health
  - Graceful error responses

**MCP Server Factory:**
- Location: `src/mcp/tools/index.ts::createMcpServer()`
- Triggers: HTTP POST to /mcp with initialize request (new session)
- Responsibilities:
  - Create McpServer instance with name/version/description
  - Create API client (memoized singleton)
  - Register instruction resource (Markdown guide for LLM)
  - Call all tool registrar functions
  - Return configured server ready to connect

**Tool Handlers:**
- Location: `src/mcp/tools/*.ts`
- Triggers: LLM calls specific tool
- Responsibilities:
  - Parse and validate input with Zod
  - Call API client method
  - Format response (hybrid JSON text or structured)
  - Handle errors with handleToolError()

## Error Handling

**Strategy:** Layered error translation - API errors → tool-level handling → LLM-friendly messages

**Patterns:**

1. **At API Client Level (`src/services/mrpeasy/client.ts`):**
   - Wrap all fetch errors in MrpEasyApiError with status code
   - Extract error messages from API response body
   - Determine retryable status codes (429, 503, 408, 502, 504)
   - Extract Retry-After header for 429 responses

2. **At Retry Level (`src/services/mrpeasy/retry.ts`):**
   - Check isRetryable() before retrying
   - Respect Retry-After header for 429
   - Apply exponential backoff with jitter
   - Log each retry attempt

3. **At Circuit Breaker Level (`src/services/mrpeasy/circuit-breaker.ts`):**
   - Only count 5xx errors as failures (4xx are user errors, not service degradation)
   - Trip on failure threshold, block with CircuitBreakerOpenError
   - Transition to HALF_OPEN after timeout, allow probe request

4. **At Tool Level (`src/mcp/tools/*.ts`):**
   - Wrap tool handler in try-catch
   - Call handleToolError() on error
   - Return MCP-formatted error response

5. **Error Factories (`src/lib/errors.ts`):**
   - Each error type has factory: createRateLimitError(), createAuthenticationError(), etc.
   - Factory creates McpToolError with:
     - userMessage: "The MRPeasy service is temporarily unavailable. Try again later."
     - suggestedAction: "Wait a moment and retry the request."
     - isRetryable: true/false
     - errorCode: 'SERVICE_UNAVAILABLE' (machine readable)

## Cross-Cutting Concerns

**Logging:**
- Centralized in `src/lib/logger.ts`, all output to stderr (critical for MCP protocol)
- Log levels: debug (development), info (startup), warn (retries), error (failures)
- Structured logging with context objects: `logger.debug('Message', { key: value })`
- MCP servers must never use console.log (corrupts protocol output on stdout)

**Validation:**
- Input: Zod schemas in tool definitions, automatic rejection before handler runs
- Output: No formal schema validation (LLM handles response format)
- Environment: Zod schema in env.ts, fail-fast at startup

**Authentication:**
- Basic Auth header: "Basic " + base64(apiKey:apiSecret) in all MRPeasy API requests
- Credentials from environment variables MRPEASY_API_KEY and MRPEASY_API_SECRET
- 401/403 responses caught at client level, specific error factory used
- No token refresh/expiry logic (MRPeasy uses static credentials)

**Rate Limiting:**
- Token bucket in `src/services/mrpeasy/rate-limiter.ts`
- Configured: 75 tokens capacity, 7.5 tokens/sec refill (conservative estimate)
- Tools don't need to handle this - client abstracts it away
- If token exhausted, waitForToken() sleeps before retry

**Resilience:**
- Request queue: Max 1 concurrent (enforced at client level)
- Circuit breaker: 5 failures → open, 30sec timeout → half-open, 2 successes → closed
- Retry: Max 5 attempts, 2sec base delay, 60sec max delay, ±20% jitter
- All components disabled if needed (circuit breaker can be disabled in config)
