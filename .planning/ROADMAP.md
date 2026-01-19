# Roadmap: MRPeasy MCP Server

## Overview

Build a production-ready MCP server for MRPeasy that enables AI assistants to query manufacturing data. Starting with solid infrastructure and security, then implementing 5 read-only tools with proper rate limiting, ending with deployment to Dokploy.

## Domain Expertise

None — MCP server development follows official SDK patterns and research findings.

## Phases

- [x] **Phase 1: Core Infrastructure** — MCP server with transport, logging, environment validation
- [x] **Phase 2: API Client & Tools** — MRPeasy client with auth, 5 read tools with Zod schemas
- [ ] **Phase 3: Rate Limiting & Resilience** — Request queue, retry logic, circuit breaker
- [ ] **Phase 4: Error Handling** — LLM-readable errors, comprehensive input validation
- [ ] **Phase 5: Testing & Deployment** — MCP Inspector testing, Dokploy deployment

## Phase Details

### Phase 1: Core Infrastructure
**Goal**: Working MCP HTTP server with proper architecture foundations
**Depends on**: Nothing (first phase)
**Research**: Unlikely (well-documented SDK patterns)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Plans**: TBD

Delivers:
- Express server with StreamableHTTPServerTransport
- Session-based architecture (no global state)
- stderr-only logging infrastructure
- Environment variable validation at startup
- Basic project structure following research patterns

### Phase 2: API Client & Tools
**Goal**: Complete set of 5 read-only tools with MRPeasy API integration
**Depends on**: Phase 1
**Research**: Unlikely (Zod schemas well-documented)
**Requirements**: API-01, TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, TOOL-08
**Plans**: TBD

Delivers:
- MRPeasy API client with Basic Auth
- get_inventory tool (stock levels and costs)
- get_customer_orders tool (list and filter)
- get_manufacturing_orders tool (production status)
- get_product tool (details with BOM)
- search_items tool (search by name/SKU)
- Zod schema validation for all inputs/outputs
- Cursor-based pagination for list operations
- Clear tool descriptions for LLM consumption

### Phase 3: Rate Limiting & Resilience
**Goal**: Robust handling of MRPeasy's strict rate limits
**Depends on**: Phase 2
**Research**: Likely (sparse docs for single-concurrent queueing)
**Research topics**: Request queue implementation with fair scheduling across sessions, token bucket vs sliding window for 100/10s limit
**Requirements**: API-02, API-03, API-04, API-05
**Plans**: TBD

Delivers:
- Request queue with max 1 concurrent request
- Token bucket rate limiter (100 requests per 10 seconds)
- Exponential backoff retry logic with jitter
- Circuit breaker for sustained failures (5 failures → open)
- Fair scheduling across multiple sessions

### Phase 4: Error Handling
**Goal**: Comprehensive, LLM-readable error handling
**Depends on**: Phase 3
**Research**: Unlikely (well-established patterns)
**Requirements**: API-06, ERR-01, ERR-02, ERR-03, ERR-04
**Plans**: TBD

Delivers:
- Structured error responses with isError: true
- LLM-readable, actionable error messages
- Separate user-facing vs internal error details
- Comprehensive input validation with Zod
- 429/503 error handling with retry guidance

### Phase 5: Testing & Deployment
**Goal**: Production deployment to Dokploy with testing
**Depends on**: Phase 4
**Research**: Likely (Dokploy specifics from task 304)
**Research topics**: Task 304 deployment pattern, health check configuration
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04
**Plans**: TBD

Delivers:
- Docker containerization
- MCP Inspector end-to-end testing
- Multi-session concurrency testing
- Dokploy deployment (task 304 pattern)
- Health check endpoint
- Environment-based configuration

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Infrastructure | 1/1 | Complete | 2026-01-19 |
| 2. API Client & Tools | 3/3 | Complete | 2026-01-19 |
| 3. Rate Limiting & Resilience | 0/2 | Planned | - |
| 4. Error Handling | 0/TBD | Not started | - |
| 5. Testing & Deployment | 0/TBD | Not started | - |

---
*Created: 2026-01-19*
*Requirements coverage: 25/25 (100%)*
