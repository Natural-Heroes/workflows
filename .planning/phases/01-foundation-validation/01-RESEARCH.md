# Phase 1: Foundation Validation - Research

**Researched:** 2026-01-25
**Domain:** MCP Server Testing & Validation
**Confidence:** HIGH

## Summary

This research covers how to validate the existing inventory-planner MCP server infrastructure. The codebase is approximately 85% complete with all core components implemented. The validation phase focuses on testing what exists rather than building new functionality.

The primary gap is the complete absence of tests. All four infrastructure requirements (INFRA-01 through INFRA-04) have implemented code but zero automated validation. The standard approach for Node.js/TypeScript in 2025 is Vitest for unit and integration testing, with supertest for HTTP-level testing.

**Primary recommendation:** Add Vitest + supertest test infrastructure with unit tests for resilience components and integration tests for the HTTP/MCP server layer.

## Standard Stack

The established libraries/tools for testing this type of server:

### Core Testing

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^2.x | Test runner | Native ESM/TypeScript support, 10-20x faster than Jest for ESM projects |
| supertest | ^7.x | HTTP testing | High-level HTTP assertions, works with Express apps directly |
| @types/supertest | ^6.x | TypeScript types | Type safety for supertest assertions |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest-fetch-mock | ^0.4.x | Fetch mocking | Mock external API calls without hitting real endpoints |
| @faker-js/faker | ^9.x | Test data generation | Generate realistic test data |

### MCP-Specific Testing

| Tool | Purpose | When to Use |
|------|---------|-------------|
| MCP Inspector | Interactive debugging | Manual validation of MCP protocol compliance |

**Installation:**
```bash
npm install -D vitest supertest @types/supertest vitest-fetch-mock @faker-js/faker
```

## Architecture Patterns

### Recommended Test Structure
```
src/
├── lib/
│   ├── env.ts
│   └── env.test.ts           # Unit tests alongside source
├── services/
│   └── inventory-planner/
│       ├── circuit-breaker.ts
│       ├── circuit-breaker.test.ts
│       ├── rate-limiter.ts
│       ├── rate-limiter.test.ts
│       ├── retry.ts
│       ├── retry.test.ts
│       ├── request-queue.ts
│       └── request-queue.test.ts
└── __tests__/                 # Integration tests
    ├── server.test.ts         # HTTP/Express tests
    └── mcp-session.test.ts    # MCP protocol tests
```

### Pattern 1: App-Server Separation

**What:** Separate Express app from server listener for testability
**When to use:** Always for Express applications that need HTTP testing
**Example:**
```typescript
// app.ts - Export the Express app
export const app = express();
app.use(express.json());
app.get('/health', ...);
app.post('/mcp', ...);

// server.ts - Only starts listening (not tested directly)
import { app } from './app.js';
app.listen(env.PORT);
```

**Current gap:** The codebase combines app and server in `server.ts`. Refactor needed.

### Pattern 2: Isolated Unit Tests for Resilience Components

**What:** Test each resilience component (circuit breaker, rate limiter, retry, queue) in isolation
**When to use:** These components have pure logic that doesn't require external dependencies
**Example:**
```typescript
// circuit-breaker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, createCircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = createCircuitBreaker({ failureThreshold: 3, timeout: 1000 });
  });

  it('starts in CLOSED state', () => {
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('opens after threshold failures', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    expect(breaker.getState()).toBe('OPEN');
  });
});
```

### Pattern 3: Mocked Fetch for API Client Tests

**What:** Mock global fetch to test API client without real network calls
**When to use:** Testing client error handling, retry logic, rate limit behavior
**Example:**
```typescript
// client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

beforeEach(() => {
  fetchMocker.resetMocks();
});

it('retries on 429 with Retry-After header', async () => {
  fetchMocker.mockResponseOnce('', { status: 429, headers: { 'Retry-After': '1' } });
  fetchMocker.mockResponseOnce(JSON.stringify({ variants: [] }));

  const client = new InventoryPlannerClient({ apiKey: 'test', accountId: 'test' });
  await client.getVariants();

  expect(fetchMocker).toHaveBeenCalledTimes(2);
});
```

