# Coding Conventions

**Analysis Date:** 2026-01-25

**Focus:** MCP server implementations (mrpeasy, inventory-planner), analyzed for consistency and best practices.

## Naming Patterns

**Files:**
- kebab-case for all filenames: `circuit-breaker.ts`, `error-handler.ts`, `rate-limiter.ts`
- Directory names are kebab-case: `mcp/`, `services/`, `lib/`
- Tool registration files are named by feature: `inventory.ts`, `orders.ts`, `mutations.ts`, `product.ts`
- Service subdirectories are named by API provider: `services/mrpeasy/`, `services/inventory-planner/`

**Functions:**
- camelCase for all function declarations: `registerInventoryTools()`, `handleToolError()`, `createMrpEasyClient()`
- Async functions always declared with `async` keyword
- Tool registration functions follow pattern: `register<Feature>Tools(server, client)`
- Factory functions prefixed with `create`: `createMcpServer()`, `createMrpEasyClient()`, `createCircuitBreaker()`
- Helper functions suffixed with their purpose: `calculateDelay()`, `isRetryable()`, `formatErrorForMcp()`

**Variables:**
- camelCase for all variable/constant names: `clientInstance`, `DEFAULT_CONFIG`, `INSTRUCTIONS_RESOURCE`
- SCREAMING_SNAKE_CASE for public string constants: `SERVER_DESCRIPTION`, `INSTRUCTIONS_RESOURCE`
- Private fields use underscore prefix: `_env`, `_contentRange`, `lastError`
- Loop/temp variables stay lowercase: `i`, `id`, `error`

**Types:**
- PascalCase for all TypeScript types, interfaces, classes: `McpServer`, `MrpEasyClient`, `CircuitBreaker`
- Error classes inherit from `Error` and use PascalCase: `McpToolError`, `MrpEasyApiError`, `CircuitBreakerOpenError`
- Interface names describe objects: `MrpEasyClientConfig`, `CircuitBreakerConfig`, `StockItem`, `CustomerOrder`
- Type aliases for unions/utility types: `type HttpMethod = 'GET' | 'POST' | 'PUT'`

**Parameters:**
- Zod schema objects follow feature name: `CustomerOrderProductSchema`, `CreateCustomerOrderSchema`, `UpdateManufacturingOrderSchema`

## Code Style

**Formatting:**
- No external formatter configured; code follows implicit style:
  - 2-space indentation (TypeScript standard)
  - Lines typically 80-100 characters
  - JSDoc comments for all public functions/types
  - Blank lines between logical sections
  - No semicolons enforced, but used consistently
  - Trailing commas in multi-line structures

**Linting:**
- No ESLint/Prettier config found in mrpeasy or inventory-planner
- TypeScript compiler (`tsc`) used for type checking via `npm run typecheck`
- Strict mode enabled in `tsconfig.json`: `"strict": true`
- All files must pass TypeScript compilation with zero errors

**Comments:**
- JSDoc (/** ... */) for all:
  - Function definitions
  - Class definitions
  - Public types and interfaces
  - Complex algorithms
- Inline comments (// ...) for:
  - Non-obvious logic
  - Important notes (CRITICAL, NOTE, IMPORTANT)
  - Section separators (`// ============ ... ============`)
- No trailing inline comments; comments on separate lines

## Import Organization

**Order:**
1. TypeScript/Node standard library imports: `import { randomUUID } from 'crypto'`
2. Third-party packages: `import express, { Request, Response } from 'express'`
3. Type imports: `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'`
4. Relative imports from parent directories: `import { logger } from '../../lib/logger.js'`
5. Relative imports from same directory: `import { handleToolError } from './error-handler.js'`

**Path Style:**
- Always use explicit file extensions (`.js`) for relative imports
- Use absolute imports where possible
- No path aliases configured; use relative paths
- All imports are ES modules: no CommonJS `require()` statements

**Example from `src/mcp/tools/inventory.ts`:**
```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';
```

## Environment Configuration

**Validation:**
- Zod schemas validate all environment variables at startup
- Validation happens in `validateEnv()` function in `lib/env.ts`
- Server exits (exit code 1) if validation fails
- Required vs optional vars defined with `.optional()` or required by default

**Example from `src/lib/env.ts`:**
```typescript
const envSchema = z.object({
  MRPEASY_API_KEY: z
    .string({ required_error: 'MRPEASY_API_KEY is required' })
    .min(1, 'MRPEASY_API_KEY cannot be empty'),
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10)),
});
```

**Env Variables Used:**
- `MRPEASY_API_KEY` - API authentication
- `MRPEASY_API_SECRET` - API authentication
- `INVENTORY_PLANNER_API_KEY` - API authentication (for inventory-planner)
- `INVENTORY_PLANNER_API_SECRET` - API authentication (for inventory-planner)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production/test)

