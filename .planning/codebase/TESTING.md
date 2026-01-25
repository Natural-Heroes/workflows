# Testing Patterns

**Analysis Date:** 2026-01-25

**Status:** No test framework currently configured in mrpeasy or inventory-planner MCP servers.

**Note:** This document describes the *testing approach recommended* based on codebase structure and the patterns that *would* work best, along with examples from the resilience layer that can be unit tested.

## Test Framework Setup

**Runner:** Recommended - Vitest (modern, ESM-native, TypeScript-friendly)
```bash
npm install --save-dev vitest @vitest/ui
```

**Alternative:** Jest with ESM support
```bash
npm install --save-dev jest @types/jest ts-jest
```

**Assertion Library:** Node.js `assert` (built-in) or Chai
```bash
npm install --save-dev chai @types/chai
```

**Run Commands:**
```bash
vitest                    # Watch mode
vitest run                # Single run
vitest --ui               # UI dashboard
vitest --coverage         # Coverage report
npm run test              # From package.json
```

**Recommended package.json updates:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

## Test File Organization

**Location:** Co-located with source files

**Naming Convention:**
- `source-file.ts` → `source-file.test.ts`
- `circuit-breaker.ts` → `circuit-breaker.test.ts`
- `error-handler.ts` → `error-handler.test.ts`

**Directory Structure:**
```
src/
├── lib/
│   ├── logger.ts
│   ├── logger.test.ts
│   ├── errors.ts
│   ├── errors.test.ts
│   └── env.ts
├── services/mrpeasy/
│   ├── circuit-breaker.ts
│   ├── circuit-breaker.test.ts
│   ├── rate-limiter.ts
│   ├── rate-limiter.test.ts
│   ├── retry.ts
│   ├── retry.test.ts
│   ├── client.ts
│   └── client.test.ts
└── mcp/tools/
    ├── error-handler.ts
    ├── error-handler.test.ts
    ├── inventory.ts
    └── inventory.test.ts
```

## Test Structure

**File Template:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100,
    });
  });

  describe('basic functionality', () => {
    it('should allow requests when CLOSED', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should block requests when OPEN', async () => {
      // Trigger 3 failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {
          // Expected
        }
      }

      // Next request should be blocked
      await expect(
        breaker.execute(async () => 'success')
      ).rejects.toThrow('CircuitBreakerOpenError');
    });
  });

  describe('state transitions', () => {
    it('should transition from OPEN to HALF_OPEN after timeout', async () => {
      // ... setup to open circuit ...
      await new Promise((r) => setTimeout(r, 150)); // Wait longer than timeout

      // Should now be in HALF_OPEN, allowing test request
      const result = await breaker.execute(async () => 'test');
      expect(result).toBe('test');
    });
  });
});
```

## Suite Organization

**Describe Blocks:**
- Top level: class/function name
- Second level: feature or behavior category
- Third level: specific test cases

**Example from Circuit Breaker Tests:**
```
CircuitBreaker
├── basic functionality
│   ├── should allow requests when CLOSED
│   ├── should block requests when OPEN
│   └── should count successes in HALF_OPEN
├── state transitions
│   ├── should transition from OPEN to HALF_OPEN after timeout
│   ├── should return to CLOSED on success threshold
│   └── should return to OPEN on failure in HALF_OPEN
└── configuration
    ├── should use default config when not provided
    └── should use custom thresholds when provided
```

## Setup and Teardown

**beforeEach:** Reset test state
```typescript
beforeEach(() => {
  breaker = new CircuitBreaker(testConfig);
  vi.clearAllMocks();
});
```

**afterEach:** Clean up async operations
```typescript
afterEach(() => {
  vi.clearAllTimers();
});
```

**beforeAll/afterAll:** One-time setup (sparingly)
```typescript
beforeAll(() => {
  // Initialize shared test fixtures
});

afterAll(() => {
  // Clean up resources
});
```

## Mocking Strategy

**Use Vitest's vi (Mock Functions):**
```typescript
import { vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

mockFetch.mockResolvedValue(
  new Response(JSON.stringify({ data: [] }), { status: 200 })
);
```

**What to Mock:**
- HTTP calls (fetch/node-fetch) - test API error handling independently
- External services - focus on client behavior, not service behavior
- Timers - for testing retry logic and circuit breaker timeouts
- Logger - if testing log output (usually skip)

**What NOT to Mock:**
- Zod schema validation - test real validation behavior
- Error classes - test real error creation and properties
- Core business logic - test actual implementation

**Mocking External API Calls:**
```typescript
describe('MrpEasyClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;
  });

  it('should parse API response', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ article_id: 1, code: 'TEST-001' }],
          pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const client = new MrpEasyClient({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    });

    const items = await client.getStockItems();
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe('TEST-001');
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
      })
    );

    const client = new MrpEasyClient({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    });

    await expect(client.getStockItems()).rejects.toThrow('MrpEasyApiError');
  });
});
```

**Mocking Timers for Retry Logic:**
```typescript
import { vi } from 'vitest';

