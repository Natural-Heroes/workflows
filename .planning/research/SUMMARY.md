# Project Research Summary

**Project:** Inventory Planner MCP Server
**Domain:** Stock Analytics and Purchase Order Management via MCP Protocol
**Researched:** 2026-01-25
**Confidence:** MEDIUM-HIGH

## Executive Summary

The Inventory Planner MCP server is a subsequent milestone adding to an existing MCP server codebase with established patterns from MRPeasy integration. The codebase is approximately 85% complete with core infrastructure, resilience stack, and tool implementations already in place. The API exposes extensive demand forecasting and replenishment metrics through `/api/v1/variants` and purchase order management via `/api/v1/purchase-orders`. Research reveals the implementation follows best practices with layered architecture, proper error handling, and preview mode for mutations.

The critical finding is a potential data gap for the core use case: answering historical stockout questions like "How long was SKU X out of stock?" The existing API exposes forward-looking predictions (`oos`, `under_value`) but historical stockout event data has not been verified. This gap could block a primary user requirement and needs immediate validation.

The recommended path forward is to complete testing and documentation for existing tools while simultaneously verifying historical data capabilities. If historical endpoints exist, add corresponding tools in Phase 3. If not, document limitations explicitly and explore alternative data sources (sales data, external channel APIs, or time-series snapshots).

## Key Findings

### Recommended Stack

The technology stack is already established and complete. No additional dependencies are needed. The server uses TypeScript (^5.7.3) with Node.js (>=18.0.0) for type safety and native fetch support, Express (^4.21.0) for HTTP transport, and the official MCP SDK (@modelcontextprotocol/sdk ^1.15.0). Zod (^3.25.0) provides runtime schema validation for tool parameters with LLM-friendly descriptions.

**Core technologies:**
- **TypeScript + Node.js**: Type-safe development with native fetch, no additional HTTP client libraries needed
- **MCP SDK**: Official protocol implementation with StreamableHTTPServerTransport for HTTP-based tool invocation
- **Zod**: Runtime validation with `.describe()` for LLM parameter guidance
- **Express**: Standard HTTP server pattern matching established MRPeasy implementation
- **Custom resilience stack**: Queue (1 concurrent) -> Circuit Breaker -> Retry -> Rate Limiter composition provides production-grade reliability

**Authentication specifics:**
- Direct API key header (not Base64 encoded like MRPeasy)
- Separate Account ID header unique to Inventory Planner
- Conservative rate limiting (30 tokens, 3/sec refill) pending production validation

### Expected Features

The API provides comprehensive inventory planning capabilities with most table stakes features already implemented. The server covers current stock levels, stockout risk identification, replenishment recommendations, and full purchase order lifecycle management. Differentiating features like historical stockout analysis and vendor analytics are identified but not yet verified.

**Must have (table stakes):**
- Current stock levels (`stock_on_hand`, `stock_available`, `stock_incoming`) — Done
- Stockout risk identification (`oos` field, `oos_lt` filter) — Done
- Replenishment recommendations (`replenishment > 0` filter) — Done
- Purchase order creation with preview mode — Done
- PO tracking and receiving workflow — Done
- Vendor and warehouse filtering — Done
- Inventory value and demand forecasts — Done

**Should have (competitive):**
- Historical stockout event data — **NOT VERIFIED**, critical gap for core use case
- Stockout value calculation (historical) — Requires historical data or sales API
- Vendor performance analytics — Aggregation logic needed
- Overstock identification tools — `over_value` field exists but no dedicated tool
- ABC/XYZ classification surfacing — Fields exist, not prominently exposed

**Defer (v2+):**
- Delete operations (high risk, breaks audit trail)
- Direct stock adjustments (should go through source system)
- Real-time sales streaming (overwhelming, not suited for MCP)
- Complex report generation (better in BI tools)
- Automatic PO approval (financial risk, needs human confirmation)

### Architecture Approach

The implementation follows a layered architecture with clear separation between HTTP transport, MCP server, tool handlers, API client, and resilience mechanisms. Tools are organized by domain (variants, purchase-orders, mutations) with each group registered via dedicated functions. All write operations use preview mode by default (confirm: false) to prevent accidental mutations. The resilience stack composes four protection layers without tight coupling: request queue enforces single concurrency, circuit breaker trips only on 5xx errors, retry handles transient failures with exponential backoff, and rate limiter respects API limits.

