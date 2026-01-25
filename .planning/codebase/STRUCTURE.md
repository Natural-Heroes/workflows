# Codebase Structure

**Analysis Date:** 2026-01-25

## Directory Layout

```
mcp/mrpeasy/                           # MCP server root
├── src/
│   ├── server.ts                      # HTTP server entry point (Express + MCP transport)
│   ├── mcp/
│   │   ├── index.ts                   # Re-exports from tools/index.ts
│   │   └── tools/
│   │       ├── index.ts               # Server factory & tool registrar orchestration
│   │       ├── error-handler.ts       # Shared error handling for all tools
│   │       ├── inventory.ts           # get_inventory tool
│   │       ├── product.ts             # get_product tool
│   │       ├── search.ts              # search_items tool
│   │       ├── orders.ts              # get_customer_orders, get_manufacturing_orders tools
│   │       ├── shipments.ts           # get_shipments, get_shipment_details tools
│   │       ├── mutations.ts           # create_*, update_* write tools
│   │       ├── boms.ts                # BOM (Bill of Materials) read/write tools
│   │       ├── routings.ts            # Routing read/write tools
│   │       ├── purchase-orders.ts     # get_purchase_orders tool (read-only)
│   │       ├── stock-lots.ts          # get_stock_lots tool
│   │       └── reports.ts             # get_report tool
│   ├── services/
│   │   └── mrpeasy/
│   │       ├── index.ts               # Module entry point, singleton client factory
│   │       ├── client.ts              # MrpEasyClient class, all API methods
│   │       ├── types.ts               # TypeScript types for API responses
│   │       ├── rate-limiter.ts        # TokenBucket rate limiter (75 capacity, 7.5/sec)
│   │       ├── request-queue.ts       # FIFO queue enforcing 1 concurrent request
│   │       ├── retry.ts               # Exponential backoff with jitter (max 5 attempts)
│   │       └── circuit-breaker.ts     # Circuit breaker (5 failures open, 30s timeout)
│   └── lib/
│       ├── logger.ts                  # Structured logging to stderr
│       ├── errors.ts                  # Error factories & McpToolError class
│       ├── env.ts                     # Environment variable validation (Zod)
│       └── index.ts                   # Barrel export (if used)
├── package.json
├── tsconfig.json
├── Dockerfile
└── docs/
    └── MRPEASY_API.md                 # External API reference documentation
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript source code
- Contains: Server, MCP integration, services, utilities
- Key files: `server.ts` (entry point), `mcp/tools/index.ts` (tool registry)

**src/mcp/:**
- Purpose: MCP protocol integration and tool definitions
- Contains: Tool implementations, server factory, tool orchestration
- Key files: `tools/index.ts` (createMcpServer), error-handler.ts (shared error logic)

**src/mcp/tools/:**
- Purpose: Individual MCP tool implementations
- Contains: Tool handler functions grouped by domain (inventory, orders, mutations, etc.)
- Key files: `index.ts` (registers all tools), `mutations.ts` (write operations)
- Pattern: Each file exports registerX() function that calls server.tool() one or more times

**src/services/:**
- Purpose: External service integrations
- Contains: Currently only mrpeasy/ for MRPeasy API client
- Pattern: Ready to add new services (e.g., src/services/shopify/, src/services/odoo/)

**src/services/mrpeasy/:**
- Purpose: MRPeasy REST API client with resilience patterns
- Contains: API methods, resilience components (queue, circuit breaker, retry, rate limiter)
- Key files: `client.ts` (main class), `index.ts` (factory, singleton memoization)
- Pattern: Private request() method orchestrates resilience stack

**src/lib/:**
- Purpose: Cross-cutting utilities and helpers
- Contains: Logging, error handling, environment configuration
- Key files: `logger.ts` (stderr logging), `errors.ts` (error factories), `env.ts` (validation)
- Pattern: No dependencies on MCP or specific services, purely utilities

## Key File Locations

**Entry Points:**

- `src/server.ts`: HTTP server startup, handles Express middleware, session management, /mcp routes
- `src/mcp/tools/index.ts::createMcpServer()`: MCP server factory, registers all tools
- `src/services/mrpeasy/index.ts::createMrpEasyClient()`: API client factory (singleton memoization)

**Configuration:**

- `src/lib/env.ts`: Environment variable schema and validation (validateEnv, getEnv)
- `tsconfig.json`: TypeScript compilation settings
- `package.json`: Dependencies and build scripts

**Core Logic:**

- `src/services/mrpeasy/client.ts`: All MRPeasy API methods (900+ lines)
  - Public methods: getStockItems(), getCustomerOrders(), createCustomerOrder(), etc.
  - Private method: request() that orchestrates resilience stack

- `src/mcp/tools/`:
  - `inventory.ts`: Stock item queries with pagination
  - `orders.ts`: Customer and manufacturing order queries with filtering
  - `mutations.ts`: All write operations (create/update for CO, MO, items)
  - `search.ts`: Item search by name/code
  - Other tools: shipments, BOMs, routings, purchase orders, stock lots, reports

**Testing/Documentation:**

- `docs/MRPEASY_API.md`: MRPeasy REST API reference (not API implementation)

**Resilience Components:**

- `src/services/mrpeasy/rate-limiter.ts`: Token bucket (75 capacity, 7.5 tokens/sec)
- `src/services/mrpeasy/request-queue.ts`: FIFO queue (max 1 concurrent)
- `src/services/mrpeasy/retry.ts`: Exponential backoff (max 5 attempts, 2-60sec delay)
- `src/services/mrpeasy/circuit-breaker.ts`: State machine (CLOSED/OPEN/HALF_OPEN)

**Error Handling:**

- `src/lib/errors.ts`: McpToolError class and factory functions
- `src/mcp/tools/error-handler.ts`: handleToolError() function for tools

**Logging:**

- `src/lib/logger.ts`: Centralized logging to stderr (critical for MCP protocol)

## Naming Conventions

**Files:**

- camelCase for all TypeScript files: `rateLimit.ts`, `errorHandler.ts`
- Domain-grouped tools: `inventory.ts`, `orders.ts`, `mutations.ts` (organize by feature)
- Utility files in lib/: `logger.ts`, `errors.ts`, `env.ts` (describe purpose)
- Service folders: singular service name under services/ (e.g., `services/mrpeasy/`, not `mrpeasy-services/`)

**Directories:**

- Lowercase plural for collections: `tools/`, `services/`
- Lowercase singular for domain folders: `lib/`, `mcp/`
- Service folders singular: `mrpeasy/` (not `mrpeasys/`)

**Functions:**

- camelCase for all functions: `createMcpServer()`, `registerInventoryTools()`, `handleToolError()`
- Prefix register for tool registrars: `registerInventoryTools()`, `registerOrderTools()`
- Prefix create for factories: `createMrpEasyClient()`, `createRateLimiter()`
- Prefix with for utility wrappers: `withRetry()` (wrapper pattern)

**Types:**

- PascalCase for classes: `MrpEasyClient`, `CircuitBreaker`, `TokenBucket`, `McpToolError`
- PascalCase for interfaces: `MrpEasyClientConfig`, `CircuitBreakerConfig`
- PascalCase for exported type aliases: `StockItem`, `CustomerOrder`, `ManufacturingOrder`
- camelCase for local types: `CircuitState` ('CLOSED' | 'OPEN' | 'HALF_OPEN')

**Constants:**

- SCREAMING_SNAKE_CASE for truly immutable constants: `DEFAULT_CONFIG`, `SERVER_DESCRIPTION`
- PascalCase enums: `CircuitState` (type definition itself, not instance)

## Where to Add New Code

**New MCP Tool (Read-Only):**

1. Create file: `src/mcp/tools/[domain].ts`
2. Define input schema with Zod: `const Get[Feature]InputSchema = z.object(...)`
3. Export function: `export function register[Feature]Tools(server: McpServer, client: MrpEasyClient): void`
4. Inside function, call: `server.tool('[tool_name]', '[description]', schema, handler)`
5. In handler, wrap with try-catch and call handleToolError() on error
6. Import and call register function in `src/mcp/tools/index.ts::createMcpServer()`

Example structure:
```typescript
// src/mcp/tools/[domain].ts
export function register[Feature]Tools(server: McpServer, client: MrpEasyClient): void {
  server.tool(
    'get_[feature]',
    'Tool description for LLM',
    { param: z.string().optional().describe('...') },
    async (params) => {
      try {
        const result = await client.get[Feature](params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_[feature]');
      }
    }
  );
}
```

**New Write Tool (Mutation):**

1. Create schema in `src/mcp/tools/mutations.ts` or new file
2. Add `confirm: z.boolean().default(false)` to schema
3. In handler, check `if (!params.confirm) return { preview of payload }`
4. If confirm true, call `client.create[Entity](payload)` or `client.update[Entity](payload)`
5. Pattern: Always preview by default, require explicit confirm=true to execute

**New API Client Method:**

1. Add method to `src/services/mrpeasy/client.ts` class
2. If GET: Call `this.request<T>('/endpoint', params)`
3. If POST: Call `this.request<T>('/endpoint', undefined, undefined, 'POST', body)`
4. If PUT: Call `this.request<T>('/endpoint/${id}', undefined, undefined, 'PUT', body)`
5. Add JSDoc comments explaining parameters and return value
6. Resilience stack is automatic through private request() method

**New Service Integration:**

1. Create directory: `src/services/[service-name]/`
2. Create files:
   - `client.ts` - main client class with API methods
   - `types.ts` - TypeScript response types
   - `index.ts` - factory function and exports
   - Resilience components as needed (rate-limiter.ts, circuit-breaker.ts, etc.)
3. Create factory: `export function create[Service]Client(): [Service]Client`
4. Memoize in index.ts: `let clientInstance = null; export function create[Service]Client() { ... }`
5. Create tool registrars in `src/mcp/tools/[service].ts`
6. Register in `src/mcp/tools/index.ts::createMcpServer()`

**New Error Type:**

1. Add factory in `src/lib/errors.ts`
2. Function name: `create[Error]Error()` returning `McpToolError`
3. Set isRetryable, suggestedAction, errorCode appropriately
4. Use in `src/mcp/tools/error-handler.ts` inside handleToolError()

**New Environment Variable:**

1. Add to schema in `src/lib/env.ts` envSchema
2. Add description in comment above schema
3. Add validation (required, format, range)
4. Update Env type (auto-inferred from schema)
5. Access via `getEnv()[VARIABLE_NAME]`

## Special Directories

**src/mcp/tools/:**

- Purpose: All tool implementations live here
- Generated: No
- Committed: Yes
- Pattern: One or more registerX() functions per file, each file represents a logical domain
- Register order in index.ts doesn't matter (tools are orthogonal)

**src/services/:**

- Purpose: External service integrations
- Generated: No
- Committed: Yes
- Pattern: Each service gets a folder with client.ts, types.ts, index.ts minimum
- Can include resilience components if needed (rate-limiter.ts, circuit-breaker.ts, retry.ts)

**src/lib/:**

- Purpose: Reusable utilities and cross-cutting concerns
- Generated: No
- Committed: Yes
- Pattern: No MCP or service-specific dependencies, pure utilities
- Files are typically small (50-300 lines) and focused on one concern

**dist/:**

- Purpose: Compiled JavaScript output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)
- Entry point: `dist/server.js` (compiled from src/server.ts)

**node_modules/:**

- Purpose: Installed dependencies
- Generated: Yes (by npm install)
- Committed: No (in .gitignore)

**docs/:**

- Purpose: External documentation (not source code)
- Generated: No (manually maintained)
- Committed: Yes
- Pattern: Markdown files documenting external APIs or integration guides
- Example: docs/MRPEASY_API.md (MRPeasy REST API reference, not our implementation)
