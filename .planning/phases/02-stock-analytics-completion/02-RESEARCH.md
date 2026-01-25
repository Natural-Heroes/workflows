# Phase 2: Stock Analytics Completion - Research

**Researched:** 2026-01-25
**Domain:** MCP Tool Validation & Stock Analytics
**Confidence:** HIGH

## Summary

This research covers the completion and testing of stock analytics tools for the inventory-planner MCP server. The codebase is approximately 85% complete with most READ tools already implemented. The primary gap is the complete absence of tests for the existing tools and the lack of reference data endpoints (warehouses, vendors) in the Inventory Planner API.

After analyzing the codebase and Inventory Planner API documentation, the following tools already exist and need validation:
- `get_variants` - Covers READ-01, READ-04, READ-05
- `get_variant` - Covers READ-01, READ-05 (single variant detail)
- `get_replenishment` - Covers READ-02, READ-03

The reference data requirements (REF-01, REF-02) cannot be fulfilled via dedicated API endpoints. Inventory Planner does not expose `/api/v1/warehouses` or `/api/v1/vendors` endpoints. The recommended approach is to extract unique warehouse/vendor data from variant responses.

**Primary recommendation:** Validate existing tools with integration tests using mocked API responses, and implement reference data extraction from variant responses for REF-01/REF-02.

## Standard Stack

The testing stack established in Phase 1 remains standard:

### Core Testing
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.x | Test runner | Native ESM/TypeScript support, already configured |
| supertest | ^7.x | HTTP/MCP testing | High-level HTTP assertions, works with Express apps |
| vitest-fetch-mock | ^0.4.x | Fetch mocking | Mock external API calls (not yet installed) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @faker-js/faker | ^9.x | Test data generation | Generate realistic inventory test data |

**Installation (if not already present):**
```bash
cd mcp/inventory-planner && npm install -D vitest-fetch-mock @faker-js/faker
```

## Architecture Patterns

### Existing Tool Structure
```
src/
├── mcp/
│   ├── tools/
│   │   ├── variants.ts         # get_variants, get_variant, get_replenishment (exist)
│   │   ├── purchase-orders.ts  # PO tools (exist, Phase 3)
│   │   ├── mutations.ts        # update_variant (exists, Phase 3)
│   │   ├── error-handler.ts    # Error translation (exists, tested)
│   │   ├── error-handler.test.ts # Error tests (exists)
│   │   └── index.ts            # Tool registration (exists)
│   └── index.ts                # MCP server creation
└── __tests__/
    └── mcp-session.test.ts     # Session tests (exists)
```

### Pattern 1: Tool Integration Test with Mocked API

**What:** Test MCP tool responses by mocking the Inventory Planner API
**When to use:** Validating tool parameter handling, response formatting, error scenarios
**Example:**
```typescript
// variants.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import request from 'supertest';
import { app, transports } from '../app.js';
import { resetInventoryPlannerClient } from '../services/inventory-planner/index.js';

const fetchMocker = createFetchMock(vi);

beforeEach(() => {
  fetchMocker.enableMocks();
  fetchMocker.resetMocks();
  transports.clear();
  resetInventoryPlannerClient();
});

afterEach(() => {
  fetchMocker.disableMocks();
});

async function initSession() {
  // ... session initialization helper (from mcp-session.test.ts)
}

describe('get_variants tool', () => {
  it('returns variants with stock metrics', async () => {
    // Mock API response
    fetchMocker.mockResponseOnce(JSON.stringify({
      result: { status: 'success' },
      meta: { total: 1, count: 1, limit: 100 },
      variants: [{
        id: 'v1',
        sku: 'TEST-SKU-001',
        stock_on_hand: 100,
        stock_available: 90,
        replenishment: 50,
        oos: 14,
        inventory_value: 1500.00,
      }],
    }));

    const sessionId = await initSession();
    const response = await callTool(sessionId, 'get_variants', { sku: 'TEST-SKU-001' });

    expect(response.variants[0].sku).toBe('TEST-SKU-001');
    expect(response.variants[0].stockOnHand).toBe(100);
  });
});
```

### Pattern 2: Reference Data Extraction

