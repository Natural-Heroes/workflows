---
phase: 03
plan: 01
subsystem: purchase-orders-testing
tags: [mcp, purchase-orders, integration-tests, vitest]

dependency-graph:
  requires: [02-01, 02-02]
  provides: [purchase-order-tool-tests]
  affects: [03-02]

tech-stack:
  added: []
  patterns: [preview-confirm-testing, mcp-tool-integration-tests]

key-files:
  created:
    - mcp/inventory-planner/src/mcp/tools/purchase-orders.test.ts
  modified: []

decisions:
  - id: PO-MOCK-FORMAT
    choice: "Use hyphenated API response keys (purchase-orders, purchase-order) matching actual API"
    reason: "Inventory Planner API returns hyphenated keys, not snake_case"
    alternatives: ["Use snake_case mocks (incorrect)", "Create response adapters"]

metrics:
  duration: 3 min
  completed: 2026-01-25
---

# Phase 3 Plan 01: Purchase Order Tools Integration Tests Summary

Comprehensive integration tests validating all 5 purchase order MCP tools.

## One-liner

30 integration tests for PO tools covering list, detail, create, update, and receive-qty with preview/confirm patterns.

## What Changed

### Test Coverage Added

Created `purchase-orders.test.ts` with 30 tests covering all PO requirements:

**get_purchase_orders (PO-01)** - 8 tests:
- Returns paginated list with status summary and total value
- Filters by status, vendor_id, warehouse_id
- Filters by date range (expected_date_gt, expected_date_lt)
- Filters by type (purchase_order, transfer, assembly)
- Returns empty result message when no orders match
- Handles API auth errors (401)

**get_purchase_order (PO-02)** - 6 tests:
- Returns full order details with line items
- Includes vendor/warehouse info
- Includes dates (order, expected, received)
- Includes financial data (total, currency, shipping)
- Returns items with ordered and received quantities
- Handles not found errors (404)

**create_purchase_order (PO-03)** - 5 tests:
- Preview mode returns preview object without API call
- Preview shows itemCount and totalQuantity
- Confirm mode creates order and returns success
- Confirm order includes vendor_id, warehouse_id, items
- Handles API errors on creation

**update_purchase_order (PO-04)** - 6 tests:
- Preview mode returns preview of changes without API call
- Confirm mode updates order and returns success
- Can update status
- Can update expected_date
- Can update notes and reference
- Handles not found errors (404)

**update_received_qty (PO-05)** - 5 tests:
- Preview mode returns preview without API call
- Confirm mode updates received quantities
- Returns updated items with ordered vs received
- Handles order not found errors
- Handles item not found errors

### Test Patterns Applied

- **Preview/Confirm Testing**: For write operations, tests verify preview mode does NOT make API calls and confirm mode DOES
- **Mock Response Format**: Uses hyphenated keys (`'purchase-orders'`, `'purchase-order'`) matching actual API
- **Non-retryable Errors**: Uses 401, 403, 404, 400 status codes to avoid retry delays in tests
- **SSE Response Parsing**: Same parseSSEResponse helper used across all MCP tool tests

## Verification Results

```
Test Files  11 passed
Tests       188 passed
Duration    1.43s
```

Test count increased from 146 to 188 (+42 new tests, includes 12 from mutations.test.ts in prior session).

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mock response format | Use hyphenated keys (`'purchase-orders'`) | Matches actual Inventory Planner API response structure |
| Error codes for tests | Use non-retryable (401, 403, 404, 400) | Avoids retry delays that slow down tests |
| Preview verification | Assert fetchMocker.mock.calls.length === 0 | Confirms preview mode skips API entirely |

## Deviations from Plan

None - plan executed exactly as written.

## Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Purchase Order Tests | `mcp/inventory-planner/src/mcp/tools/purchase-orders.test.ts` | Integration tests for all 5 PO tools |

## Commit

- `71c033c`: test(nat-58): add integration tests for purchase order tools

## Next Phase Readiness

Phase 3 testing complete. All PO tools (PO-01 through PO-05) are validated:
- Read operations: get_purchase_orders, get_purchase_order
- Write operations: create_purchase_order, update_purchase_order, update_received_qty

Ready for any final documentation or deployment phase.