### Pattern 4: Supertest for HTTP Integration

**What:** Test HTTP endpoints without starting a real server
**When to use:** Validating Express routes, middleware, error responses
**Example:**
```typescript
// server.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Health endpoint', () => {
  it('returns 200 with status healthy', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });
});
```

### Anti-Patterns to Avoid
- **Testing with real API credentials:** Never use production credentials in tests
- **Testing server.ts directly:** Requires actual port binding, use app export instead
- **Sharing test state:** Always reset mocks in beforeEach, use isolated circuit breakers

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fetch mocking | Manual global.fetch override | vitest-fetch-mock | Proper cleanup, response chaining, assertion helpers |
| HTTP testing | Manual fetch to localhost | supertest | No port binding needed, better assertions |
| Test data | Hardcoded strings | @faker-js/faker | Realistic data, no collision issues |
| MCP protocol testing | Manual JSON-RPC calls | MCP Inspector | Validates protocol compliance properly |

**Key insight:** The resilience components (circuit breaker, rate limiter, retry, queue) are already well-isolated and testable as pure units. The main work is adding tests, not refactoring code.

## Common Pitfalls

### Pitfall 1: Testing Environment Variables Without Isolation
**What goes wrong:** Tests pollute process.env, causing flaky tests
**Why it happens:** Zod validation reads from process.env directly
**How to avoid:**
- Mock process.env in beforeEach
- Restore in afterEach
- Or use vi.stubEnv() from Vitest
**Warning signs:** Tests pass individually but fail when run together

### Pitfall 2: Memoized Client Instance Leaking Between Tests
**What goes wrong:** Tests share the same InventoryPlannerClient instance
**Why it happens:** The module uses a memoized singleton pattern
**How to avoid:**
- Call `resetInventoryPlannerClient()` in afterEach (already exists in codebase)
- Import and call in test setup
**Warning signs:** Mock doesn't apply, or previous test's mock affects current test

### Pitfall 3: Circuit Breaker State Persisting
**What goes wrong:** Circuit breaker opens unexpectedly in later tests
**Why it happens:** Same breaker instance used across tests
**How to avoid:** Create fresh CircuitBreaker in each test via beforeEach
**Warning signs:** Early tests pass, later tests fail with "circuit breaker open"

### Pitfall 4: Async Timing in Retry/Rate Limiter Tests
**What goes wrong:** Tests timeout or are flaky
**Why it happens:** Real timers cause slow tests, race conditions
**How to avoid:** Use `vi.useFakeTimers()` for time-dependent tests
**Warning signs:** Tests take 30+ seconds, or fail intermittently

### Pitfall 5: MCP Session State Between Tests
**What goes wrong:** Session ID from one test affects another
**Why it happens:** In-memory transports Map persists
**How to avoid:** Clear transports Map between tests, or use fresh app instance
**Warning signs:** "Invalid session ID" errors in tests that should work

## Code Examples

Verified patterns from the codebase and official sources:

### Testing Environment Validation (INFRA-01)

```typescript
// lib/env.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when INVENTORY_PLANNER_API_KEY is missing', async () => {
    delete process.env.INVENTORY_PLANNER_API_KEY;
    process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

    const { validateEnv } = await import('./env.js');
    expect(() => validateEnv()).toThrow('INVENTORY_PLANNER_API_KEY');
  });

  it('accepts valid environment with defaults', async () => {
    process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
    process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

    const { validateEnv } = await import('./env.js');
    const env = validateEnv();

    expect(env.INVENTORY_PLANNER_API_KEY).toBe('test-key');
    expect(env.PORT).toBe(3000); // default
    expect(env.NODE_ENV).toBe('development'); // default
  });

  it('validates PORT is a valid number', async () => {
    process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
    process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';
    process.env.PORT = 'not-a-number';

    const { validateEnv } = await import('./env.js');
    expect(() => validateEnv()).toThrow('PORT');
  });
});
```

### Testing Circuit Breaker (INFRA-02)