## Error Handling

**Custom Error Classes:**
- `McpToolError` - For MCP tool-specific errors with user messages and suggestions
  - Fields: `userMessage`, `internalDetails`, `isRetryable`, `suggestedAction`, `errorCode`
  - Factory functions: `createRateLimitError()`, `createAuthenticationError()`, etc.
  - Result formatter: `formatErrorForMcp()` wraps for MCP protocol

- `MrpEasyApiError` - For HTTP API errors from MRPeasy
  - Fields: `status`, `code`, `isRetryable`, `retryAfterSeconds`
  - Determines retryability based on HTTP status (429, 503, 408, 502, 504)

- `CircuitBreakerOpenError` - When circuit breaker is open
  - Thrown by `CircuitBreaker.execute()`

**Error Handling Pattern:**
```typescript
try {
  // Tool implementation
  const result = await client.getStockItems(params);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
} catch (error) {
  return handleToolError(error, 'tool_name');
}
```

**handleToolError() Pattern (`src/mcp/tools/error-handler.ts`):**
- Maps MrpEasyApiError by status code to user-friendly error
- Maps CircuitBreakerOpenError to service unavailable
- Catches unexpected errors and logs internal details
- Returns MCP-compatible error response with `isError: true`

**Validation Errors:**
- Input validation handled by Zod in tool schema definitions
- Missing required params caught by Zod before tool execution
- Invalid values checked manually in tool implementation
- Return inline error responses for validation failures

## Logging

**Framework:** Custom logger in `lib/logger.ts`
- Not using external logging library; simple stderr-based implementation
- **CRITICAL:** All logging goes to stderr via `console.error()`, never stdout
- Stdout reserved for MCP protocol communication

**Log Levels:**
- `debug()` - Verbose development info
- `info()` - General operational info
- `warn()` - Potential issues
- `error()` - Actual errors

**Format:** `[TIMESTAMP] [LEVEL] message {json_data}`
- Timestamp: ISO 8601 format
- Level: Uppercase, padded to 5 chars (DEBUG, INFO, WARN, ERROR)
- Data: JSON stringified if provided

**Usage Pattern:**
```typescript
logger.debug('Processing request', { id: '123' });
logger.info('Server started', { port: 3000 });
logger.warn('Rate limit approaching');
logger.error('Failed to connect', { error: err.message });
```

**When to Log:**
- Server startup/shutdown events
- Tool invocations with parameters
- API call attempts and retries
- Circuit breaker state transitions
- Rate limiter events
- Error conditions with context

## Function Design

**Size:**
- Tool handler functions: 50-100 lines typical
- Utility functions: 20-50 lines typical
- Service methods: 30-80 lines typical
- No strict line limit, but functions should have single responsibility

**Parameters:**
- Use object destructuring for tool parameters: `async (params) => { ... }`
- Zod schema defines all valid params; trust schema validation
- Service methods accept config objects when multiple optional params
- No more than 3-4 parameters for functions (use object for 4+)

**Return Values:**
- Tool handlers return `{ content: [...], isError?: boolean }`
- Service methods return typed promises: `Promise<T>`
- Prefer throwing errors over returning null/undefined
- Never return bare null or undefined from service layer

