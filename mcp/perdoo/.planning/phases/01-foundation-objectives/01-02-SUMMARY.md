---
phase: 01-foundation-objectives
plan: 02
subsystem: api
tags: [mcp, graphql, express, objectives, relay-pagination]

# Dependency graph
requires:
  - phase: 01-foundation-objectives (plan 01)
    provides: PerdooClient with GraphQL execute, resilience stack, error types
provides:
  - Express server with StreamableHTTPServerTransport on port 3001
  - Four objective tools (list, get, create, update) with MCP registration
  - Instructions resource at perdoo://instructions
  - Error handler mapping Perdoo errors to MCP format
  - Typed client methods for objectives and introspection
affects: [01-foundation-objectives plan 03 (introspection), phase 02 (key-results)]

# Tech tracking
tech-stack:
  added: []
  patterns: [relay-pagination-flattening, tool-error-handler, instructions-resource, session-based-transport]

key-files:
  created:
    - mcp/perdoo/src/server.ts
    - mcp/perdoo/src/mcp/index.ts
    - mcp/perdoo/src/mcp/tools/index.ts
    - mcp/perdoo/src/mcp/tools/objectives.ts
    - mcp/perdoo/src/mcp/tools/error-handler.ts
    - mcp/perdoo/src/services/perdoo/operations/objectives.ts
  modified:
    - mcp/perdoo/src/services/perdoo/client.ts
    - mcp/perdoo/src/services/perdoo/types.ts

key-decisions:
  - "UpdateObjectiveInput index signature: id passed separately as mutation variable, not in input"
  - "Relay pagination flattened to simple array for LLM consumption"
  - "additional_fields record allows schema-dependent parameters before introspection"

patterns-established:
  - "Tool registration: registerXTools(server, client) pattern per domain"
  - "Error handler: handleToolError centralizes all error-to-MCP mapping"
  - "Instructions resource: markdown at {service}://instructions with tools, pagination, relationships"
  - "Typed client methods: high-level wrappers around execute() with proper isMutation flags"

# Metrics
duration: 3m 32s
completed: 2026-01-23
---

# Phase 1 Plan 2: MCP Server + Objective Tools Summary

**Express MCP server with 4 objective CRUD tools, relay pagination flattening, instructions resource, and error handler covering all Perdoo error types**

## Performance

- **Duration:** 3m 32s
- **Started:** 2026-01-23T06:56:21Z
- **Completed:** 2026-01-23T06:59:53Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Complete MCP server starting on port 3001 with session-based StreamableHTTP transport
- Four objective tools (list, get, create, update) with Zod schemas and relay pagination flattening
- Instructions resource at perdoo://instructions with tool docs, pagination guide, entity relationships, best practices
- Error handler mapping PerdooApiError, PerdooHttpError, CircuitBreakerOpenError to actionable LLM messages
- Five typed PerdooClient methods (listObjectives, getObjective, createObjective, updateObjective, introspect)

## Task Commits

Each task was committed atomically:

1. **Task 1: Objective operations, typed client methods, and error handler** - `59fe61f` (feat)
2. **Task 2: MCP server, objective tools, instructions resource, and Express transport** - `6cbfb62` (feat)

## Files Created/Modified
- `mcp/perdoo/src/services/perdoo/operations/objectives.ts` - 4 GraphQL operation constants (OBJECTIVES_QUERY, OBJECTIVE_QUERY, CREATE/UPDATE_OBJECTIVE_MUTATION)
- `mcp/perdoo/src/services/perdoo/client.ts` - Added 5 typed methods wrapping execute()
- `mcp/perdoo/src/services/perdoo/types.ts` - Fixed UpdateObjectiveInput, added index signatures for extensibility
- `mcp/perdoo/src/mcp/tools/error-handler.ts` - Maps all Perdoo error types to MCP error responses with suggestions
- `mcp/perdoo/src/mcp/tools/objectives.ts` - Registers 4 objective tools with Zod validation
- `mcp/perdoo/src/mcp/tools/index.ts` - createMcpServer() with instructions resource and tool registration
- `mcp/perdoo/src/mcp/index.ts` - Barrel export for MCP module
- `mcp/perdoo/src/server.ts` - Express server with MCP transport, health check, session management

## Decisions Made
- **UpdateObjectiveInput without id**: The mutation passes `$id` as a separate variable, so the input type uses an index signature instead of requiring id. This allows the update tool to pass arbitrary fields.
- **additional_fields for create_objective**: Since schemas are LOW confidence pre-introspection, the create tool accepts an `additional_fields` record for schema-specific parameters.
- **Relay pagination flattening**: list_objectives flattens edges/nodes into a simple array and extracts hasNextPage/endCursor for LLM-friendly pagination.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed UpdateObjectiveInput requiring id**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** UpdateObjectiveInput had `id: string` as required field, but the GraphQL mutation passes id as a separate variable `$id: ID!`
- **Fix:** Removed required `id` from UpdateObjectiveInput, added index signature for extensibility
- **Files modified:** mcp/perdoo/src/services/perdoo/types.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 6cbfb62 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type fix necessary for correct compilation. No scope creep.

## Issues Encountered
None - plan executed cleanly after the type fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP server fully operational with objective tools
- Ready for Plan 03: schema introspection to validate/correct field names and mutation signatures
- GraphQL operations marked as LOW confidence will be updated after introspection results

---
*Phase: 01-foundation-objectives*
*Completed: 2026-01-23*
