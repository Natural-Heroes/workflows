# Roadmap: Perdoo MCP Server

## Overview

Build a GraphQL-to-MCP bridge server that exposes Perdoo's OKR management API as MCP tools for LLM consumption. Phase 1 establishes the entire infrastructure stack and validates the integration pattern end-to-end with Objectives (highest-confidence entity). Phases 2 and 3 replicate the proven pattern across remaining entities, ordered by research confidence level.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation + Objectives** - Infrastructure, GraphQL client, resilience stack, and first entity proving the integration pattern
- [x] **Phase 2: Key Results + KPIs** - High/medium-confidence entities replicating the proven pattern
- [x] **Phase 3: Initiatives + Strategic Pillars** - Medium/low-confidence entities completing full API coverage

## Phase Details

### Phase 1: Foundation + Objectives
**Goal**: A functional MCP server that can manage objectives in Perdoo, validating the entire GraphQL integration pattern end-to-end
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, OBJ-01, OBJ-02, OBJ-03, OBJ-04
**Success Criteria** (what must be TRUE):
  1. Server starts successfully with a valid PERDOO_API_TOKEN and fails immediately with a clear error when token is missing
  2. LLM can list objectives from Perdoo with pagination and filtering through MCP tools
  3. LLM can create a new objective and retrieve it by ID to confirm creation
  4. LLM can update an existing objective and verify the change persists
  5. Server instructions resource describes available tools and usage patterns to the LLM
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffolding, GraphQL client with resilience stack, and introspection query
- [x] 01-02-PLAN.md -- Objective tools (list, get, create, update), Express transport, and instructions resource
- [x] 01-03-PLAN.md -- Schema introspection, operation correction, and end-to-end validation

### Phase 2: Key Results + KPIs
**Goal**: LLMs can manage key results and KPIs through MCP tools, using the proven pattern from Phase 1
**Depends on**: Phase 1
**Requirements**: KR-01, KR-02, KR-03, KR-04, KPI-01, KPI-02, KPI-03, KPI-04
**Success Criteria** (what must be TRUE):
  1. LLM can list and get key results with filtering, and they correctly reference their parent objective
  2. LLM can create a key result under a specific objective and update its properties
  3. LLM can list and get KPIs with filtering
  4. LLM can create and update KPIs
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md -- Introspect KR schema, create operations/types/client/tools for Key Results
- [x] 02-02-PLAN.md -- Introspect KPI schema, create operations/types/client/tools for KPIs, update instructions

### Phase 3: Initiatives + Strategic Pillars
**Goal**: Full API coverage -- LLMs can manage all five Perdoo entity types through a single MCP interface
**Depends on**: Phase 2
**Requirements**: INIT-01, INIT-02, INIT-03, INIT-04, PILLAR-01, PILLAR-02, PILLAR-03, PILLAR-04
**Success Criteria** (what must be TRUE):
  1. LLM can list and get initiatives with filtering, and they correctly reference their parent objective
  2. LLM can create an initiative under a specific objective and update its properties
  3. LLM can list and get strategic pillars with filtering
  4. LLM can create and update strategic pillars (subject to API permission constraints)
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md -- Initiative operations, types, client methods, MCP tools, and instructions update
- [x] 03-02-PLAN.md -- Introspect Goal schema, strategic pillar operations/types/client/tools, instructions update

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Objectives | 3/3 | Complete | 2026-01-23 |
| 2. Key Results + KPIs | 2/2 | Complete | 2026-01-23 |
| 3. Initiatives + Strategic Pillars | 2/2 | Complete | 2026-01-23 |
