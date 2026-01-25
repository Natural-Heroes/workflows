# Phase 3: Purchase Order & Mutations - Research

**Researched:** 2026-01-25
**Domain:** MCP Tool Validation - Purchase Orders & Variant Mutations
**Confidence:** HIGH

## Summary

This research covers the completion of Phase 3: Purchase Order & Mutations for the inventory-planner MCP server. The analysis reveals that all tools required for this phase are already fully implemented in the codebase. The remaining work is validation through integration tests.

After comprehensive codebase analysis, the following tools exist and need validation:
- `get_purchase_orders` - Covers PO-01 (list/filter POs)
- `get_purchase_order` - Covers PO-02 (view PO details with line items)
- `create_purchase_order` - Covers PO-03 (create PO with preview-before-execute)
- `update_purchase_order` - Covers PO-04 (update PO status, dates, notes)
- `update_received_qty` - Covers PO-05 (record received quantities)
- `update_variant` - Covers VAR-01 (update planning parameters)

All tools are registered in `index.ts` and have complete implementations with:
- Proper Zod schema validation for parameters
- Preview mode (confirm=false returns preview, confirm=true executes)
- LLM-friendly error handling via `handleToolError`
- Correct response formatting with JSON content

**Primary recommendation:** Validate all existing PO and mutation tools with integration tests following the established patterns from Phase 2 (variants.test.ts, reference.test.ts).

## Standard Stack

The testing stack established in Phase 1 and used in Phase 2 remains standard:

### Core Testing
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.x | Test runner | Native ESM/TypeScript support, already configured |
| supertest | ^7.x | HTTP/MCP testing | High-level HTTP assertions, works with Express apps |
| vitest-fetch-mock | ^0.4.x | Fetch mocking | Mock external API calls (already installed) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @faker-js/faker | ^9.x | Test data generation | Generate realistic PO test data |

**Installation:**
Already installed - no additional dependencies needed.

## Architecture Patterns

### Existing Tool Structure
```
src/
├── mcp/
│   ├── tools/
│   │   ├── variants.ts           # get_variants, get_variant, get_replenishment (validated)
│   │   ├── variants.test.ts      # Integration tests (created in Phase 2)
│   │   ├── purchase-orders.ts    # PO tools (exist, need tests)
│   │   ├── mutations.ts          # update_variant (exists, needs tests)
│   │   ├── reference.ts          # list_warehouses, list_vendors (validated)
│   │   ├── reference.test.ts     # Integration tests (created in Phase 2)
│   │   ├── error-handler.ts      # Error translation (validated)
│   │   └── index.ts              # Tool registration (all tools registered)
│   └── index.ts                  # MCP server creation
└── services/
    └── inventory-planner/
        ├── client.ts             # API client with all methods implemented
        └── types.ts              # Complete TypeScript types for PO operations
```

### Pattern 1: Preview-Before-Execute (Confirmation Flow)

**What:** All write operations require `confirm=true` to execute; default behavior returns a preview
**When to use:** PO-03, PO-04, PO-05, VAR-01 - any mutation operation
**Example:**
```typescript
// From purchase-orders.ts - create_purchase_order
if (!params.confirm) {
  const preview = {
    preview: true,
    message: 'This is a preview. Set confirm=true to create the purchase order.',
    order: {
      vendor_id: params.vendor_id,
      warehouse_id: params.warehouse_id,
      type: params.type ?? 'purchase_order',
      items: params.items,
      itemCount: params.items.length,
      totalQuantity: params.items.reduce((sum, i) => sum + i.quantity, 0),
    },
  };
  return { content: [{ type: 'text', text: JSON.stringify(preview) }] };
}

// Actual execution when confirm=true
const po = await client.createPurchaseOrder({...});
```

### Pattern 2: API Client Methods for Mutations