**Async/Await:**
- All async operations use `await`; never chain `.then()` calls
- Async functions always return a typed Promise

**Example from `src/services/mrpeasy/client.ts`:**
```typescript
async getStockItems(params?: StockItemsParams): Promise<StockItem[]> {
  const response = await this.request<MrpEasyApiResponse<StockItem>>(
    'GET',
    '/stock-items',
    params
  );
  return response.data;
}
```

## Module Design

**Barrel Files:**
- Used to re-export functionality from modules
- `src/services/mrpeasy/index.ts` exports client, errors, resilience utilities, factory function
- `src/mcp/index.ts` exports server creation function

**What Gets Exported:**
- Classes and types used elsewhere
- Factory functions for creating instances
- Utility functions used by multiple modules
- Error classes and type definitions

**What Stays Private:**
- Internal utility functions
- Implementation details of resilience layers
- Configuration objects (exported but not for external use)

**Circular Dependencies:**
- Avoided by careful module structure
- Services don't import from mcp/
- mcp/ imports from services/
- lib/ has no dependencies except Node/third-party

## Zod Validation Patterns

**Location:** All Zod schemas defined in tool files, not extracted to separate schema module

**Schema Definition:**
- Group related schemas at top of tool file in section: `// ============ Zod Schemas ============`
- Schemas defined in order of tool registration
- Each schema is a `z.object()`

**Field Descriptions:**
- All fields have `.describe()` for LLM documentation
- Descriptions explain what field is, example values, and constraints
- Example: `.describe('Filter by item code/SKU (e.g., "ZPEO-NH-1"). Exact match.')`

**Defaults and Optionals:**
- `.optional()` for optional params
- `.default(value)` to set defaults
- Page parameters: default 1, min 1
- Per-page parameters: default varies by endpoint, max usually 100

**Example from `src/mcp/tools/mutations.ts`:**
```typescript
const CreateCustomerOrderSchema = z.object({
  customer_id: z.number().int().positive().describe('Customer ID'),
  products: z.array(CustomerOrderProductSchema).min(1).describe('Products to order'),
  confirm: z.boolean().default(false).describe('Set to true to execute...'),
});
```

## Type System

**Generics:**
- Used for API response wrappers: `MrpEasyApiResponse<T>`
- Used for async functions: `Promise<T>`
- Used for utility functions: `function withRetry<T>(fn: () => Promise<T>)`

**Type vs Interface:**
- Interfaces for object shapes: `interface CircuitBreakerConfig`
- Type aliases for unions: `type HttpMethod = 'GET' | 'POST' | 'PUT'`
- Type aliases for function signatures: common for callbacks

**Type Imports:**
- Always use `import type { ... }` for type-only imports
- Benefits: cleaner output, prevents circular dependencies

## Session Management

**HTTP Session Architecture (`src/server.ts`):**
- Map-based session store: `Map<sessionId, transport>`
- Session ID from `mcp-session-id` header
- Initialize: POST /mcp with `Initialize` request (no session header)
- Reuse: POST/GET/DELETE /mcp with session header

**Session Lifecycle:**
- Create on first initialize request
- Reuse with same sessionId on subsequent requests
- Close when client sends close signal or DELETE request
- Track sessions for observability (health endpoint)

## Tool Architecture Pattern

**Tool Registration:**
```typescript
export function registerInventoryTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  server.tool(
    'tool_name',
    'Description for LLM',
    { /* Zod schema params */ },
    async (params) => { /* implementation */ }
  );
}
```

**Tool Handler Pattern:**
```typescript
async (params) => {
  logger.debug('tool_name called', { params });
  try {
    // Perform work
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    return handleToolError(error, 'tool_name');
  }
}
```

**Confirm Pattern for Mutations:**
- Write tools take `confirm: boolean` parameter
- When `confirm: false` (default), return preview of what would be sent
- When `confirm: true`, execute the mutation and return result
- Always validate inputs before performing write

---

*Convention analysis: 2026-01-25*
