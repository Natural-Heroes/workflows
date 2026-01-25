# Feature Landscape: Inventory Planner MCP Server

**Domain:** Stock Analytics and Purchase Order Management via MCP
**Researched:** 2026-01-25
**Confidence:** MEDIUM (based on existing codebase analysis; API docs unavailable for verification)

## Executive Summary

The Inventory Planner API provides extensive demand forecasting and replenishment metrics through the `/api/v1/variants` endpoint, with purchase order management via `/api/v1/purchase-orders`. The existing MCP server implementation covers core read operations and basic write operations. For the stated use case of stock analytics (stockouts, history, value), the API exposes metrics but **does not appear to provide historical stockout event data directly**. Historical analysis may require computing from variant snapshots or sales data.

## API Endpoint Coverage

| Endpoint | Method | Implemented | Purpose |
|----------|--------|-------------|---------|
| `/api/v1/variants` | GET | Yes | Core inventory metrics, forecasts |
| `/api/v1/variants/:id` | GET | Yes | Single variant details |
| `/api/v1/variants/:id` | PATCH | Yes | Update planning parameters |
| `/api/v1/purchase-orders` | GET | Yes | List purchase orders |
| `/api/v1/purchase-orders/:id` | GET | Yes | Single PO details |
| `/api/v1/purchase-orders` | POST | Yes | Create PO |
| `/api/v1/purchase-orders/:id` | PATCH | Yes | Update PO |
| `/api/v1/purchase-orders/:id/items` | GET | Yes | PO line items |
| `/api/v1/purchase-orders/:id/items` | PATCH | Yes | Update received quantities |

### Potentially Missing Endpoints (LOW confidence - needs verification)

| Endpoint | Expected Purpose | Notes |
|----------|------------------|-------|
| `/api/v1/warehouses` | List warehouses/locations | Needed for warehouse filtering context |
| `/api/v1/vendors` | List vendors/suppliers | Needed for vendor selection in PO creation |
| `/api/v1/sales` or `/api/v1/orders` | Historical sales data | May be needed for stockout duration analysis |

**CRITICAL GAP:** The project context mentions answering "How long was SKU X out of stock?" and "What's the value of stockouts this quarter?" The existing API implementation exposes:
- `oos` (days until stockout - **forward-looking**)
- `under_value` (forecasted lost revenue - **forward-looking**)

These are **predictions**, not historical data. Historical stockout analysis likely requires:
1. A dedicated history/events endpoint (needs verification)
2. Computing from sales data gaps
3. External data from the connected sales channel (Shopify, etc.)

---

## Table Stakes

Features users expect for stock analytics. Missing these makes the product feel incomplete.

| Feature | Status | API Support |
|---------|--------|-------------|
| **Current Stock Levels** | Done | `get_variants` returns `stock_on_hand`, `stock_available`, `stock_incoming` |
| **Stockout Risk Identification** | Done | `oos` (days until OOS) and `oos_lt` filter |
| **Replenishment Recommendations** | Done | `get_replenishment` tool filters `replenishment > 0` |
| **Purchase Order Creation** | Done | `create_purchase_order` with confirm flag |
| **Purchase Order Tracking** | Done | `get_purchase_orders`, `get_purchase_order` |
| **Vendor Filtering** | Done | `vendor_id` filter on variants and POs |
| **Warehouse Filtering** | Done | `warehouse_id` filter on variants and POs |
| **Inventory Value** | Done | `inventory_value` field on variants |
| **Lead Time Visibility** | Done | `lead_time` field on variants |
| **Demand Forecast** | Done | `forecast_daily`, `forecast_weekly`, `forecast_monthly` |

---

## Differentiators

Features that elevate the MCP server beyond basic inventory queries.

| Feature | Status | Notes |
|---------|--------|-------|
| **Historical Stockout Analysis** | Not Done | API may not expose historical events; needs research |
| **Stockout Value Calculation** | Not Done | `under_value` is forward-looking; historical needs sales data |
| **Vendor Analytics** | Not Done | Requires aggregating data across POs and deliveries |
| **ABC/XYZ Classification Display** | Partial | Fields exist (`abc_class`, `xyz_class`) but not prominently surfaced |
| **Overstock Identification** | Not Done | `over_value` field exists but no dedicated filter/tool |
| **Stock Transfer Support** | Partial | PO type 'transfer' supported but no dedicated tool |
| **Warehouse List Tool** | Not Done | Needed for LLM context when filtering |
| **Vendor List Tool** | Not Done | Needed for LLM context when creating POs |

### Use Case Gap Analysis

| User Question | Can Answer Today? | What's Missing |
|---------------|-------------------|----------------|
| "What items need reordering?" | YES | - |
| "Show me stock levels for SKU X" | YES | - |
| "What's the value of current inventory?" | YES | Sum `inventory_value` |
| "How long was SKU X out of stock?" | NO | Historical stockout events |
| "What's the value of stockouts this quarter?" | NO | Historical `under_value` snapshots or sales gaps |
| "Which vendor has the best lead times?" | PARTIAL | Need aggregation across variants |
| "Create a PO for vendor X with all items needing reorder" | YES (manual) | Tool exists but LLM must manually filter and build |
| "What SKUs are overstocked?" | NO | Need filter/tool for `over_value > 0` |

---

## Anti-Features

Features to deliberately NOT build.

| Anti-Feature | Why Problematic | Alternative |
|--------------|-----------------|-------------|
| **Delete Operations** | High risk of data loss; inventory deletion cascades | Read + Update only; delete via source system |
| **Direct Stock Adjustments** | Breaks audit trail; should go through source ERP/channel | Update planning params only; stock via source system |
| **Real-time Sales Streaming** | Overwhelming data volume; MCP not suited for streaming | Polling with caching; let source system handle real-time |
| **Complex Report Generation** | LLM context limits; better suited for BI tools | Return structured data; let client format |
| **Automatic PO Approval** | Financial risk; human should confirm orders | Preview mode default; require explicit confirm |

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Historical Stockout Events | HIGH | HIGH (unknown API) | P0 |
| Warehouse List | MEDIUM | LOW | P1 |
| Vendor List | MEDIUM | LOW | P1 |
| Overstock Identification | MEDIUM | LOW | P2 |
| Stockout Risk Tool | MEDIUM | LOW | P2 |
| Vendor Analytics | MEDIUM | MEDIUM | P3 |

---

## API Verification Needed

### Critical (Blocks Core Use Case)

1. **Historical stockout data:** Does the API expose:
   - `/api/v1/stockouts` or similar events endpoint?
   - `/api/v1/reports/stockouts` or analytics endpoint?
   - Historical snapshots of variant metrics?

2. **Sales/orders data:** Does the API expose:
   - `/api/v1/sales` or `/api/v1/orders`?
   - Data that could be used to infer stockout periods?

### Important (Improves UX)

3. **Reference data endpoints:**
   - `/api/v1/warehouses` - confirm exists
   - `/api/v1/vendors` - confirm exists

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Current API capabilities | MEDIUM | Based on codebase reverse-engineering |
| Existing tool coverage | HIGH | Direct code review |
| Historical stockout support | LOW | Not evident in code; needs API verification |
| Reference data endpoints | LOW | Assumed standard REST patterns; unverified |

---

*Feature research for: Inventory Planner MCP Server - Stock Analytics*
