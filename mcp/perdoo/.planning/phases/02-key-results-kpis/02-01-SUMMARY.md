---
phase: 02-key-results-kpis
plan: 01
subsystem: api
tags: [mcp, graphql, key-results, crud, introspection]

# Dependency graph
requires:
  - phase: 01-foundation-objectives
    provides: PerdooClient, resilience stack, MCP server, objective tools pattern
provides:
  - Key Result GraphQL operations (list, get, upsert)
  - Key Result TypeScript types (KeyResult, UpsertKeyResultInput, response types)
  - 4 MCP tools (list_key_results, get_key_result, create_key_result, update_key_result)
  - Client methods (listKeyResults, getKeyResult, createKeyResult, updateKeyResult)
affects: [phase 02 plan 02 (KPI tools), phase 03 (initiatives, pillars)]

# Tech tracking
tech-stack:
  added: []
  patterns: [upsert-mutation-pattern-for-key-results, result-singular-query-name, key-result-type-enum]

key-files:
  created:
    - mcp/perdoo/src/services/perdoo/operations/key-results.ts
    - mcp/perdoo/src/mcp/tools/key-results.ts
  modified:
    - mcp/perdoo/src/services/perdoo/types.ts
    - mcp/perdoo/src/services/perdoo/client.ts
    - mcp/perdoo/src/mcp/tools/index.ts

key-decisions:
  - "Singular key result query is `result(id: UUID!)` not `keyResult(id: ...)`"
  - "Key result type enum: KEY_RESULT | INITIATIVE (PerdooApiKeyResultTypeChoices)"
  - "Upsert pattern confirmed: upsertKeyResult follows same pattern as upsertObjective"
  - "keyResults query has extensive Django-style filters: objective, lead_Id, type, status_In, timeframe, etc."
  - "No singular keyResult query exists in root Query type; `result` is the singular accessor"

patterns-established:
  - "Key result operations replicate objective pattern exactly"
  - "Type enum exposed as tool parameter for filtering"
  - "Metric values (startValue, targetValue, currentValue, unit) included in list view for LLM context"

# Metrics
duration: 6m 15s
completed: 2026-01-23
---

# Phase 2 Plan 1: Key Result Tools Summary

**Full key result CRUD via 4 MCP tools backed by introspection-verified GraphQL operations using result(id: UUID!) singular query and keyResults(...) list query with upsert mutation pattern**

## Performance

- **Completed:** 2026-01-23
- **Duration:** ~6m 15s
- **Tasks:** 2/2
- **Files created:** 2
- **Files modified:** 3

## Status: Complete

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Introspect Key Result schema, create operations + types | f79590d | Done |
| 2 | Add client methods and register Key Result MCP tools | 6e057a3 | Done |

## Accomplishments

- Created `operations/key-results.ts` with KEY_RESULTS_QUERY, KEY_RESULT_QUERY, UPSERT_KEY_RESULT_MUTATION
- Extended `types.ts` with KeyResult interface, KeyResultType enum, response types, and UpsertKeyResultInput
- Added 4 typed client methods (listKeyResults, getKeyResult, createKeyResult, updateKeyResult)
- Created `tools/key-results.ts` with 4 MCP tools featuring Zod schemas and meaningful descriptions
- Registered tools in index.ts; server starts and reports all tools registered
- Tools flatten relay connections for LLM consumption
- List tool exposes 10+ filter parameters from schema introspection

## Key Decisions

- **Singular query name**: The singular key result query in Perdoo is `result(id: UUID!)`, NOT `keyResult(id: ...)`. Discovered via introspection of the root Query type.
- **KeyResultType enum**: Two values: `KEY_RESULT` and `INITIATIVE`. Referenced as `PerdooApiKeyResultTypeChoices` in schema.
- **Upsert pattern confirmed**: Key results follow the same upsert pattern as objectives -- `upsertKeyResult(input: UpsertKeyResultMutationInput!)` with id omitted for create, id included for update.
- **Rich filter set**: The keyResults query accepts `objective` (UUID), `lead_Id` (UUID), `type`, `status_In`, `objectiveStage`, `timeframe` (UUID), `archived`, `orderBy`, and many more filters.
- **Metric fields in list view**: Included startValue, targetValue, currentValue, unit in list results for better LLM context without needing get calls.

## Deviations from Plan

None - plan executed exactly as written.

## Schema Introspection Notes (for Plan 02)

Key results data was extracted from the Phase 1 introspection output which contained the full Query type fields list. Notable findings for KPI tools:

- The Query type has `kpis(...)` as a root query (list)
- The `kpi` type is referenced on objectives (line 278 of introspection output)
- Mutation pattern will likely be `upsertKpi(input: UpsertKpiMutationInput!)`
- KPIs have a singular query -- check for `kpi(id: UUID!)` in Query type fields

## Next Phase Readiness

- Phase 2 Plan 2 (KPI tools) can proceed immediately
- Key result tools provide the foundation for linking KPIs to objectives
- Instructions resource update deferred to Plan 02 as specified in the plan