describe('withRetry', () => {
  it('should retry with exponential backoff', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();

    // Fail twice, then succeed
    fn
      .mockRejectedValueOnce(new MrpEasyApiError('Rate limited', 429))
      .mockRejectedValueOnce(new MrpEasyApiError('Rate limited', 429))
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, { maxAttempts: 3 });

    // Advance timers through all retries
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
```

## Test Types

**Unit Tests:**
- **Scope:** Individual functions, classes, modules
- **Approach:** Test single responsibility; mock dependencies
- **Examples:**
  - Circuit breaker state transitions
  - Rate limiter token consumption
  - Zod schema validation
  - Error factory functions

**Unit Test Example - Rate Limiter:**
```typescript
describe('TokenBucket', () => {
  it('should consume tokens up to capacity', () => {
    const bucket = new TokenBucket(10, 1); // 10 capacity, 1 token/sec

    // Consume 10 tokens
    for (let i = 0; i < 10; i++) {
      expect(bucket.tryConsume()).toBe(true);
    }

    // 11th consume should fail
    expect(bucket.tryConsume()).toBe(false);
  });

  it('should refill tokens over time', async () => {
    vi.useFakeTimers();
    const bucket = new TokenBucket(5, 1); // Refill 1 token per second

    bucket.tryConsume(); // Now at 4
    vi.advanceTimersByTime(1000); // Wait 1 second
    expect(bucket.tryConsume()).toBe(true); // Should have refilled 1

    vi.useRealTimers();
  });
});
```

**Integration Tests:**
- **Scope:** Multiple modules working together
- **Approach:** Real implementations, mock external APIs
- **Examples:**
  - Client with retry + rate limiter + circuit breaker stack
  - Tool invocation with validation and error handling
  - Session management in HTTP transport

**Integration Test Example - Client Resilience Stack:**
```typescript
describe('MrpEasyClient with resilience features', () => {
  it('should apply rate limiting before requests', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );

    const client = new MrpEasyClient({
      apiKey: 'test',
      apiSecret: 'test',
    });

    // Make 10 rapid requests
    const promises = Array(10)
      .fill(null)
      .map(() => client.getStockItems());

    await Promise.all(promises);

    // Should have been rate limited (fewer than 10 calls)
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('should retry on 503 Service Unavailable', async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Fail once, then succeed
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, { status: 503 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

    const client = new MrpEasyClient({
      apiKey: 'test',
      apiSecret: 'test',
    });

    const promise = client.getStockItems();
    await vi.runAllTimersAsync();
    await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
```

**E2E Tests:**
- **Not implemented currently**, but would require:
  - Real MCP server running
  - Client connecting over HTTP
  - Real (or stubbed) MRPeasy API responses
  - Tool invocation and response validation

## Fixtures and Factories

**Location:** Separate `__fixtures__` or `test-utils` directory
```
src/
├── __fixtures__/
│   ├── stock-items.fixture.ts
│   ├── customer-orders.fixture.ts
│   └── api-responses.fixture.ts
└── test-utils/
    ├── mocks.ts
    └── helpers.ts
```

**Fixture Example:**
```typescript
// src/__fixtures__/stock-items.fixture.ts
export const mockStockItem = {
  article_id: 1,
  code: 'TEST-001',
  title: 'Test Product',
  quantity_on_hand: 100,
  reserved: 10,
  quantity_available: 90,
};

export const mockStockItemResponse = {
  data: [mockStockItem],
  pagination: {
    page: 1,
    per_page: 20,
    total: 1,
    total_pages: 1,
  },
};
```

**Factory Function Example:**
```typescript
// src/test-utils/factories.ts
export function createTestCircuitBreaker(overrides?: Partial<CircuitBreakerConfig>) {
  return new CircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 100,
    ...overrides,
  });
}

export function createTestMrpEasyClient(overrides?: Partial<MrpEasyClientConfig>) {
  return new MrpEasyClient({
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    ...overrides,
  });
}
```

## Validation Testing

**Zod Schema Testing:**
```typescript
import { z } from 'zod';

const CreateCustomerOrderSchema = z.object({
  customer_id: z.number().int().positive(),
  products: z.array(ProductSchema).min(1),
});

describe('CreateCustomerOrderSchema', () => {
  it('should accept valid data', () => {
    const valid = {
      customer_id: 123,
      products: [{ article_id: 1, quantity: 5 }],
    };

    const result = CreateCustomerOrderSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  it('should reject negative customer_id', () => {
    const invalid = {
      customer_id: -1,
      products: [{ article_id: 1, quantity: 5 }],
    };

    expect(() => CreateCustomerOrderSchema.parse(invalid)).toThrow();
  });

  it('should reject empty products array', () => {
    const invalid = {
      customer_id: 123,
      products: [],
    };

    expect(() => CreateCustomerOrderSchema.parse(invalid)).toThrow();
  });
});
```

## Error Testing

**Error Class Testing:**
```typescript
describe('McpToolError', () => {
  it('should create error with all properties', () => {
    const error = new McpToolError({
      userMessage: 'Something went wrong',
      internalDetails: 'Connection timeout',
      isRetryable: true,
      suggestedAction: 'Try again later',
      errorCode: 'TIMEOUT',
    });

    expect(error.userMessage).toBe('Something went wrong');
    expect(error.isRetryable).toBe(true);
    expect(error.errorCode).toBe('TIMEOUT');
  });

  it('should format error for MCP response', () => {
    const error = new McpToolError({
      userMessage: 'Rate limited',
      isRetryable: true,
      suggestedAction: 'Wait and retry',
    });

    const mcp = formatErrorForMcp(error);
    expect(mcp.isError).toBe(true);
    expect(mcp.content[0].text).toContain('Rate limited');
    expect(mcp.content[0].text).toContain('Wait and retry');
  });
});
```

**Error Factory Testing:**
```typescript
describe('error factories', () => {
  it('createRateLimitError should be retryable', () => {
    const error = createRateLimitError(5);
    expect(error.isRetryable).toBe(true);
    expect(error.userMessage).toContain('5 seconds');
  });

  it('createNotFoundError should not be retryable', () => {
    const error = createNotFoundError('customer');
    expect(error.isRetryable).toBe(false);
  });
});
```

## Async Testing

**Promise-based Tests:**
```typescript
it('should resolve with data', async () => {
  const result = await client.getStockItems();
  expect(result).toBeInstanceOf(Array);
});

it('should reject with error', async () => {
  mockFetch.mockResolvedValue(
    new Response(null, { status: 500 })
  );

  await expect(client.getStockItems()).rejects.toThrow('MrpEasyApiError');
});
```

**Fake Timers:**
```typescript
it('should wait before retrying', async () => {
  vi.useFakeTimers();

  const fn = vi.fn()
    .mockRejectedValueOnce(new Error('fail'))
    .mockResolvedValueOnce('success');

  const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 100 });

  expect(fn).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(fn).toHaveBeenCalledTimes(2);

  await promise;
  vi.useRealTimers();
});
```

## Coverage

**Target:** Aim for 70%+ coverage on critical modules
- **Must cover:** Error handling, resilience layers, validation
- **Should cover:** API client methods, tool handlers
- **Nice to cover:** Utility functions, helpers

**View Coverage:**
```bash
npm run test:coverage
vitest --coverage
```

**Coverage Config (vitest.config.ts):**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
});
```

## Running Tests

**Development Workflow:**
```bash
npm run test:watch        # Watch mode as you code
npm run test              # Single run before commit
npm run test:coverage     # Check coverage
npm run test:ui           # Visual test dashboard
```

**CI/CD Integration:**
```bash
npm run test -- --run     # Single run in CI
npm run test:coverage     # Generate coverage for reporting
```

## Test Data Patterns

**Environment Variables in Tests:**
```typescript
describe('with environment validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate required env vars', () => {
    delete process.env.MRPEASY_API_KEY;

    expect(() => validateEnv()).toThrow('MRPEASY_API_KEY is required');
  });
});
```

**Test Isolation:**
```typescript
// Always reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
  resetMrpEasyClient(); // Custom reset function
});
```

## Best Practices

1. **One assertion per test** - When possible. If multiple related assertions, group under clear describe block.

2. **Descriptive test names** - Use `it('should [expected behavior] when [condition]')`

3. **DRY with beforeEach** - Setup common test state, not in each test

4. **Mock sparingly** - Test real code, mock only external dependencies

5. **Test behavior, not implementation** - Focus on inputs/outputs, not internal mechanics

6. **Keep tests fast** - Use fake timers, avoid real delays

7. **Test error cases** - Validation failures, API errors, timeouts

8. **Document complex tests** - Add comments explaining non-obvious test setup

---

*Testing analysis: 2026-01-25*
