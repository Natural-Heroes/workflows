# Requirements: MRPeasy MCP Server

## Overview

Requirements for Phase 1 (read-only tools) of the MRPeasy MCP server.

## v1 Requirements

### Infrastructure (INFRA)

| ID | Requirement | Priority |
|----|-------------|----------|
| INFRA-01 | MCP HTTP server with StreamableHTTPServerTransport | Must |
| INFRA-02 | Express 4.x HTTP framework setup | Must |
| INFRA-03 | Environment variable validation at startup | Must |
| INFRA-04 | stderr-only logging (no stdout pollution) | Must |
| INFRA-05 | Session-based architecture (no global state) | Must |

### API Client (API)

| ID | Requirement | Priority |
|----|-------------|----------|
| API-01 | MRPeasy API client with Basic Auth | Must |
| API-02 | Request queue with max 1 concurrent request | Must |
| API-03 | Rate limiting (100 requests per 10 seconds) | Must |
| API-04 | Retry logic with exponential backoff and jitter | Must |
| API-05 | Circuit breaker for sustained failures | Should |
| API-06 | Error handling for 429 and 503 responses | Must |

### Tools (TOOL)

| ID | Requirement | Priority |
|----|-------------|----------|
| TOOL-01 | get_inventory tool (stock levels and costs) | Must |
| TOOL-02 | get_customer_orders tool (list and filter orders) | Must |
| TOOL-03 | get_manufacturing_orders tool (production status) | Must |
| TOOL-04 | get_product tool (product details with BOM) | Must |
| TOOL-05 | search_items tool (search by name/SKU) | Must |
| TOOL-06 | Zod schema validation for all tool inputs | Must |
| TOOL-07 | Cursor-based pagination for list operations | Must |
| TOOL-08 | Clear tool descriptions for LLM consumption | Must |

### Error Handling (ERR)

| ID | Requirement | Priority |
|----|-------------|----------|
| ERR-01 | Structured error responses with isError: true | Must |
| ERR-02 | LLM-readable error messages (actionable) | Must |
| ERR-03 | Separate user-facing vs internal error details | Must |
| ERR-04 | Input validation with Zod | Must |

### Deployment (DEPLOY)

| ID | Requirement | Priority |
|----|-------------|----------|
| DEPLOY-01 | Docker containerization | Must |
| DEPLOY-02 | Dokploy deployment (task 304 pattern) | Must |
| DEPLOY-03 | Health check endpoint | Should |
| DEPLOY-04 | Environment-based configuration | Must |

## v2 Requirements (Out of Scope)

| ID | Requirement | Notes |
|----|-------------|-------|
| v2-01 | Write tool: create_customer_order | After read validation |
| v2-02 | Write tool: update_order_status | After read validation |
| v2-03 | Write tool: update_inventory | After read validation |
| v2-04 | Response caching | Add if rate limits problematic |
| v2-05 | Webhook integration | Future consideration |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 3 | Pending |
| API-03 | Phase 3 | Pending |
| API-04 | Phase 3 | Pending |
| API-05 | Phase 3 | Pending |
| API-06 | Phase 4 | Pending |
| TOOL-01 | Phase 2 | Pending |
| TOOL-02 | Phase 2 | Pending |
| TOOL-03 | Phase 2 | Pending |
| TOOL-04 | Phase 2 | Pending |
| TOOL-05 | Phase 2 | Pending |
| TOOL-06 | Phase 2 | Pending |
| TOOL-07 | Phase 2 | Pending |
| TOOL-08 | Phase 2 | Pending |
| ERR-01 | Phase 4 | Pending |
| ERR-02 | Phase 4 | Pending |
| ERR-03 | Phase 4 | Pending |
| ERR-04 | Phase 4 | Pending |
| DEPLOY-01 | Phase 5 | Pending |
| DEPLOY-02 | Phase 5 | Pending |
| DEPLOY-03 | Phase 5 | Pending |
| DEPLOY-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Last updated: 2026-01-19*
