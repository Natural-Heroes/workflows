---
phase: 02-stock-analytics-completion
plan: 02
subsystem: mcp-tools
tags: [mcp, reference-data, warehouses, vendors, inventory-planner]

dependency-graph:
  requires: [01-foundation-validation]
  provides: [list_warehouses, list_vendors]
  affects: [03-production-readiness]

tech-stack:
  added: []
  patterns: [reference-extraction-from-variants]

file-tracking:
  key-files:
    created:
      - mcp/inventory-planner/src/mcp/tools/reference.ts
      - mcp/inventory-planner/src/mcp/tools/reference.test.ts
    modified:
      - mcp/inventory-planner/src/mcp/tools/index.ts

decisions:
  - id: REF-01
    choice: Extract warehouses from variant data
    reason: Inventory Planner API has no dedicated warehouse endpoint
  - id: REF-02
    choice: Extract vendors from both vendor_id/vendor_name and vendors array
    reason: Variants can have multiple vendors; both sources must be checked

metrics:
  duration: 4 min
  completed: 2026-01-25
---

# Phase 2 Plan 2: Reference Data Tools Summary

**One-liner:** list_warehouses and list_vendors tools extract unique reference data from variant responses using Map deduplication

## What Was Done

### Task 1: Create reference.ts with list_warehouses and list_vendors tools
- Created `reference.ts` with two MCP tools for extracting reference data
- `list_warehouses`: Fetches variants with warehouse fields, extracts unique warehouses using Map keyed by ID
- `list_vendors`: Fetches variants with vendor fields, extracts from both `vendor_id/vendor_name` and `vendors` array
- Both tools return LLM-friendly JSON with summary count and helpful notes
- Uses `handleToolError` for consistent error translation
- Commit: `70e1e66`

### Task 2: Register reference tools in index.ts
- Added import for `registerReferenceTools`
- Updated `INSTRUCTIONS_RESOURCE` with Reference Data section listing both tools
- Added reference tools to `createMcpServer()` comment block
- Called `registerReferenceTools(server, client)` in registration sequence
- Commit: `8369946`

### Task 3: Create reference.test.ts with comprehensive tests
- Created 17 integration tests covering both tools
- Tests for warehouse extraction, deduplication, limits, and errors
- Tests for vendor extraction from both field types
- Tests verifying API request parameters (fields filtering)
- Used non-retryable errors (401, 404) to avoid retry delays in error tests
- Commit: `0b96aa5`

## Requirements Verified

| Requirement | Status | Verification |
|-------------|--------|--------------|
| REF-01: list_warehouses extracts unique warehouses | Pass | 7 tests covering extraction, deduplication, limits |
| REF-02: list_vendors extracts unique vendors | Pass | 10 tests covering extraction from both sources |
| LLM-friendly summary with count | Pass | Tests verify summary format |
| Error handling | Pass | Tests verify error translation |

## Test Results

```
Test Files  8 passed (8)
     Tests  120 passed (120)

Reference tests: 17 passed (17)
- list_warehouses: 7 tests
- list_vendors: 8 tests
- API verification: 2 tests
```

## Key Implementation Details

**Reference extraction pattern:**
```typescript
// Fetch variants with minimal fields
const response = await client.getVariants({
  fields: 'warehouse_id,warehouse_name',
  limit: 1000,
});

// Deduplicate using Map
const warehouseMap = new Map<string, string>();
for (const v of response.data) {
  if (v.warehouse_id && v.warehouse_name) {
    warehouseMap.set(v.warehouse_id, v.warehouse_name);
  }
}
```

**Vendor extraction handles both sources:**
- Primary vendor from `vendor_id` / `vendor_name` fields
- Additional vendors from `vendors` array (variants can have multiple vendors)

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `mcp/inventory-planner/src/mcp/tools/reference.ts` | Created | 148 |
| `mcp/inventory-planner/src/mcp/tools/reference.test.ts` | Created | 543 |
| `mcp/inventory-planner/src/mcp/tools/index.ts` | Modified | +8 |

## Next Phase Readiness

**Blockers:** None

**Ready for:** Phase 3 - Production Readiness (deployment, monitoring)

## Commits

- `70e1e66`: feat(nat-58): add list_warehouses and list_vendors reference tools
- `8369946`: feat(nat-58): register reference tools in MCP server
- `0b96aa5`: test(nat-58): add integration tests for reference data tools