**Major components:**
1. **HTTP Server + MCP Transport** — Express with StreamableHTTPServerTransport handles client requests and MCP protocol serialization
2. **Tool Registry** — Domain-grouped registrars (variants, PO, mutations) with Zod schema validation and LLM-friendly descriptions
3. **API Client + Resilience Stack** — Single client class orchestrates all API methods through layered protection (Queue → CB → Retry → RL → fetch)
4. **Error Handling** — Centralized error translation converts API errors to MCP-formatted responses with user messages and suggested actions
5. **Environment Validation** — Zod-validated env vars (INVENTORY_PLANNER_API_KEY, INVENTORY_PLANNER_ACCOUNT_ID) with startup-time validation

**Key patterns from MRPeasy reference:**
- Tool registration with `.describe()` on every Zod field
- Preview mode for all mutations (return payload preview unless confirm=true)
- Circuit breaker trips only on 5xx, not 4xx
- Header-based auth (adapted from MRPeasy Basic Auth pattern)
- Pagination with meta object (adapted from MRPeasy Content-Range pattern)

### Critical Pitfalls

Research identified five critical pitfalls that could cause rewrites or block core functionality:

1. **Undocumented rate limits** — Inventory Planner doesn't publish rate limit documentation. Current conservative settings (30 tokens, 3/sec) may be too slow or too aggressive. Need telemetry, configurable limits via env vars, and adaptive adjustment based on 429 responses.

2. **Forecast data staleness not communicated** — LLMs may treat point-in-time forecasts (`forecast_daily`, `velocity_daily`) as real-time values. Should include `updated_at` timestamps, add freshness warnings in tool descriptions, and document which metrics are current vs. stale.

3. **Stockout history data gaps** — Core use case "How long was SKU X out of stock?" cannot be answered with forward-looking `oos` predictions. API may lack historical stockout events endpoint. Needs immediate verification; if missing, document limitation and explore alternatives.

4. **Purchase order creation without vendor validation** — Tools accept any `vendor_id` without checking vendor exists or matches item associations. Add pre-creation validation, warn in preview mode, verify vendor/item relationships.

5. **Large dataset token overflow** — API supports up to 1000 items per page. JSON responses can exceed LLM context limits. Implement token estimation (1 token per 4 chars), cap response size, reduce default limit, return summaries for large datasets.

## Implications for Roadmap

Based on research, the codebase is 85% complete. The remaining work focuses on validation, testing, documentation, and potentially adding historical analytics capabilities.

### Phase 1: API Capability Validation
**Rationale:** Critical data gap must be resolved before planning additional tools. The core use case depends on historical stockout data availability.
**Delivers:** Verified API capabilities, documented limitations, alternative data source recommendations if needed
**Addresses:** Pitfall #3 (stockout history gaps), Feature verification (historical analytics)
**Avoids:** Building tools that can't deliver on user requirements

### Phase 2: Resilience and Observability
**Rationale:** Production readiness requires tunable rate limits, telemetry, and monitoring. Current conservative settings need validation and adjustment.
**Delivers:** Configurable rate limits (env vars), telemetry for 429 tracking, circuit breaker tuning, adaptive rate limiting
**Addresses:** Pitfall #1 (undocumented rate limits), Pitfall #10 (circuit breaker sensitivity)
**Uses:** Existing resilience stack (rate-limiter.ts, circuit-breaker.ts)
**Implements:** Monitoring and configuration layer on existing infrastructure

### Phase 3: Tool Enhancements
**Rationale:** Existing tools work but need polish for production use. Address data freshness, pagination guidance, and response size limits.
**Delivers:** Timestamp inclusion, pagination guidance for LLMs, token budget enforcement, vendor validation in write tools
**Addresses:** Pitfall #2 (forecast staleness), Pitfall #5 (token overflow), Pitfall #4 (vendor validation)
**Implements:** Tool response formatters, validation layer in write tools

