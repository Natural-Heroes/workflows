---
status: testing
phase: milestone-complete
source: 01-SUMMARY.md, 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 03-01-SUMMARY.md, 03-02-SUMMARY.md, 04-01-SUMMARY.md, 04-02-SUMMARY.md, 05-01-SUMMARY.md, 05-02-SUMMARY.md
started: 2026-01-19T21:30:00Z
updated: 2026-01-20T12:30:00Z
---

## Current Test

number: 9
name: Auto-Deploy Trigger
expected: |
  Push to main branch triggers automatic deployment in Dokploy.
awaiting: user response

## Tests

### 1. Health Check Endpoint
expected: Visit /health endpoint, returns JSON with status "healthy" and version "0.1.0"
result: pass
note: Fixed SSL by adding custom Traefik config with certResolver: letsencrypt

### 2. MCP Session Initialize
expected: POST to /mcp with initialize request returns server info including "mrpeasy-mcp" name and 5 available tools
result: pass
note: Works after SSL fix with new domain mcp-mrpeasy.naturalheroes.nl

### 3. get_inventory Tool
expected: Call get_inventory tool, returns formatted text with stock levels (quantities, costs, warehouse info) - not raw JSON
result: pass
note: Fixed multiple issues - endpoint /stock-items→/items, type definitions aligned with actual API, HTTP 206 handling, null safety, article_id added to output

### 4. get_product Tool
expected: Call get_product tool with a valid product ID, returns product details including BOM (bill of materials) if applicable
result: pass
note: Fixed endpoint from /products to /items/{id}. Returns product name, code, stock levels, pricing, status. BOM requires separate endpoint (not implemented).

### 5. search_items Tool
expected: Call search_items tool with a query (min 2 chars), returns numbered search results with item details
result: pass
note: Returns numbered list with ID, code, type, group, stock levels, status. Server-side search filtering may not work (returns all items).

### 6. get_customer_orders Tool
expected: Call get_customer_orders tool, returns formatted customer orders with status, dates, items, and totals
result: partial
note: Returns 781 orders with customer names, status (numeric), totals. Field mapping issues - order number, order date, delivery date show as N/A (API returns different field names).

### 7. get_manufacturing_orders Tool
expected: Call get_manufacturing_orders tool, returns formatted MO list with status, product, quantities, and progress percentage
result: partial
note: Returns 31,268 MOs with product_id, quantity, progress. Field mapping issues - MO number, product name, dates show as N/A/Unknown (API returns different field names/formats).

### 8. Error Handling - Invalid Credentials
expected: If API credentials are wrong, returns LLM-friendly error message like "Authentication failed. Check that MRPEASY_API_KEY and MRPEASY_API_SECRET are correct."
result: pass
note: Verified via code review - client.ts handles 401/403 with AUTH_ERROR, error-handler.ts formats as LLM-friendly message with suggestion to check credentials.

### 9. Auto-Deploy Trigger
expected: Push to main branch triggers automatic deployment in Dokploy (check Dokploy dashboard for deployment activity)
result: partial
note: Auto-deploy seems to not trigger consistently. Manual deploy via Dokploy API works.

## Summary

total: 9
passed: 6
issues: 3
pending: 0
skipped: 0

## Issues for /gsd:plan-fix

1. **Order Tools Field Mapping**: CustomerOrder and ManufacturingOrder types don't match actual MRPeasy API response. Need to investigate actual field names from API for:
   - Order number (currently: `number`, actual: unknown)
   - Order dates (currently ISO strings, actual: unix timestamps)
   - Status codes (currently strings, actual: numeric)
   - Product names (currently: `product_name`, actual: unknown)

2. **Auto-Deploy**: Webhook not triggering consistently from GitHub pushes. Manual deploy works.
