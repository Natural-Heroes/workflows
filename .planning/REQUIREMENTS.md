# Requirements: Inventory Planner MCP Server

**Version:** 1.0
**Created:** 2026-01-25
**Core Value:** LLM can answer questions about stock history (stockouts, duration, value) by querying Inventory Planner data

---

## v1 Requirements

### Stock Analytics — READ-01 to READ-05

- [x] **READ-01**: User can query current stock levels for any variant by SKU or filters
- [x] **READ-02**: User can identify items at stockout risk (oos < X days)
- [x] **READ-03**: User can get replenishment recommendations with quantities and urgency
- [x] **READ-04**: User can view inventory value by variant, vendor, or warehouse
- [x] **READ-05**: User can view demand forecasts (daily, weekly, monthly)

### Purchase Order Management — PO-01 to PO-05

- [x] **PO-01**: User can list purchase orders with filters (status, vendor, date range)
- [x] **PO-02**: User can view full purchase order details with line items
- [x] **PO-03**: User can create purchase order with preview before execution
- [x] **PO-04**: User can update purchase order (status, dates, notes)
- [x] **PO-05**: User can record received quantities on PO items

### Reference Data — REF-01 to REF-02

- [x] **REF-01**: User can list available warehouses for filtering context
- [x] **REF-02**: User can list available vendors for PO creation context

### Variant Management — VAR-01

- [x] **VAR-01**: User can update planning parameters (lead time, review period, safety stock)

### Infrastructure — INFRA-01 to INFRA-04

- [x] **INFRA-01**: Server validates environment variables at startup (fail-fast)
- [x] **INFRA-02**: Server implements resilience stack (rate limiter, circuit breaker, retry, queue)
- [x] **INFRA-03**: Server translates API errors to LLM-friendly messages with suggestions
- [x] **INFRA-04**: Server supports session-based MCP protocol over HTTP

---

## v2 Requirements (Deferred)

### Historical Analytics — HIST-01 to HIST-03

*Note: These require API verification. May not be achievable with current Inventory Planner API.*

- [ ] **HIST-01**: User can query how long a specific SKU was out of stock in a date range
- [ ] **HIST-02**: User can calculate total value of stockouts for a period
- [ ] **HIST-03**: User can view historical stock movement trends

### Advanced Features

- [ ] **ADV-01**: Smart reorder grouping — automatically group replenishment items by vendor
- [ ] **ADV-02**: Vendor validation — verify vendor exists and supplies items before PO creation
- [ ] **ADV-03**: Overstock identification — find items with excess inventory
- [ ] **ADV-04**: Multi-warehouse aggregation — cross-warehouse inventory views

---

## Out of Scope

- **Delete operations** — High risk of data loss; delete via source system only
- **Direct stock adjustments** — Breaks audit trail; stock changes via source ERP/channel
- **Real-time sales streaming** — MCP not suited for streaming; use source system
- **Complex report generation** — Return structured data; let client format reports
- **Automatic PO approval** — Financial risk; require explicit user confirmation
- **Multi-tenant support** — One MCP server per account

---

## Requirement Traceability

*Updated: 2026-01-25 (roadmap creation)*

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| READ-01 | Phase 2 | Complete |
| READ-02 | Phase 2 | Complete |
| READ-03 | Phase 2 | Complete |
| READ-04 | Phase 2 | Complete |
| READ-05 | Phase 2 | Complete |
| REF-01 | Phase 2 | Complete |
| REF-02 | Phase 2 | Complete |
| PO-01 | Phase 3 | Complete |
| PO-02 | Phase 3 | Complete |
| PO-03 | Phase 3 | Complete |
| PO-04 | Phase 3 | Complete |
| PO-05 | Phase 3 | Complete |
| VAR-01 | Phase 3 | Complete |

---

*17 v1 requirements across 5 categories*
*3 v2 requirements (historical analytics — pending API verification)*
*6 explicit out-of-scope items*
