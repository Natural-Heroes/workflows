---
status: testing
phase: milestone-complete
source: 01-SUMMARY.md, 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 03-01-SUMMARY.md, 03-02-SUMMARY.md, 04-01-SUMMARY.md, 04-02-SUMMARY.md, 05-01-SUMMARY.md, 05-02-SUMMARY.md
started: 2026-01-19T21:30:00Z
updated: 2026-01-19T21:30:00Z
---

## Current Test

number: 3
name: get_inventory Tool
expected: |
  Call get_inventory tool in Raycast/Claude Desktop.
  Should return formatted text with stock levels (quantities, costs, warehouse info) - not raw JSON.
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
result: [pending]

### 4. get_product Tool
expected: Call get_product tool with a valid product ID, returns product details including BOM (bill of materials) if applicable
result: [pending]

### 5. search_items Tool
expected: Call search_items tool with a query (min 2 chars), returns numbered search results with item details
result: [pending]

### 6. get_customer_orders Tool
expected: Call get_customer_orders tool, returns formatted customer orders with status, dates, items, and totals
result: [pending]

### 7. get_manufacturing_orders Tool
expected: Call get_manufacturing_orders tool, returns formatted MO list with status, product, quantities, and progress percentage
result: [pending]

### 8. Error Handling - Invalid Credentials
expected: If API credentials are wrong, returns LLM-friendly error message like "Authentication failed. Check that MRPEASY_API_KEY and MRPEASY_API_SECRET are correct."
result: [pending]

### 9. Auto-Deploy Trigger
expected: Push to main branch triggers automatic deployment in Dokploy (check Dokploy dashboard for deployment activity)
result: [pending]

## Summary

total: 9
passed: 2
issues: 0
pending: 7
skipped: 0

## Issues for /gsd:plan-fix

[none - SSL issues resolved by adding custom Traefik config]