**What:** Client has typed methods for all CRUD operations
**When to use:** All PO and variant mutation operations
**Example:**
```typescript
// From client.ts
async createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder>
async updatePurchaseOrder(id: string, payload: UpdatePurchaseOrderPayload): Promise<PurchaseOrder>
async updateReceivedQuantities(orderId: string, items: UpdateReceivedQuantityPayload[]): Promise<PurchaseOrderItem[]>
async updateVariant(id: string, payload: UpdateVariantPayload): Promise<Variant>
```

### Pattern 3: Test Helper Pattern (from Phase 2)

**What:** Reusable test helpers for MCP session management and tool invocation
**When to use:** All integration tests
**Example:**
```typescript
// Helper to call tool and return { result, isError }
async function callTool(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ result?: unknown; isError?: boolean; error?: unknown }>
```

### Anti-Patterns to Avoid
- **Using retryable errors in tests:** Use 401, 403, 404, 400 (non-retryable) to avoid retry delays
- **Mocking multiple responses for non-retried calls:** One mock per expected API call
- **Testing mutations without preview mode:** Always test both preview and confirm=true flows
- **Forgetting to reset client between tests:** Call `resetInventoryPlannerClient()` in beforeEach

## Tool-to-Requirement Mapping

Analysis of existing tools against Phase 3 requirements:

| Requirement | Existing Tool | Status | Gap |
|-------------|--------------|--------|-----|
| PO-01: List/filter POs | `get_purchase_orders` | **Implemented** | Needs tests |
| PO-02: View PO details | `get_purchase_order` | **Implemented** | Needs tests |
| PO-03: Create PO with preview | `create_purchase_order` | **Implemented** | Needs tests |
| PO-04: Update PO | `update_purchase_order` | **Implemented** | Needs tests |
| PO-05: Record received qty | `update_received_qty` | **Implemented** | Needs tests |
| VAR-01: Update planning params | `update_variant` | **Implemented** | Needs tests |

### Tool Parameter Verification

**get_purchase_orders parameters (already implemented):**
- `status` - Filter by status (draft, open, sent, partial, received, closed, cancelled)
- `type` - Filter by type (purchase_order, transfer, assembly)
- `vendor_id` - Filter by vendor
- `warehouse_id` - Filter by destination warehouse
- `expected_date_gt`, `expected_date_lt` - Date range filters
- `page`, `limit` - Pagination

**get_purchase_order parameters:**
- `id` - Purchase order ID (required)

**create_purchase_order parameters:**
- `vendor_id` - Vendor ID (required)
- `warehouse_id` - Destination warehouse ID (required)
- `items` - Array of { variant_id, quantity, cost? } (required, min 1)
- `type` - Order type (optional, defaults to purchase_order)
- `expected_date` - Expected delivery date (optional)
- `notes`, `reference` - Metadata (optional)
- `confirm` - Execute flag (default false = preview)

**update_purchase_order parameters:**
- `id` - Purchase order ID (required)
- `status` - New status (optional)
- `expected_date` - New expected date (optional)
- `notes`, `reference` - Updated metadata (optional)
- `confirm` - Execute flag (default false = preview)

**update_received_qty parameters:**
- `order_id` - Purchase order ID (required)
- `items` - Array of { id, received_quantity } (required, min 1)
- `confirm` - Execute flag (default false = preview)

**update_variant parameters:**
- `id` - Variant ID (required)
- `lead_time` - Lead time in days (optional)
- `review_period` - Review period in days (optional)
- `safety_stock` - Safety stock level (optional)
- `reorder_point` - Reorder point quantity (optional)
- `active` - Active status (optional)
- `confirm` - Execute flag (default false = preview)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PO CRUD operations | Custom API calls | Existing client methods | Already implemented with proper error handling |
| Preview mode logic | Custom preview handling | Existing pattern with confirm flag | Consistent UX across all write tools |
| Test helpers | New helper functions | Copy from variants.test.ts | Proven patterns, consistent approach |
| Error translation | Raw HTTP errors | handleToolError | LLM-friendly messages established in Phase 1 |