```typescript
// services/inventory-planner/circuit-breaker.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100, // Fast for tests
    });
  });

  it('allows requests in CLOSED state', async () => {
    const result = await breaker.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe('OPEN');
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
      CircuitBreakerOpenError
    );
  });

  it('transitions to HALF_OPEN after timeout', async () => {
    vi.useFakeTimers();

    // Trip the breaker
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await breaker.execute(fail).catch(() => {});
    }
    expect(breaker.getState()).toBe('OPEN');

    // Advance time past timeout
    vi.advanceTimersByTime(150);

    // Next call should work (transitions to HALF_OPEN)
    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');

    vi.useRealTimers();
  });

  it('respects shouldTrip predicate for 4xx errors', async () => {
    const clientError = { status: 400 };
    const shouldTrip = (err: unknown) => {
      const e = err as { status: number };
      return e.status >= 500;
    };

    // 4xx errors should not trip
    for (let i = 0; i < 5; i++) {
      await breaker.execute(() => Promise.reject(clientError), shouldTrip).catch(() => {});
    }

    expect(breaker.getState()).toBe('CLOSED'); // Not tripped
  });
});
```

### Testing Rate Limiter (INFRA-02)

```typescript
// services/inventory-planner/rate-limiter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket } from './rate-limiter.js';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows burst up to capacity', () => {
    const bucket = new TokenBucket(5, 1);

    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume()).toBe(true);
    }
    expect(bucket.tryConsume()).toBe(false);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket(5, 1); // 1 token per second

    // Drain all tokens
    for (let i = 0; i < 5; i++) bucket.tryConsume();

    // Advance 1 second
    vi.advanceTimersByTime(1000);

    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('waitForToken blocks until token available', async () => {
    const bucket = new TokenBucket(1, 1);
    bucket.tryConsume(); // Drain

    const waitPromise = bucket.waitForToken();
    vi.advanceTimersByTime(1000);

    await expect(waitPromise).resolves.toBeUndefined();
  });
});
```

### Testing Error Translation (INFRA-03)

```typescript
// mcp/tools/error-handler.test.ts
import { describe, it, expect } from 'vitest';
import { handleToolError } from './error-handler.js';
import { InventoryPlannerApiError, CircuitBreakerOpenError } from '../../services/inventory-planner/index.js';

describe('handleToolError', () => {
  it('translates 429 to LLM-friendly rate limit message', () => {
    const error = new InventoryPlannerApiError('rate limited', 429, 'RATE_LIMITED', 30);
    const result = handleToolError(error, 'test_tool');

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Rate limit exceeded');
    expect(result.content[0].text).toContain('30 seconds');
  });

  it('translates 401/403 to auth error with suggestion', () => {
    const error = new InventoryPlannerApiError('unauthorized', 401);
    const result = handleToolError(error, 'test_tool');

    expect(result.content[0].text).toContain('Authentication failed');
    expect(result.content[0].text).toContain('INVENTORY_PLANNER_API_KEY');
  });

  it('translates circuit breaker open to service unavailable', () => {
    const error = new CircuitBreakerOpenError('open');
    const result = handleToolError(error, 'test_tool');

    expect(result.content[0].text).toContain('temporarily unavailable');
  });

  it('handles unknown errors gracefully', () => {
    const error = new Error('something unexpected');
    const result = handleToolError(error, 'test_tool');

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unexpected error');
    // Should NOT contain internal details
    expect(result.content[0].text).not.toContain('something unexpected');
  });
});
```

### Testing MCP Session Flow (INFRA-04)