**What:** Extract unique warehouses/vendors from variant responses since no dedicated endpoints exist
**When to use:** REF-01 (list warehouses), REF-02 (list vendors)
**Example:**
```typescript
// Reference data tool implementation
server.tool(
  'list_warehouses',
  'Get unique warehouses from variant data. Use to understand available filtering options.',
  {
    limit: z.number().int().min(1).max(100).default(20),
  },
  async (params) => {
    // Fetch variants with warehouse fields
    const response = await client.getVariants({
      fields: 'warehouse_id,warehouse_name',
      limit: 1000,
    });

    // Extract unique warehouses
    const warehouseMap = new Map<string, string>();
    for (const v of response.data) {
      if (v.warehouse_id && v.warehouse_name) {
        warehouseMap.set(v.warehouse_id, v.warehouse_name);
      }
    }

    const warehouses = Array.from(warehouseMap.entries())
      .slice(0, params.limit)
      .map(([id, name]) => ({ id, name }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          summary: `${warehouses.length} warehouses available.`,
          warehouses,
        }),
      }],
    };
  }
);
```

### Anti-Patterns to Avoid
- **Testing with real API credentials:** Never use production credentials in tests
- **Hard-coding test data inline:** Use factory functions or fixtures for variant data
- **Skipping error scenarios:** Test both success and failure paths for each tool

## Tool-to-Requirement Mapping

Analysis of existing tools against Phase 2 requirements:

| Requirement | Existing Tool | Status | Gap |
|-------------|--------------|--------|-----|
| READ-01: Stock levels by SKU | `get_variants`, `get_variant` | Implemented | Needs tests |
| READ-02: Stockout risk (oos < X) | `get_variants` with oos_lt | Implemented | Needs tests |
| READ-03: Replenishment recs | `get_replenishment` | Implemented | Needs tests |
| READ-04: Inventory value | `get_variants` | Implemented | Needs tests |
| READ-05: Demand forecasts | `get_variant` (detail) | Partial | get_variants also returns forecast data |
| REF-01: List warehouses | Not implemented | **Missing** | Needs new tool |
| REF-02: List vendors | Not implemented | **Missing** | Needs new tool |

### Tool Parameter Verification

**get_variants parameters (already implemented):**
- `sku` - Filter by SKU (READ-01)
- `warehouse_id` - Filter by warehouse
- `vendor_id` - Filter by vendor
- `stock_on_hand_lt` - Low stock filter (READ-01)
- `oos_lt` - Days until stockout filter (READ-02)
- `fields` - Field selection
- `page`, `limit` - Pagination

**get_replenishment parameters (already implemented):**
- `warehouse_id`, `vendor_id` - Filter options
- `sort_desc` - Sort by replenishment qty (READ-03 urgency)
- `page`, `limit` - Pagination

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique warehouse list | Custom API endpoint | Extract from variants | API doesn't expose dedicated endpoint |
| Unique vendor list | Custom API endpoint | Extract from variants | API doesn't expose dedicated endpoint |
| Test data generation | Hardcoded objects | @faker-js/faker | Realistic data, reproducible with seeds |
| Fetch mocking | Manual global.fetch | vitest-fetch-mock | Proper cleanup, response chaining |
| MCP tool testing | Custom JSON-RPC calls | supertest + SSE parsing | Established pattern from Phase 1 |

**Key insight:** The Inventory Planner API exposes warehouse_id, warehouse_name, vendor_id, vendor_name as fields on variants, but has no dedicated endpoints for listing all warehouses or vendors. The reference data tools must aggregate from variant responses.

## Common Pitfalls

### Pitfall 1: Forgetting to Reset Client Between Tests

**What goes wrong:** Tests share the same InventoryPlannerClient instance with stale mocks
**Why it happens:** The module uses a memoized singleton pattern
**How to avoid:**
- Call `resetInventoryPlannerClient()` in afterEach or beforeEach
- Import from `services/inventory-planner/index.js`
**Warning signs:** Mock doesn't apply, previous test's mock affects current test

### Pitfall 2: SSE Response Parsing