### Phase 4: Historical Analytics (Conditional)
**Rationale:** If Phase 1 confirms historical data availability, build tools to answer stockout duration and value questions. If not, document workarounds.
**Delivers:** Historical stockout tools OR documented limitations with alternative approaches
**Addresses:** Core use case ("How long was SKU X out of stock?"), differentiator features
**Depends on:** Phase 1 validation results

### Phase 5: Testing and Documentation
**Rationale:** No tests currently exist. Production deployment requires comprehensive test coverage and operational documentation.
**Delivers:** Unit tests (tool handlers, client methods), integration tests (API mocking), documentation (deployment, configuration, troubleshooting)
**Addresses:** Current gap (0% test coverage), operational readiness
**Implements:** Test suite following existing MRPeasy patterns

### Phase Ordering Rationale

- **Phase 1 first** because historical data availability determines whether core use case is achievable. Building additional tools without this knowledge risks wasted effort.
- **Phase 2 before Phase 3** because resilience tuning affects all tools and should be stable before polishing individual tool responses.
- **Phase 3 before Phase 4** because enhancements improve existing tools that will inform historical tool design.
- **Phase 4 conditional** on Phase 1 findings avoids committing to undeliverable features.
- **Phase 5 throughout** as tests should be written alongside enhancements, not as afterthought.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Requires Inventory Planner API documentation deep dive or support contact for historical endpoints
- **Phase 4:** If historical data exists, research proper time-series query patterns and performance implications

Phases with standard patterns (skip research-phase):
- **Phase 2:** Standard observability patterns, telemetry libraries well documented
- **Phase 3:** Tool formatting patterns established in MRPeasy reference implementation
- **Phase 5:** Testing patterns standard across TypeScript/Node.js ecosystem

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified from existing package.json and implementation files |
| Features (current API) | MEDIUM | Based on codebase reverse-engineering; API docs unavailable for direct verification |
| Features (historical) | LOW | Historical stockout endpoints not evident in code; needs API documentation |
| Architecture | HIGH | Complete implementation analyzed, patterns verified against MRPeasy reference |
| Pitfalls | MEDIUM | Based on domain knowledge and code analysis; production behavior needs validation |

**Overall confidence:** MEDIUM-HIGH

Implementation is solid and follows best practices. Uncertainty centers on API capabilities for historical data and actual rate limit values.

### Gaps to Address

Research identified gaps requiring attention during planning and execution:

- **Historical data API verification:** Cannot confirm whether Inventory Planner exposes historical stockout events, sales data, or time-series snapshots. Needs documentation review or API support contact during Phase 1.

- **Reference data endpoints:** Assumed standard `/api/v1/warehouses` and `/api/v1/vendors` endpoints exist but not verified. Need for Phase 3 vendor validation.

- **Rate limit actual values:** Conservative defaults (30 capacity, 3/sec refill) are guesses pending production telemetry. May need adjustment during Phase 2.

- **Multi-warehouse behavior:** Unclear how API aggregates or separates data for accounts with multiple warehouses. Needs testing with multi-warehouse account during Phase 3.

- **Response time characteristics:** No baseline for typical response times or timeout tuning. Should gather during Phase 2 observability work.

- **Forecast refresh frequency:** Unknown how often Inventory Planner recalculates forecasts (daily? hourly?). Impacts freshness warnings in Phase 3.

## Sources

### Primary (HIGH confidence)
- `/mcp/inventory-planner/src/**/*.ts` — Complete existing implementation analyzed
- `/mcp/inventory-planner/package.json` — Verified stack dependencies and versions
- `/mcp/mrpeasy/src/**/*.ts` — Reference implementation patterns verified
- `/.planning/codebase/ARCHITECTURE.md` — Codebase architecture documentation
- `/.planning/codebase/STRUCTURE.md` — File structure and component organization

### Secondary (MEDIUM confidence)
- Inventory Planner API field names and response shapes (inferred from types.ts)
- Rate limiting behavior (conservative defaults based on lack of documentation)
- Pagination format (verified in client implementation)

### Tertiary (LOW confidence)
- Historical data endpoint existence (not found in codebase, needs verification)
- Reference data endpoints for warehouses/vendors (standard REST assumption)
- Forecast refresh frequency (not documented)

---
*Research completed: 2026-01-25*
*Ready for roadmap: yes*