**Key insight:** All PO and mutation functionality is already implemented. The only work remaining is validation through integration tests.

## Common Pitfalls

### Pitfall 1: Testing Write Operations Without Mocking Response

**What goes wrong:** Tests call real API or fail due to missing mock
**Why it happens:** Write operations use POST/PATCH, need different mock setup
**How to avoid:**
- Mock both the API call and expected response
- Use appropriate HTTP method matching in mocks
**Warning signs:** Network errors, unexpected API calls in test logs

### Pitfall 2: Forgetting Preview Mode Tests

**What goes wrong:** Only test confirm=true, miss preview behavior
**Why it happens:** Focus on "happy path" execution
**How to avoid:**
- Test both preview mode (confirm=false/omitted) AND execution (confirm=true)
- Verify preview returns expected structure without API call
**Warning signs:** Incomplete test coverage, preview bugs discovered in production

### Pitfall 3: Testing Mutations with Retryable Errors

**What goes wrong:** Tests timeout waiting for retry backoff
**Why it happens:** Using 429 or 503 status codes that trigger retry
**How to avoid:**
- Use non-retryable errors for error tests: 401, 403, 404, 400
- These fail fast without retry delays
**Warning signs:** Slow tests, timeout failures

### Pitfall 4: Item Array Validation Edge Cases

**What goes wrong:** Empty items array passes validation but causes API error
**Why it happens:** Zod schema requires min(1) but test doesn't cover
**How to avoid:**
- Test with empty items array (should fail validation)
- Test with single item (minimum valid case)
- Test with multiple items (typical case)
**Warning signs:** Validation errors at API level instead of tool level

### Pitfall 5: Received Quantity Accumulation

**What goes wrong:** Testing received qty assumes replacement instead of update
**Why it happens:** Unclear whether API patches or replaces received quantities
**How to avoid:**
- API PATCH on items sets the received_quantity value
- Test both partial receipt and full receipt scenarios
**Warning signs:** Unexpected received quantities after multiple updates

## Code Examples

Verified patterns from the codebase:

### Test Setup Pattern (copy from variants.test.ts)

```typescript
// purchase-orders.test.ts
process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import request from 'supertest';
import { app, transports } from '../../app.js';
import { resetInventoryPlannerClient } from '../../services/inventory-planner/index.js';

const fetchMocker = createFetchMock(vi);
const MCP_ACCEPT_HEADER = 'application/json, text/event-stream';

// Copy parseSSEResponse, initializeSession, callTool helpers from variants.test.ts
```

### Mock API Response for PO List

```typescript
fetchMocker.mockResponseOnce(JSON.stringify({
  result: { status: 'success' },
  meta: { name: 'purchase-orders', total: 2, count: 2, limit: 50 },
  'purchase-orders': [
    {
      id: 'po-1',
      number: 'PO-2026-001',
      status: 'open',
      type: 'purchase_order',
      vendor_id: 'vendor-1',
      vendor_name: 'Acme Corp',
      warehouse_id: 'wh-1',
      warehouse_name: 'Main Warehouse',
      order_date: '2026-01-20',
      expected_date: '2026-02-01',
      total: 5000.00,
      currency: 'USD',
      items: [
        { id: 'item-1', variant_id: 'v1', sku: 'SKU-001', quantity: 100, cost: 50.00 },
      ],
    },
    {
      id: 'po-2',
      number: 'PO-2026-002',
      status: 'draft',
      type: 'purchase_order',
      vendor_id: 'vendor-2',
      vendor_name: 'Widget Co',
      warehouse_id: 'wh-1',
      warehouse_name: 'Main Warehouse',
      order_date: '2026-01-25',
      expected_date: '2026-02-10',
      total: 3000.00,
      currency: 'USD',
    },
  ],
}));
```

### Mock API Response for Single PO (with line items)