**What goes wrong:** Tests fail to extract JSON from tool responses
**Why it happens:** MCP SDK returns Server-Sent Events format, not raw JSON
**How to avoid:**
- Use the `parseSSEResponse()` helper established in Phase 1
- Expect `event: message\ndata: {...}` format
**Warning signs:** response.body is empty, JSON.parse errors

### Pitfall 3: Missing Accept Header

**What goes wrong:** MCP requests return 406 Not Acceptable
**Why it happens:** SDK requires specific Accept header
**How to avoid:**
- Always set `Accept: 'application/json, text/event-stream'`
- Use the `MCP_ACCEPT_HEADER` constant from Phase 1 tests
**Warning signs:** 406 status, "Not Acceptable" errors

### Pitfall 4: API Field Selection Confusion

**What goes wrong:** Expected fields not returned, response too large
**Why it happens:** Inventory Planner returns 200+ fields by default
**How to avoid:**
- Use the `fields` parameter to request only needed fields
- Test with explicit field selection
**Warning signs:** Large response payloads, missing expected fields

### Pitfall 5: Reference Data Pagination

**What goes wrong:** list_warehouses/list_vendors miss some entries
**Why it happens:** Only querying first page of variants
**How to avoid:**
- Query with high limit (e.g., 1000)
- Or implement pagination through all variants
- Document limitation in tool description
**Warning signs:** Known warehouses not appearing in list

## Code Examples

Verified patterns from the codebase and Phase 1:

### Test Setup Pattern (from existing tests)

```typescript
// Set fake environment variables before importing app
process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import request from 'supertest';
import { app, transports } from '../app.js';
import { resetInventoryPlannerClient } from '../services/inventory-planner/index.js';

const fetchMocker = createFetchMock(vi);
const MCP_ACCEPT_HEADER = 'application/json, text/event-stream';

function parseSSEResponse(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    }
  }
  return null;
}

beforeEach(() => {
  fetchMocker.enableMocks();
  fetchMocker.resetMocks();
  transports.clear();
  resetInventoryPlannerClient();
});

afterEach(() => {
  fetchMocker.disableMocks();
});
```

### Tool Call Helper Pattern

```typescript
async function initSession(): Promise<string> {
  await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT_HEADER)
    .send({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
      id: 1,
    });

  // Wait for async session initialization
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Send initialized notification
  const sessionId = Array.from(transports.keys())[0];
  await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT_HEADER)
    .set('mcp-session-id', sessionId)
    .send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  return sessionId;
}

async function callTool(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT_HEADER)
    .set('mcp-session-id', sessionId)
    .send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: Date.now(),
    });

  const data = parseSSEResponse(response.text);
  if (!data || !data.result) {
    throw new Error(`Tool call failed: ${response.text}`);
  }

  const result = data.result as { content: Array<{ text: string }> };
  return JSON.parse(result.content[0].text);
}
```

### Mock API Response Pattern

```typescript
it('get_variants filters by SKU', async () => {
  // Mock Inventory Planner API response
  fetchMocker.mockResponseOnce(JSON.stringify({
    result: { status: 'success' },
    meta: { name: 'variants', total: 1, count: 1, limit: 100 },
    variants: [{
      id: 'variant-123',
      sku: 'WIDGET-001',
      title: 'Widget',
      stock_on_hand: 50,
      stock_available: 45,
      stock_incoming: 20,
      replenishment: 0,
      oos: 30,
      days_of_stock: 30,
      inventory_value: 500.00,
      vendor_name: 'Acme Corp',
      warehouse_name: 'Main Warehouse',
      forecast_daily: 1.5,
      forecast_weekly: 10.5,
      forecast_monthly: 42.0,
    }],
  }));

  const sessionId = await initSession();
  const result = await callTool(sessionId, 'get_variants', { sku: 'WIDGET-001' });

  expect(result.variants).toHaveLength(1);
  expect(result.variants[0].sku).toBe('WIDGET-001');
  expect(result.variants[0].stockOnHand).toBe(50);
  expect(result.variants[0].forecastDaily).toBe(1.5);
});
```

### Reference Data Tool Implementation