```typescript
// __tests__/mcp-session.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js'; // Requires refactor to export app

describe('MCP Session Protocol', () => {
  it('rejects non-initialize requests without session ID', async () => {
    const response = await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('session');
  });

  it('initializes session and returns session ID header', async () => {
    const response = await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      });

    expect(response.status).toBe(200);
    expect(response.headers['mcp-session-id']).toBeDefined();
  });

  it('maintains session across multiple requests', async () => {
    // Initialize
    const initResponse = await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      });

    const sessionId = initResponse.headers['mcp-session-id'];

    // Use session for tools/list
    const listResponse = await request(app)
      .post('/mcp')
      .set('mcp-session-id', sessionId)
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.result.tools).toBeDefined();
  });

  it('ping tool returns pong', async () => {
    // Initialize session
    const initResponse = await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      });

    const sessionId = initResponse.headers['mcp-session-id'];

    // Call ping tool
    const pingResponse = await request(app)
      .post('/mcp')
      .set('mcp-session-id', sessionId)
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'ping', arguments: {} },
        id: 3,
      });

    expect(pingResponse.body.result.content[0].text).toBe('pong');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for ESM | Vitest | 2023-2024 | Much faster, native ESM support |
| Manual fetch mocks | vitest-fetch-mock | 2024 | Cleaner test code, proper cleanup |
| Nock for HTTP mocking | MSW or vitest-fetch-mock | 2024 | Better TypeScript support |
| Separate test files | Co-located tests | 2024 | Better maintainability |

**Note on MCP testing:** The MCP Inspector is the official tool for interactive debugging but not for automated tests. For automated testing, use supertest to exercise the HTTP endpoints with proper MCP protocol messages.

## Validation Without Real Credentials

All INFRA requirements can be validated without real Inventory Planner API credentials:

| Requirement | Validation Approach | Credentials Needed |
|-------------|---------------------|-------------------|
| INFRA-01 (Env validation) | Unit test with mock env vars | No |
| INFRA-02 (Resilience stack) | Unit tests with mocked fetch | No |
| INFRA-03 (Error translation) | Unit tests with simulated errors | No |
| INFRA-04 (MCP sessions) | Integration tests via supertest | Fake values work |

**Key insight:** The server validates credentials exist at startup (INFRA-01), but the actual API is only called when tools are invoked. MCP session flow (INFRA-04) works with any credential values since it only validates they're present.

## Required Refactoring

To enable proper testing, one small refactor is needed:

**Current state:** `server.ts` combines app setup and listening
**Required change:** Extract Express app to separate `app.ts`

```typescript
// app.ts (new file)
import express from 'express';
// ... all middleware and routes
export const app = express();

// server.ts (modified)
import { app } from './app.js';
import { getEnv } from './lib/env.js';
const env = getEnv();
app.listen(env.PORT, ...);
```

This refactor is minimal and enables supertest to work without binding ports.

## Open Questions

Things that couldn't be fully resolved:

1. **MCP SDK test utilities**
   - What we know: The SDK provides transports but not explicit test helpers
   - What's unclear: Whether InMemoryTransport or similar exists for unit testing tools
   - Recommendation: Use supertest for HTTP-level testing, which is sufficient for INFRA-04

2. **StreamableHTTPServerTransport behavior in tests**
   - What we know: Works with real HTTP connections
   - What's unclear: Behavior when used with supertest's internal handling
   - Recommendation: Test with supertest first; if issues arise, consider spawning actual server

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All source files in `mcp/inventory-planner/src/`
- [Vitest Official Documentation](https://vitest.dev/guide/) - Getting started, mocking, configuration

### Secondary (MEDIUM confidence)
- [MCP Inspector Documentation](https://modelcontextprotocol.io/docs/tools/inspector) - Official debugging tool
- [GitHub: Node.js Testing Best Practices](https://github.com/goldbergyoni/nodejs-testing-best-practices) - April 2025 update
- [How to Test Your Node.js RESTful API with Vitest](https://danioshi.substack.com/p/how-to-test-your-nodejs-restful-api) - App/server separation pattern
- [vitest-fetch-mock NPM](https://www.npmjs.com/package/vitest-fetch-mock) - Fetch mocking for Vitest

### Tertiary (LOW confidence)
- WebSearch results for circuit breaker testing patterns - Need validation against actual implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest + supertest is well-established for Node.js/TypeScript
- Architecture: HIGH - Patterns derived from official docs and codebase structure
- Pitfalls: MEDIUM - Based on common patterns, may need validation during implementation
- MCP protocol testing: MEDIUM - Limited official documentation on automated testing

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (stable technologies, low churn expected)