```typescript
fetchMocker.mockResponseOnce(JSON.stringify({
  result: { status: 'success' },
  'purchase-order': {
    id: 'po-1',
    number: 'PO-2026-001',
    status: 'open',
    type: 'purchase_order',
    vendor_id: 'vendor-1',
    vendor_name: 'Acme Corp',
    warehouse_id: 'wh-1',
    warehouse_name: 'Main Warehouse',
    order_date: '2026-01-20',
    expected_date: '2026-02-01',
    received_date: null,
    total: 5000.00,
    currency: 'USD',
    shipping_cost: 100.00,
    notes: 'Rush order',
    reference: 'REF-123',
    items: [
      { id: 'item-1', variant_id: 'v1', sku: 'SKU-001', title: 'Widget A', quantity: 50, received_quantity: 0, cost: 50.00, total: 2500.00 },
      { id: 'item-2', variant_id: 'v2', sku: 'SKU-002', title: 'Widget B', quantity: 50, received_quantity: 0, cost: 50.00, total: 2500.00 },
    ],
    created_at: '2026-01-20T10:00:00Z',
    updated_at: '2026-01-20T10:00:00Z',
  },
}));
```

### Testing Preview Mode (confirm=false)

```typescript
it('returns preview when confirm is false', async () => {
  // NO mock needed - preview mode doesn't call API
  const sessionId = await initializeSession();
  const { result, isError } = await callTool(sessionId, 'create_purchase_order', {
    vendor_id: 'vendor-1',
    warehouse_id: 'wh-1',
    items: [{ variant_id: 'v1', quantity: 100 }],
    confirm: false, // or omit - default is false
  });

  expect(isError).toBeFalsy();
  const data = result as Record<string, unknown>;
  expect(data.preview).toBe(true);
  expect(data.message).toContain('Set confirm=true');
  expect(data.order).toBeDefined();
  expect(data.order.itemCount).toBe(1);
  expect(data.order.totalQuantity).toBe(100);
});
```

### Testing Execution Mode (confirm=true)

```typescript
it('creates purchase order when confirm is true', async () => {
  // Mock API response for creation
  fetchMocker.mockResponseOnce(JSON.stringify({
    result: { status: 'success' },
    'purchase-order': {
      id: 'po-new',
      number: 'PO-2026-003',
      status: 'draft',
      vendor_name: 'Acme Corp',
      warehouse_name: 'Main Warehouse',
      total: 5000.00,
      items: [{ id: 'item-1', variant_id: 'v1', quantity: 100 }],
    },
  }));

  const sessionId = await initializeSession();
  const { result, isError } = await callTool(sessionId, 'create_purchase_order', {
    vendor_id: 'vendor-1',
    warehouse_id: 'wh-1',
    items: [{ variant_id: 'v1', quantity: 100, cost: 50.00 }],
    confirm: true,
  });

  expect(isError).toBeFalsy();
  const data = result as Record<string, unknown>;
  expect(data.success).toBe(true);
  expect(data.message).toContain('created successfully');
  expect(data.order.id).toBe('po-new');
  expect(data.order.number).toBe('PO-2026-003');

  // Verify API was called with correct payload
  const fetchCall = fetchMocker.mock.calls[0];
  expect(fetchCall[1].method).toBe('POST');
  const body = JSON.parse(fetchCall[1].body);
  expect(body.vendor_id).toBe('vendor-1');
  expect(body.items).toHaveLength(1);
});
```

### Testing Variant Mutation

