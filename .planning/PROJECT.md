# MRPeasy MCP Server

## What This Is

Custom MCP (Model Context Protocol) server for MRPeasy that enables AI assistants (Claude, Cursor, etc.) to interact with manufacturing data directly through the MRPeasy REST API. Deployed as a streamable HTTP endpoint following the task 304 architecture pattern.

## Core Value

Direct, real-time access to manufacturing data for AI assistants without external dependencies like Zapier.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] MCP HTTP server following task 304 deployment pattern
- [ ] MRPeasy API client with Basic Auth (API key/secret from env vars)
- [ ] Client-side rate limiting (1 concurrent request, max 100/10s)
- [ ] Error handling for 429 (Too Many Requests) and 503 (Maintenance)
- [ ] Pagination support for list endpoints
- [ ] Read tool: get_inventory (fetch stock levels and costs)
- [ ] Read tool: get_customer_orders (list and filter customer orders)
- [ ] Read tool: get_manufacturing_orders (view production orders and status)
- [ ] Read tool: get_product (get product details including BOM)
- [ ] Read tool: search_items (search products by name/SKU)

### Out of Scope

- Phase 2 write operations (create_customer_order, update_order_status, update_inventory) — deferring until Phase 1 is validated
- Caching (inventory/product data) — start without it, add if rate limits become problematic
- Webhook integration for order/shipment status changes — future consideration
- Python implementation — using TypeScript only

## Context

**MRPeasy API:**
- Available on Unlimited pricing plan
- Base URL: https://api.mrpeasy.com/rest/v1/
- Authentication: Basic Auth with API key and secret
- Rate limits: 1 request at a time, max 100 requests per 10 seconds
- Endpoints: Items/Products, Customer Orders, Manufacturing Orders, Purchase Orders, Stock/Inventory, BOMs, Vendors (read-only), Shipments, Reports, Users/Actions

**No existing open-source solution:**
- Only option is Zapier's MRPeasy MCP, which requires Zapier account and uses 2 tasks per tool call
- Building custom server provides direct API access without external dependencies

**Deployment architecture:**
- Follow same pattern as task 304 (Deploy MCP Server HTTP to Dokploy)
- Streamable HTTP endpoint deployed to same Dokploy environment
- TypeScript implementation using MCP TypeScript SDK

## Constraints

- **Language**: TypeScript — using MCP TypeScript SDK
- **Deployment**: HTTP endpoint on Dokploy (same setup as task 304)
- **Rate Limiting**: 1 concurrent request, max 100 requests per 10 seconds
- **Authentication**: Basic Auth with API key/secret stored in environment variables
- **API Access**: Requires MRPeasy Unlimited plan

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python | Aligns with most MCP examples and task 304 pattern | — Pending |
| Phase 1 only (read operations) | Validate read tools with usage before adding write capabilities | — Pending |
| No caching initially | Keep implementation simple, add caching if rate limits become problematic | — Pending |
| Follow task 304 deployment pattern | Consistency across MCP servers, reuse deployment infrastructure | — Pending |
| All 5 read tools at once | Implement complete read API surface area for maximum utility | — Pending |

---
*Last updated: 2026-01-19 after initialization*
