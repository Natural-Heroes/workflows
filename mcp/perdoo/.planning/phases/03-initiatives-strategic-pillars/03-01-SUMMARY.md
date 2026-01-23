---
phase: "03"
plan: "01"
subsystem: "initiatives"
tags: ["mcp", "graphql", "initiatives", "tools"]
dependency-graph:
  requires: ["02-01"]
  provides: ["initiative-mcp-tools", "initiative-client-methods", "initiative-query"]
  affects: ["03-02"]
tech-stack:
  added: []
  patterns: ["dedicated-root-query-wrapper", "type-forced-upsert"]
key-files:
  created:
    - "src/services/perdoo/operations/initiatives.ts"
    - "src/mcp/tools/initiatives.ts"
  modified:
    - "src/services/perdoo/types.ts"
    - "src/services/perdoo/client.ts"
    - "src/mcp/tools/index.ts"
decisions:
  - "Use dedicated initiatives(...) root query instead of keyResults with type filter"
  - "createInitiative forces type=INITIATIVE; updateInitiative does not force type"
  - "Response key is 'initiatives' in list tool (not 'keyResults')"
  - "Create/update response uses 'initiative' key (not 'keyResult')"
metrics:
  duration: "~2m 45s"
  completed: "2026-01-23"
---

# Phase 3 Plan 1: Initiative MCP Tools Summary

**One-liner:** Dedicated initiative MCP tools wrapping key result infrastructure with pre-filtered `initiatives(...)` root query.

## What Was Done

### Task 1: Initiative operations, types, and client methods

1. Created `src/services/perdoo/operations/initiatives.ts`:
   - `INITIATIVES_QUERY` using the dedicated `initiatives(...)` root query (pre-filtered server-side)
   - No `$type` variable needed (initiatives endpoint already filters)
   - Same return fields as KEY_RESULTS_QUERY (id, name, progress, status, lead, objective, timeframe, etc.)

2. Added `InitiativesData` interface to `src/services/perdoo/types.ts`:
   - Reuses `Connection<KeyResult>` type since initiatives ARE key results
   - JSDoc explains the relationship

3. Added 4 client methods to `src/services/perdoo/client.ts`:
   - `listInitiatives(params?)` - uses INITIATIVES_QUERY, default first=20
   - `getInitiative(id)` - reuses KEY_RESULT_QUERY (`result` root query)
   - `createInitiative(input)` - upsertKeyResult with `type: 'INITIATIVE'` forced
   - `updateInitiative(id, input)` - upsertKeyResult with id spread in

### Task 2: Initiative MCP tools and instructions update

1. Created `src/mcp/tools/initiatives.ts` with 4 tools:
   - `list_initiatives` - flattens edges/nodes, response key `initiatives`
   - `get_initiative` - full detail view with groups/contributors/tags
   - `create_initiative` - no `type` param exposed, objective required
   - `update_initiative` - no `type` param exposed

2. Updated `src/mcp/tools/index.ts`:
   - Added import and registration call
   - Updated SERVER_DESCRIPTION to mention initiatives
   - Added Initiatives section to Available Tools
   - Added "Initiative vs Key Result" to Key Concepts
   - Added list_initiatives filters section
   - Added initiative relationships to Entity Relationships
   - Added initiative mutations to Mutations section

## Verification Results

- `npx tsc --noEmit` - passed with no errors
- `npm run build` - succeeded

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use `initiatives(...)` root query | Pre-filtered server-side, cleaner than keyResults with type filter |
| Force type=INITIATIVE only on create | Update doesn't need to re-assert type; it's already set |
| Response key: `initiative`/`initiatives` | LLM sees initiative-domain language, not underlying keyResult |
| No type param on tools | Prevents accidental creation of KEY_RESULT via initiative tools |

## Commits

| Hash | Message |
|------|---------|
| 30ced79 | feat(nat-54): add initiative MCP tools wrapping key result infrastructure |

## Next Phase Readiness

Phase 3 Plan 2 (Strategic Pillars) can proceed. No blockers introduced.
