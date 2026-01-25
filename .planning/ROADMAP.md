# Roadmap: Inventory Planner MCP Server

## Overview

This roadmap delivers a production-ready MCP server exposing Inventory Planner data to LLMs for stock analytics and purchase order management. The codebase is approximately 85% complete with infrastructure and many tools already implemented. The remaining work focuses on validation, completing tool coverage, and ensuring production readiness. Historical stockout analytics (HIST-*) are deferred to v2 pending API verification.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (1.1, 1.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation Validation** - Verify infrastructure and validate existing implementations
- [ ] **Phase 2: Stock Analytics Completion** - Complete read-only tools for inventory queries
- [ ] **Phase 3: Purchase Order & Mutations** - Complete write tools for PO management and variant updates

## Phase Details

### Phase 1: Foundation Validation
**Goal**: Confirm existing infrastructure is production-ready and identify any gaps
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Server starts successfully with valid environment variables and fails fast with clear error on missing/invalid config
  2. API requests flow through resilience stack (rate limiter, circuit breaker, retry, queue) and handle failures gracefully
  3. API errors return LLM-friendly messages with actionable suggestions (not raw HTTP errors)
  4. MCP client can establish session, invoke tools, and maintain connection across multiple requests
**Plans**: TBD

Plans:
- [ ] 01-01: Validate infrastructure and close gaps

### Phase 2: Stock Analytics Completion
**Goal**: User can query all stock-related data through natural language
**Depends on**: Phase 1
**Requirements**: READ-01, READ-02, READ-03, READ-04, READ-05, REF-01, REF-02
**Success Criteria** (what must be TRUE):
  1. User can query current stock levels for variants by SKU or filters (stock on hand, available, incoming)
  2. User can identify items at stockout risk by specifying days-until-OOS threshold
  3. User can get replenishment recommendations with quantities, vendors, and urgency indicators
  4. User can view inventory value breakdowns (by variant, vendor, or warehouse)
  5. User can list warehouses and vendors to understand available filtering options
**Plans**: TBD

Plans:
- [ ] 02-01: Complete stock analytics and reference data tools

### Phase 3: Purchase Order & Mutations
**Goal**: User can manage purchase orders and update planning parameters through natural language
**Depends on**: Phase 2
**Requirements**: PO-01, PO-02, PO-03, PO-04, PO-05, VAR-01
**Success Criteria** (what must be TRUE):
  1. User can list and filter purchase orders by status, vendor, and date range
  2. User can view complete purchase order details including all line items
  3. User can create purchase orders with preview-before-execute confirmation flow
  4. User can update purchase order status, dates, and notes
  5. User can update variant planning parameters (lead time, review period, safety stock)
**Plans**: TBD

Plans:
- [ ] 03-01: Complete purchase order and variant mutation tools

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation Validation | 0/1 | Not started | - |
| 2. Stock Analytics Completion | 0/1 | Not started | - |
| 3. Purchase Order & Mutations | 0/1 | Not started | - |