```typescript
it('updates variant planning parameters when confirm is true', async () => {
  fetchMocker.mockResponseOnce(JSON.stringify({
    result: { status: 'success' },
    variant: {
      id: 'v1',
      sku: 'TEST-SKU-001',
      title: 'Test Product',
      lead_time: 10,
      review_period: 21,
      safety_stock: 25,
      reorder_point: 50,
      active: true,
    },
  }));

  const sessionId = await initializeSession();
  const { result, isError } = await callTool(sessionId, 'update_variant', {
    id: 'v1',
    lead_time: 10,
    review_period: 21,
    safety_stock: 25,
    confirm: true,
  });

  expect(isError).toBeFalsy();
  const data = result as Record<string, unknown>;
  expect(data.success).toBe(true);
  expect(data.variant.leadTime).toBe(10);
  expect(data.variant.reviewPeriod).toBe(21);
  expect(data.variant.safetyStock).toBe(25);
});
```

## API Endpoints Summary

Based on client.ts implementation:

| Endpoint | Method | Purpose | Tool |
|----------|--------|---------|------|
| `/api/v1/purchase-orders` | GET | List POs with filters | get_purchase_orders |
| `/api/v1/purchase-orders/{id}` | GET | Get single PO | get_purchase_order |
| `/api/v1/purchase-orders` | POST | Create PO | create_purchase_order |
| `/api/v1/purchase-orders/{id}` | PATCH | Update PO | update_purchase_order |
| `/api/v1/purchase-orders/{id}/items` | PATCH | Update received quantities | update_received_qty |
| `/api/v1/variants/{id}` | PATCH | Update variant | update_variant |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct mutations | Preview-before-execute | Best practice | User can review before committing |
| Implicit confirmation | Explicit confirm=true | Best practice | Prevents accidental mutations |
| Raw API errors | LLM-friendly messages | Phase 1 | Better user experience |

## Open Questions

None - all tools are implemented with clear patterns. Testing approach is established from Phase 2.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `mcp/inventory-planner/src/mcp/tools/purchase-orders.ts`
- Codebase analysis: `mcp/inventory-planner/src/mcp/tools/mutations.ts`
- Codebase analysis: `mcp/inventory-planner/src/services/inventory-planner/client.ts`
- Codebase analysis: `mcp/inventory-planner/src/services/inventory-planner/types.ts`
- Phase 2 test patterns: `variants.test.ts`, `reference.test.ts`

### Secondary (MEDIUM confidence)
- Phase 2 research document: `02-RESEARCH.md` - Established testing patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Established in Phase 1/2, no changes needed
- Tool implementation: HIGH - All tools exist with complete implementations
- Testing approach: HIGH - Proven patterns from Phase 2

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (stable technologies, low churn expected)

## Test Coverage Plan

Based on requirements, the following test suites are needed:

### purchase-orders.test.ts

**get_purchase_orders (PO-01):**
- Returns POs with status summary and pagination
- Filters by status parameter
- Filters by vendor_id parameter
- Filters by warehouse_id parameter
- Filters by expected_date_gt/lt (date range)
- Handles empty results
- Returns LLM-friendly error on auth failure

**get_purchase_order (PO-02):**
- Returns single PO with full details
- Returns vendor/warehouse objects
- Returns dates object
- Returns financial object
- Returns all line items with quantities
- Returns LLM-friendly error for not found (404)

**create_purchase_order (PO-03):**
- Returns preview when confirm is false/omitted
- Creates PO when confirm is true
- Validates required parameters (vendor_id, warehouse_id, items)
- Returns LLM-friendly error on API failure

**update_purchase_order (PO-04):**
- Returns preview when confirm is false
- Updates PO when confirm is true
- Updates status
- Updates expected_date
- Updates notes
- Returns LLM-friendly error for not found (404)

**update_received_qty (PO-05):**
- Returns preview when confirm is false
- Updates received quantities when confirm is true
- Handles partial receipt (some items)
- Returns LLM-friendly error on failure

### mutations.test.ts

**update_variant (VAR-01):**
- Returns preview when confirm is false
- Updates variant when confirm is true
- Updates lead_time parameter
- Updates review_period parameter
- Updates safety_stock parameter
- Updates reorder_point parameter
- Updates active status
- Returns LLM-friendly error for not found (404)