```typescript
// list_warehouses tool (to be added to variants.ts)
server.tool(
  'list_warehouses',
  'Get available warehouses/locations. Use to understand filtering options for variants.',
  {
    limit: z.number().int().min(1).max(100).default(20)
      .describe('Maximum warehouses to return'),
  },
  async (params) => {
    logger.debug('list_warehouses tool called', { params });

    try {
      // Fetch variants with warehouse fields only
      const response = await client.getVariants({
        fields: 'warehouse_id,warehouse_name',
        limit: 1000, // Get enough to extract unique warehouses
      });

      // Extract unique warehouses
      const warehouseMap = new Map<string, string>();
      for (const v of response.data) {
        if (v.warehouse_id && v.warehouse_name) {
          warehouseMap.set(v.warehouse_id, v.warehouse_name);
        }
      }

      const warehouses = Array.from(warehouseMap.entries())
        .slice(0, params.limit)
        .map(([id, name]) => ({ id, name }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: `${warehouses.length} warehouses found.`,
            warehouses,
            note: 'Warehouses extracted from variant data. Large inventories may have additional warehouses.',
          }),
        }],
      };
    } catch (error) {
      return handleToolError(error, 'list_warehouses');
    }
  }
);
```

## API Limitations

### Inventory Planner API Constraints

Based on research of the [Inventory Planner Public API](http://help.inventory-planner.com/using-inventory-planner/inventory-planner-api/inventory-planner-public-api):

| Endpoint | Exists | Notes |
|----------|--------|-------|
| `/api/v1/variants` | Yes | Main read endpoint, 200+ metrics |
| `/api/v1/variants/{id}` | Yes | Single variant detail |
| `/api/v1/purchase-orders` | Yes | PO management |
| `/api/v1/warehouses` | **No** | Not exposed |
| `/api/v1/vendors` | **No** | Not exposed |
| `/api/v1/locations` | **No** | Not exposed |

**Impact on requirements:**
- REF-01 and REF-02 cannot use dedicated endpoints
- Must extract from variant data (warehouse_id, warehouse_name, vendor_id, vendor_name fields exist on variants)
- This approach has limitations for large inventories (may miss warehouses with no active variants)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for ESM | Vitest | 2023-2024 | Much faster, native ESM |
| Global fetch mocks | vitest-fetch-mock | 2024 | Cleaner test code |
| Real API in tests | Mocked API responses | Always | No flaky tests, no rate limits |

## Open Questions

Things that couldn't be fully resolved:

1. **Historical data availability**
   - What we know: HIST-* requirements deferred pending API verification
   - What's unclear: Whether Inventory Planner stores historical stockout data
   - Recommendation: Deferred to v2 as per roadmap

2. **Large inventory pagination for reference data**
   - What we know: Fetching 1000 variants may not cover all warehouses
   - What's unclear: Typical warehouse count, whether pagination is needed
   - Recommendation: Start with limit=1000, add pagination if needed based on testing

3. **Vendor-variant relationship**
   - What we know: Variants can have multiple vendors (vendors array)
   - What's unclear: Whether all vendors appear on at least one variant
   - Recommendation: Extract from both vendor_id/vendor_name and vendors array

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All source files in `mcp/inventory-planner/src/`
- Phase 1 research and implementation (01-RESEARCH.md, test files)
- [Inventory Planner Public API](http://help.inventory-planner.com/using-inventory-planner/inventory-planner-api/inventory-planner-public-api)
- [Inventory Planner Reports API](https://help.inventory-planner.com/en/articles/6852616-inventory-planner-reports-api)

### Secondary (MEDIUM confidence)
- [GitHub: inventoryplanner-php](https://github.com/dansmaculotte/inventoryplanner-php) - Confirms limited endpoint coverage
- [Saras Analytics Inventory Planner](https://help.sarasanalytics.com/en_US/inventory-planner/inventory-planner) - Field documentation

### Tertiary (LOW confidence)
- WebSearch results for API endpoints - Many hits for other products (Sage Intacct, Zoho), not Inventory Planner

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Established in Phase 1, no changes needed
- Tool implementation: HIGH - Tools already exist, analysis from codebase
- Reference data approach: MEDIUM - Workaround for missing endpoints, needs validation
- API constraints: MEDIUM - Based on documentation, may have undocumented endpoints

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (stable technologies, low churn expected)
