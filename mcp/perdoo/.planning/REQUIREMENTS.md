# Requirements: Perdoo MCP Server

**Defined:** 2026-01-23
**Core Value:** LLMs can fully manage OKR structures in Perdoo through a single MCP interface

## v1 Requirements

### Infrastructure

- [x] **INFRA-01**: Server validates Bearer token at startup (fail-fast on missing credentials)
- [x] **INFRA-02**: GraphQL client executes queries/mutations against Perdoo endpoint with resilience stack (retry, rate limiter, circuit breaker, request queue)
- [x] **INFRA-03**: GraphQL error responses (200 with errors array) are detected and surfaced as typed errors
- [x] **INFRA-04**: Mutations are not retried (only queries are safe to retry)
- [x] **INFRA-05**: Session-based MCP-over-HTTP transport via Express (matching MRPeasy pattern)
- [x] **INFRA-06**: Server instructions resource provides LLM usage guidance
- [x] **INFRA-07**: Schema introspection query runs to discover exact types/fields before tool implementation

### Objectives

- [x] **OBJ-01**: User can list objectives with pagination and filtering
- [x] **OBJ-02**: User can get a single objective by ID
- [x] **OBJ-03**: User can create an objective with required fields
- [x] **OBJ-04**: User can update an existing objective

### Key Results

- [x] **KR-01**: User can list key results with pagination and filtering
- [x] **KR-02**: User can get a single key result by ID
- [x] **KR-03**: User can create a key result under an objective
- [x] **KR-04**: User can update an existing key result

### KPIs

- [x] **KPI-01**: User can list KPIs with pagination and filtering
- [x] **KPI-02**: User can get a single KPI by ID
- [x] **KPI-03**: User can create a KPI
- [x] **KPI-04**: User can update an existing KPI

### Initiatives

- [ ] **INIT-01**: User can list initiatives with pagination and filtering
- [ ] **INIT-02**: User can get a single initiative by ID
- [ ] **INIT-03**: User can create an initiative under an objective
- [ ] **INIT-04**: User can update an existing initiative

### Strategic Pillars

- [ ] **PILLAR-01**: User can list strategic pillars with pagination and filtering
- [ ] **PILLAR-02**: User can get a single strategic pillar by ID
- [ ] **PILLAR-03**: User can create a strategic pillar
- [ ] **PILLAR-04**: User can update an existing strategic pillar

## v2 Requirements

### Advanced Features

- **ADV-01**: Pagination helper auto-fetches all pages when requested
- **ADV-02**: Bulk operations (create/update multiple entities in one call)
- **ADV-03**: Relationship-aware creation (create objective with KRs in one tool call)
- **ADV-04**: Schema validation on startup (verify critical fields still exist)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Delete operations | Destructive actions should require human in the loop via Perdoo UI |
| KR/KPI value entry | Operational tracking, not structure management |
| User/team management | Admin operations outside OKR scope |
| Webhooks/real-time sync | One-directional API calls only |
| GraphQL subscriptions | Perdoo unlikely to support, unnecessary for tool-based access |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| INFRA-06 | Phase 1 | Complete |
| INFRA-07 | Phase 1 | Complete |
| OBJ-01 | Phase 1 | Complete |
| OBJ-02 | Phase 1 | Complete |
| OBJ-03 | Phase 1 | Complete |
| OBJ-04 | Phase 1 | Complete |
| KR-01 | Phase 2 | Complete |
| KR-02 | Phase 2 | Complete |
| KR-03 | Phase 2 | Complete |
| KR-04 | Phase 2 | Complete |
| KPI-01 | Phase 2 | Complete |
| KPI-02 | Phase 2 | Complete |
| KPI-03 | Phase 2 | Complete |
| KPI-04 | Phase 2 | Complete |
| INIT-01 | Phase 3 | Pending |
| INIT-02 | Phase 3 | Pending |
| INIT-03 | Phase 3 | Pending |
| INIT-04 | Phase 3 | Pending |
| PILLAR-01 | Phase 3 | Pending |
| PILLAR-02 | Phase 3 | Pending |
| PILLAR-03 | Phase 3 | Pending |
| PILLAR-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-01-23*
*Last updated: 2026-01-23 after Phase 2 completion*
