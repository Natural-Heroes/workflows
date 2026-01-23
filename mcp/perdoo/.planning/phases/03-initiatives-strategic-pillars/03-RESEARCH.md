# Phase 3: Initiatives + Strategic Pillars - Research

**Researched:** 2026-01-23
**Domain:** Perdoo GraphQL Initiatives (key result sub-type) and Strategic Pillars (Goal entity) CRUD via MCP tools
**Confidence:** MEDIUM (initiatives pattern confirmed HIGH; strategic pillars partially confirmed, mutations unknown)

## Summary

Phase 3 adds the final two entity types to complete full API coverage. These entities are fundamentally different in their implementation complexity:

**Initiatives** are a solved problem: they are Key Results with `type: "INITIATIVE"` and share the exact same `keyResult` type, `keyResultConnection`, `result(id: UUID!)` singular query, and `upsertKeyResult` mutation. The existing `list_key_results` tool already accepts `type: "INITIATIVE"` as a filter. The question is whether to expose dedicated initiative tools (for LLM ergonomics) that internally delegate to key result operations, or rely on the existing key result tools with type filters.

**Strategic Pillars** (called "Goal" in the API) are the true unknown. The `Goal` type exists, with a singular `goal(id: UUID!)` query and a plural `goals(...)` query with Django-style filters. However, no mutation has been discovered yet (the Mutation type was not captured in prior introspection). The `Goal` type fields are unknown. The `goals` query has a `type` filter (PerdooApiGoalTypeChoices enum) suggesting the Goal entity may be polymorphic (objectives, KPIs, and strategic pillars might ALL be "goals" internally). Additionally, Perdoo documentation states that Superadmin rights are required for strategic pillar creation/modification, which may mean mutations are restricted.

**Primary recommendation:** Split execution into two waves. Wave 1: Create dedicated initiative MCP tools that wrap the existing key result infrastructure. Wave 2: Introspect the Goal type and Goal mutations, then build strategic pillar tools. Initiatives can ship independently since they use proven infrastructure.

## Standard Stack

No new libraries needed. Phase 3 uses the identical stack from Phases 1 and 2.

### What To Reuse

| Source File | Pattern | How to Replicate |
|-------------|---------|------------------|
| `operations/key-results.ts` | KEY_RESULTS_QUERY with type filter | Initiatives use same query with `type: "INITIATIVE"` preset |
| `operations/key-results.ts` | KEY_RESULT_QUERY (result singular) | Initiatives use same `result(id: UUID!)` query |
| `operations/key-results.ts` | UPSERT_KEY_RESULT_MUTATION | Initiatives use same mutation with `type: "INITIATIVE"` |
| `tools/key-results.ts` | Tool registration pattern | Copy for initiatives, adapting parameter names |
| `tools/kpis.ts` | Tool registration pattern | Copy for strategic pillars once schema is known |
| `client.ts` | Typed client methods | Add initiative-specific and strategic pillar methods |

## Architecture Patterns

### Recommended Project Structure After Phase 3

```
src/
├── services/perdoo/
│   ├── operations/
│   │   ├── introspection.ts      (existing)
│   │   ├── objectives.ts         (existing)
│   │   ├── key-results.ts        (existing - used by initiatives too)
│   │   ├── kpis.ts               (existing)
│   │   ├── initiatives.ts        (NEW - initiative-specific queries if needed)
│   │   └── strategic-pillars.ts  (NEW - Goal queries and mutations)
│   ├── client.ts                 (MODIFIED - add initiative + pillar methods)
│   └── types.ts                  (MODIFIED - add Goal/StrategicPillar types)
├── mcp/tools/
│   ├── objectives.ts             (existing)
│   ├── key-results.ts            (existing)
│   ├── kpis.ts                   (existing)
│   ├── initiatives.ts            (NEW - 4 tools)
│   ├── strategic-pillars.ts      (NEW - 4 tools)
│   └── index.ts                  (MODIFIED - register new tools)
└── scripts/
    └── introspect.ts             (existing)
```

### Key Architectural Decision: Initiatives Delegation Pattern

Initiatives have two implementation options:

**Option A (Recommended): Thin Wrapper with Dedicated Tools**
- Create `tools/initiatives.ts` with 4 tools: `list_initiatives`, `get_initiative`, `create_initiative`, `update_initiative`
- These tools internally call the SAME client methods (`listKeyResults`, `getKeyResult`, `createKeyResult`, `updateKeyResult`) but:
  - `list_initiatives` pre-sets `type: "INITIATIVE"` filter
  - `create_initiative` pre-sets `type: "INITIATIVE"` in the input
  - Tool descriptions and parameter names are initiative-focused (no mention of key results)
- Create `operations/initiatives.ts` with dedicated queries that use the initiatives root query (for clarity)
- The LLM sees clean initiative-focused tools without needing to understand the key result/initiative duality

**Option B (Minimal): Rely on existing key result tools**
- No new tools; documentation tells LLMs to use `list_key_results` with `type: "INITIATIVE"`
- Less LLM-friendly; requires understanding the shared type model
- Not recommended because the MCP server should present clean domain concepts

**Decision: Use Option A.** The success criteria say "LLM can list and get initiatives" -- dedicated tools make this natural.

### Initiative Implementation Detail

```
Tools layer (initiatives.ts):
  list_initiatives  →  listInitiatives()    →  INITIATIVES_QUERY (type preset)
  get_initiative    →  getInitiative()      →  result(id: UUID!) query (same as KR)
  create_initiative →  createInitiative()   →  upsertKeyResult with type: "INITIATIVE"
  update_initiative →  updateInitiative()   →  upsertKeyResult with id
```

The `initiatives` root query (line 5386 in introspection) has identical args to `keyResults` and returns `keyResultConnection`. Using it instead of `keyResults` with type filter ensures the API handles type-scoping server-side.

### Strategic Pillars: Goal Polymorphism

The `goals` query (line 1138 in introspection) has a `type` filter using `PerdooApiGoalTypeChoices` enum. This strongly suggests that "Goal" is a polymorphic type encompassing multiple entity types. The strategic pillar is likely ONE type value in this enum.

Key evidence:
- `PerdooApiGoalTypeChoices` - enum used as type filter on `goals` query
- `PerdooApiGoalStatusChoices` - enum used as status filter
- `GoalType` enum - used in `recommendedGoalStatus` query
- `goalTypes` - no-args query that likely returns available GoalType values
- The objective type's `goal` field (type: Goal) links objectives to strategic pillars
- Both objectives and KPIs have `goal` fields referencing strategic pillars

**Implication for Phase 3:** The `goals` query needs to be called with the correct `type` filter value (likely "STRATEGIC_PILLAR" or similar) to return only strategic pillars. This filter value must be discovered via introspection of the `PerdooApiGoalTypeChoices` enum.

## Initiatives: What We Know (HIGH Confidence)

### Confirmed Facts

| Fact | Source | Confidence |
|------|--------|------------|
| Initiatives ARE key results with `type: "INITIATIVE"` | KeyResultType enum, types.ts | HIGH |
| `initiatives(...)` root query exists with identical args to `keyResults(...)` | Introspection output line 5386 | HIGH |
| `initiatives` returns `keyResultConnection` | Objective type's initiatives field (line 380) | HIGH |
| `result(id: UUID!)` works for both key results AND initiatives | Phase 2 discovery | HIGH |
| `upsertKeyResult` with `type: "INITIATIVE"` creates initiatives | UpsertKeyResultInput has `type` field | HIGH |
| Initiatives have same fields as key results (name, description, progress, status, objective, etc.) | Shared `keyResult` type | HIGH |
| `keyResults_Type` filter on objectives uses `PerdooApiKeyResultTypeChoices` | Introspection | HIGH |
| Initiatives can nest under Key Results or other Initiatives (parent field) | Perdoo support docs | HIGH |
| Initiatives do NOT contribute to objective progress | Perdoo support docs | MEDIUM |

### Initiative-Specific Considerations

- **Metric fields (startValue, targetValue, currentValue):** Initiatives support them (Binary, Milestone, Increase to, Decrease to) according to Perdoo docs, but they are typically milestone/binary for qualitative deliverables
- **Parent relationship:** Initiatives can have a parent key result or initiative (single parent only)
- **No progress contribution:** Unlike key results, initiatives don't push objective progress

### Initiatives Root Query Filter Args

All confirmed from introspection output lines 5386-5828. Identical to `keyResults` query:

| Key Filters | Type | Purpose |
|-------------|------|---------|
| objective | UUID | Parent objective |
| lead_Id | UUID | Lead user |
| type | String | Result type (can further filter) |
| archived | Boolean | Archive status |
| status_In | String | Commit status |
| objectiveStage | String | Parent objective stage |
| timeframe | UUID | Timeframe |
| orderBy | String | Sort order |
| parent | UUID | Parent result |
| name_Icontains | String | Name search |

## Strategic Pillars: What We Know (MEDIUM Confidence)

### Confirmed Facts

| Fact | Source | Confidence |
|------|--------|------------|
| Type name in API is `Goal` (OBJECT) | Introspection output line 270 | HIGH |
| Singular query: `goal(id: UUID!)` | Introspection output line 1122 | HIGH |
| Plural query: `goals(...)` with Django filters | Introspection output line 1138 | HIGH |
| `PerdooApiGoalTypeChoices` enum exists (type filter) | Introspection output line 1183 | HIGH |
| `PerdooApiGoalStatusChoices` enum exists | Introspection output line 1199 | HIGH |
| `GoalType` enum exists | Introspection output line 1458 | HIGH |
| Objectives have a `goal` field (Goal OBJECT) | Introspection output line 268 | HIGH |
| KPIs have a `goal` field `{ id, name }` | types.ts line 354 | HIGH |
| UpsertObjectiveMutationInput has `goal` field (ID) | Introspection output line 593 | HIGH |
| UpsertKpiInput has `goal` field (string/UUID) | types.ts line 535 | HIGH |
| Perdoo docs say Strategic Pillars have: name, description, owner(s) | Support docs | MEDIUM |
| Perdoo docs say Superadmin rights needed for pillar CRUD | Support docs | MEDIUM |

### Goals Query Filter Args (Confirmed)

From introspection output lines 1138-1436:

| Filter | Type | Purpose |
|--------|------|---------|
| type | PerdooApiGoalTypeChoices (ENUM) | Filter by goal type (CRITICAL for strategic pillars) |
| type_In | String | Multiple goal types |
| status | PerdooApiGoalStatusChoices (ENUM) | Filter by status |
| status_In | String | Multiple statuses |
| status_Isnull | Boolean | Goals without status |
| stage | ObjectiveStage (ENUM) | Filter by stage (DRAFT/ACTIVE/CLOSED) |
| stage_In | String | Multiple stages |
| lead_Id | UUID | Filter by lead |
| lead_Id_In | String | Multiple leads |
| lead_Id_Isnull | Boolean | Goals without lead |
| timeframe_Id | UUID | Filter by timeframe |
| timeframe_Id_In | String | Multiple timeframes |
| timeframe_Id_Isnull | Boolean | Goals without timeframe |
| currentValue | Float | Filter by current value |
| currentValue_Gte | Float | Min current value |
| currentValue_Lte | Float | Max current value |
| startDate | Date | Filter by start date |
| startDate_Gte | Date | Start date after |
| startDate_Lte | Date | Start date before |
| startDate_Isnull | Boolean | Goals without start date |
| endDate | Date | Filter by end date |
| endDate_Gte | Date | End date after |
| endDate_Lte | Date | End date before |
| endDate_Isnull | Boolean | Goals without end date |
| parent_Id | UUID | Parent goal |
| parent_Id_In | String | Multiple parents |
| parent_Id_Isnull | Boolean | Top-level goals |
| owner | String | Filter by owner |
| user | UUID | Filter by user |
| orderBy | String | Sort order |
| archived | Boolean | Filter archived |
| includeArchived | Boolean | Include archived in results |

### What We DON'T Know (Must Introspect)

1. **Goal type fields** -- Run `{ __type(name: "Goal") { fields { name type { name kind ofType { name kind } } } } }`
2. **PerdooApiGoalTypeChoices enum values** -- What are the type values? (STRATEGIC_PILLAR? OBJECTIVE? KPI?)
3. **PerdooApiGoalStatusChoices enum values** -- What status values exist?
4. **GoalType enum values** -- Same or different from PerdooApiGoalTypeChoices?
5. **Goal mutations** -- Does `upsertGoal` exist? Or `createGoal`? Run `{ __type(name: "Mutation") { fields { name args { name type { name kind ofType { name kind } } } } } }`
6. **Goal mutation input type** -- Name unknown (UpsertGoalMutationInput? CreateGoalInput?)
7. **Permission restrictions** -- Perdoo docs say Superadmin required. Will the API return permission errors?
8. **Goals query return type** -- Does it return GoalConnection? What fields are in the Goal type?

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Initiative CRUD | Separate initiative GraphQL types and operations | Reuse `keyResult` type with `type: "INITIATIVE"` filter | Initiatives ARE key results; separate types create confusion |
| Initiative list query | New query for initiatives | Use `initiatives(...)` root query (pre-filtered by type) | API already provides this dedicated query |
| Initiative mutations | Separate mutation | `upsertKeyResult` with `type: "INITIATIVE"` | No separate initiative mutation exists |
| Goal type discovery | Guess Goal fields | Introspect `__type(name: "Goal")` | Fields must match real schema |
| Goal type filter value | Guess "STRATEGIC_PILLAR" | Introspect `PerdooApiGoalTypeChoices` enum | Wrong type value returns wrong entities |
| Permission handling | Ignore permission errors | Detect and surface permission errors in tool response | Superadmin-only operations need clear error messages |

**Key insight:** The initiative "entity" is purely a UX concept in the MCP tools layer. Underneath, it's entirely powered by the key result infrastructure. The only truly new code is for Strategic Pillars (Goal type).

## Common Pitfalls

### Pitfall 1: Goal Type Polymorphism

**What goes wrong:** Calling `goals(...)` without a type filter and getting ALL goal types (objectives, KPIs, pillars) mixed together.
**Why it happens:** "Goal" in Perdoo is a supertype that encompasses multiple entity types. The `goals` query returns all of them.
**How to avoid:** Always use the `type` filter with the correct enum value for strategic pillars. Discover this value via introspection of `PerdooApiGoalTypeChoices`.
**Warning signs:** Getting objectives or KPIs in strategic pillar list results; unexpected entity counts.

### Pitfall 2: No Goal Mutation Exists

**What goes wrong:** Assuming `upsertGoal` exists and writing operations for it.
**Why it happens:** Pattern from objectives/KRs suggests it. But goals may use a different mutation pattern or may not have a public mutation at all.
**How to avoid:** Introspect the Mutation type first. If no goal mutation exists, the create/update tools cannot be implemented and must be documented as limitations.
**Warning signs:** "Cannot query field 'upsertGoal' on type Mutation" error.

### Pitfall 3: Superadmin Permission Restriction

**What goes wrong:** Tools work in dev/testing (Superadmin token) but fail for regular users.
**Why it happens:** Perdoo documentation explicitly states Superadmin rights are needed for strategic pillar management.
**How to avoid:** Document the permission requirement in tool descriptions. Handle permission errors gracefully with clear messages. Consider making create/update optional if the API blocks non-Superadmin users.
**Warning signs:** Permission denied errors at runtime; inconsistent behavior between accounts.

### Pitfall 4: Initiative Progress Misunderstanding

**What goes wrong:** LLM thinks creating an initiative will move objective progress.
**Why it happens:** Initiatives are under objectives, so natural assumption is they contribute to progress.
**How to avoid:** Tool descriptions must clearly state that initiatives are projects/tasks and do NOT contribute to objective progress (only key results do).
**Warning signs:** User confusion when objective progress doesn't change after initiative completion.

### Pitfall 5: Initiatives Query vs keyResults Query Confusion

**What goes wrong:** Using `keyResults` with `type: "INITIATIVE"` instead of the `initiatives` root query, or vice versa.
**Why it happens:** Both approaches work, but they may differ in edge cases or server-side behavior.
**How to avoid:** Use the dedicated `initiatives(...)` root query for listing initiatives. It's clearer in intent and the API specifically provides it.
**Warning signs:** Subtle differences in returned data or filter behavior.

### Pitfall 6: Goal Fields Unknown at Planning Time

**What goes wrong:** Writing operations assuming Goal has same fields as Objective or KPI.
**Why it happens:** Strategic pillars look like objectives in the UI.
**How to avoid:** MUST introspect `Goal` type before writing operations. The Goal type may have very different fields (simpler -- just name, description, owners per Perdoo docs).
**Warning signs:** GraphQL field errors; null fields where data was expected.

## Introspection Queries Needed

Phase 3 must run these `__type` queries before building strategic pillar tools:

### Priority 1: Goal Type Discovery

```graphql
# Goal type fields (strategic pillar entity)
{ __type(name: "Goal") { name kind fields { name type { name kind ofType { name kind ofType { name kind } } } } } }

# PerdooApiGoalTypeChoices enum (CRITICAL -- needed to filter strategic pillars)
{ __type(name: "PerdooApiGoalTypeChoices") { name kind enumValues { name } } }

# PerdooApiGoalStatusChoices enum
{ __type(name: "PerdooApiGoalStatusChoices") { name kind enumValues { name } } }

# GoalType enum
{ __type(name: "GoalType") { name kind enumValues { name } } }
```

### Priority 2: Goal Mutations Discovery

```graphql
# Check Mutation type for goal-related mutations
# Use targeted field search since full Mutation type may be large
{ __type(name: "Mutation") { name fields { name args { name type { name kind ofType { name kind } } } type { name kind ofType { name kind } } } } }
```

### Priority 3: Goal Mutation Input Types (after finding mutations)

```graphql
# Expected name based on pattern (may not exist):
{ __type(name: "UpsertGoalMutationInput") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }

# Alternative names to try:
{ __type(name: "CreateGoalMutationInput") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }
{ __type(name: "UpdateGoalMutationInput") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }
{ __type(name: "UpsertStrategicPillarMutationInput") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }
```

### Priority 4: Verify Initiative Behavior

```graphql
# Verify initiatives query works and returns expected data
{ initiatives(first: 1) { edges { node { id name type objective { id name } } } } }

# Verify result query works for initiatives
{ result(id: "<known-initiative-id>") { id name type objective { id name } } }
```

## Code Examples

### Initiative Operations (Minimal -- Wraps Key Results)

```typescript
// services/perdoo/operations/initiatives.ts
// Uses the dedicated `initiatives` root query for list
// Uses existing `result` query for get-by-id
// Uses existing `upsertKeyResult` mutation for create/update

/**
 * List initiatives using the dedicated initiatives root query.
 * This query pre-filters to initiative type and returns keyResultConnection.
 */
export const INITIATIVES_QUERY = `
  query ListInitiatives(
    $first: Int,
    $after: String,
    $name_Icontains: String,
    $objective: UUID,
    $lead_Id: UUID,
    $archived: Boolean,
    $status_In: String,
    $objectiveStage: String,
    $timeframe: UUID,
    $orderBy: String
  ) {
    initiatives(
      first: $first,
      after: $after,
      name_Icontains: $name_Icontains,
      objective: $objective,
      lead_Id: $lead_Id,
      archived: $archived,
      status_In: $status_In,
      objectiveStage: $objectiveStage,
      timeframe: $timeframe,
      orderBy: $orderBy
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          id
          name
          description
          progress
          status
          type
          weight
          startValue
          targetValue
          currentValue
          unit
          archived
          startDate
          dueDate
          lead {
            id
            name
          }
          objective {
            id
            name
          }
          timeframe {
            id
            name
          }
        }
      }
    }
  }
`;

// For get-by-id: reuse KEY_RESULT_QUERY (result query)
// For create: reuse UPSERT_KEY_RESULT_MUTATION with type: "INITIATIVE"
// For update: reuse UPSERT_KEY_RESULT_MUTATION with id
```

### Initiative Client Methods

```typescript
// Add to services/perdoo/client.ts

/**
 * Lists initiatives (key results with type INITIATIVE).
 * Uses the dedicated initiatives root query.
 */
async listInitiatives(params?: {
  first?: number;
  after?: string;
  name_Icontains?: string;
  objective?: string;
  lead_Id?: string;
  archived?: boolean;
  status_In?: string;
  objectiveStage?: string;
  timeframe?: string;
  orderBy?: string;
}): Promise<InitiativesData> {
  return this.execute<InitiativesData>(INITIATIVES_QUERY, {
    first: params?.first ?? 20,
    after: params?.after,
    name_Icontains: params?.name_Icontains,
    objective: params?.objective,
    lead_Id: params?.lead_Id,
    archived: params?.archived,
    status_In: params?.status_In,
    objectiveStage: params?.objectiveStage,
    timeframe: params?.timeframe,
    orderBy: params?.orderBy,
  });
}

/**
 * Gets a single initiative by UUID.
 * Uses the same result(id: UUID!) query as key results.
 */
async getInitiative(id: string): Promise<KeyResultData> {
  return this.execute<KeyResultData>(KEY_RESULT_QUERY, { id });
}

/**
 * Creates a new initiative (upsert without id, type set to INITIATIVE).
 */
async createInitiative(input: Omit<UpsertKeyResultInput, 'id' | 'type'>): Promise<UpsertKeyResultData> {
  return this.execute<UpsertKeyResultData>(
    UPSERT_KEY_RESULT_MUTATION,
    { input: { ...input, type: 'INITIATIVE' } },
    { isMutation: true }
  );
}

/**
 * Updates an existing initiative (upsert with id).
 */
async updateInitiative(id: string, input: Omit<UpsertKeyResultInput, 'id'>): Promise<UpsertKeyResultData> {
  return this.execute<UpsertKeyResultData>(
    UPSERT_KEY_RESULT_MUTATION,
    { input: { ...input, id } },
    { isMutation: true }
  );
}
```

### Strategic Pillar Operations (Template -- Requires Introspection)

```typescript
// services/perdoo/operations/strategic-pillars.ts
// NOTE: Fields MUST be updated after __type(name: "Goal") introspection

/**
 * List strategic pillars using the goals query with type filter.
 * The type filter value must be discovered via PerdooApiGoalTypeChoices introspection.
 */
export const STRATEGIC_PILLARS_QUERY = `
  query ListStrategicPillars(
    $first: Int,
    $after: String,
    $type: PerdooApiGoalTypeChoices,
    $status: PerdooApiGoalStatusChoices,
    $lead_Id: UUID,
    $archived: Boolean,
    $orderBy: String
  ) {
    goals(
      first: $first,
      after: $after,
      type: $type,
      status: $status,
      lead_Id: $lead_Id,
      archived: $archived,
      orderBy: $orderBy
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          id
          name
          # ... fields from Goal type introspection
        }
      }
    }
  }
`;

/**
 * Get a single strategic pillar by UUID.
 */
export const STRATEGIC_PILLAR_QUERY = `
  query GetStrategicPillar($id: UUID!) {
    goal(id: $id) {
      id
      name
      # ... fields from Goal type introspection
    }
  }
`;

// Mutation: UNKNOWN -- must discover via __type(name: "Mutation")
// If upsertGoal exists:
// export const UPSERT_STRATEGIC_PILLAR_MUTATION = `...`;
// If no mutation exists: create/update tools cannot be implemented
```

### Initiative Tool Registration Pattern

```typescript
// mcp/tools/initiatives.ts

export function registerInitiativeTools(
  server: McpServer,
  client: PerdooClient
): void {
  server.tool(
    'list_initiatives',
    'List Perdoo initiatives (projects/tasks supporting key results). Can filter by parent objective, lead, status. Returns flattened list.',
    {
      limit: z.number().int().min(1).max(100).default(20)
        .describe('Number of initiatives to return (max 100)'),
      cursor: z.string().optional()
        .describe('Pagination cursor from previous response'),
      objective_id: z.string().optional()
        .describe('Filter by parent objective UUID'),
      name_contains: z.string().optional()
        .describe('Filter by name (case-insensitive)'),
      lead_id: z.string().optional()
        .describe('Filter by lead user UUID'),
      archived: z.boolean().optional()
        .describe('Filter by archived status'),
      status: z.enum(['NO_STATUS', 'OFF_TRACK', 'NEEDS_ATTENTION', 'ON_TRACK', 'ACCOMPLISHED']).optional()
        .describe('Filter by commit status'),
      timeframe_id: z.string().optional()
        .describe('Filter by timeframe UUID'),
      order_by: z.string().optional()
        .describe('Sort field'),
    },
    async (params) => {
      const data = await client.listInitiatives({
        first: params.limit,
        after: params.cursor,
        name_Icontains: params.name_contains,
        objective: params.objective_id,
        lead_Id: params.lead_id,
        archived: params.archived,
        status_In: params.status,
        timeframe: params.timeframe_id,
        orderBy: params.order_by,
      });
      // Same flattening pattern as list_key_results
    }
  );

  server.tool(
    'create_initiative',
    'Create a new initiative (project/task) under a Perdoo objective. Name and objective are required. Initiatives track work that supports key results but do NOT contribute to objective progress.',
    {
      name: z.string().min(1).describe('Initiative name'),
      objective: z.string().describe('Parent objective UUID (required)'),
      description: z.string().optional().describe('Initiative description'),
      lead: z.string().optional().describe('Lead user UUID'),
      // ... other fields
    },
    async (params) => {
      // Calls client.createInitiative (which sets type: "INITIATIVE")
    }
  );
}
```

## Phase Execution Order

### Wave 1: Initiatives (Can ship immediately)

No introspection needed -- all patterns are proven and confirmed.

1. Create `operations/initiatives.ts` with `INITIATIVES_QUERY` (uses `initiatives` root query)
2. Add `InitiativesData` response type to `types.ts`
3. Add initiative client methods to `client.ts` (listInitiatives, getInitiative, createInitiative, updateInitiative)
4. Create `tools/initiatives.ts` with 4 tools
5. Register in `tools/index.ts` + update INSTRUCTIONS_RESOURCE
6. Build and validate

### Wave 2: Strategic Pillars (Requires introspection first)

Must discover Goal type fields, enum values, and mutations before implementation.

**Step 1: Introspect**
1. Run `__type(name: "Goal")` -- discover fields
2. Run `__type(name: "PerdooApiGoalTypeChoices")` -- discover type filter value for strategic pillars
3. Run `__type(name: "PerdooApiGoalStatusChoices")` -- discover status values
4. Run `__type(name: "GoalType")` -- discover goal type enum
5. Run `__type(name: "Mutation")` -- discover goal mutations (if any)
6. If mutation found: introspect input type

**Step 2: Implement (based on introspection results)**
1. Create `operations/strategic-pillars.ts` with corrected queries/mutations
2. Add StrategicPillar type to `types.ts`
3. Add client methods to `client.ts`
4. Create `tools/strategic-pillars.ts` with tools (4 if mutations exist, 2 if read-only)
5. Register in `tools/index.ts` + update INSTRUCTIONS_RESOURCE
6. Build and validate

**If no goal mutation exists:** Implement only `list_strategic_pillars` and `get_strategic_pillar` (read-only). Document this as a limitation. The success criteria say "create and update strategic pillars (subject to API permission constraints)" -- if no mutation exists, that constraint is "not possible via API."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate initiative entity type | Initiative = KeyResult with type field | Phase 2 discovery | No new GraphQL type needed |
| Guess Goal query name | `goals(...)` confirmed from introspection | Phase 1 introspection | Use `goals` not `strategicPillars` |
| Assume upsertGoal exists | Unknown -- must introspect | Phase 3 | May be read-only entity |

## Open Questions

### Critical (Must Resolve Before Implementation)

1. **What are the PerdooApiGoalTypeChoices enum values?**
   - What we know: It's an enum used to filter `goals` query by type
   - What's unclear: What value represents "Strategic Pillar"
   - Recommendation: Introspect this enum first. Without it, cannot filter goals to get pillars only.
   - Risk: If no distinct "strategic pillar" type exists, the `goals` query may not cleanly separate pillars from other goal types.

2. **Does a Goal mutation exist?**
   - What we know: No mutation was found in prior introspection output (mutations not captured)
   - What's unclear: Whether `upsertGoal`, `createGoal`, or similar exists
   - Recommendation: Introspect Mutation type. If no mutation: tools are read-only.
   - Impact: Determines whether PILLAR-03 and PILLAR-04 requirements can be met.

3. **What fields does the Goal type have?**
   - What we know: Perdoo docs mention name, description, owner(s). Objective's `goal` field returns `{ id, name }`.
   - What's unclear: Full field list, relationships, nullable fields
   - Recommendation: Must run `__type(name: "Goal")` before writing operations.

### Important (Should Resolve)

4. **Is `GoalType` the same as `PerdooApiGoalTypeChoices`?**
   - What we know: Both are enums, both relate to goal types
   - What's unclear: Whether they have the same values or serve different purposes
   - Recommendation: Introspect both. GoalType may be a superset used in the `recommendedGoalStatus` query.

5. **Will non-Superadmin tokens get permission errors?**
   - What we know: Perdoo docs say Superadmin needed for pillar management
   - What's unclear: Whether the API returns a permission error or silently fails
   - Recommendation: Document the restriction. Handle permission errors in tool responses.

6. **What does `goalTypes` (no-args query) return?**
   - What we know: It exists as a root query with no arguments
   - What's unclear: Return type, what information it provides
   - Recommendation: Try executing it during introspection phase.

## Sources

### Primary (HIGH confidence)
- Phase 1 introspection output: `.planning/phases/01-foundation-objectives/introspection-output.json`
  - `initiatives` on objective type returns keyResultConnection (line 380)
  - `initiatives` root query with full filter args (lines 5386-5828)
  - `goal` field on objective type returns Goal OBJECT (line 268)
  - `goal(id: UUID!)` singular query (line 1122)
  - `goals(...)` plural query with all filter args (lines 1138-1436)
  - `PerdooApiGoalTypeChoices` enum reference (line 1183)
  - `PerdooApiGoalStatusChoices` enum reference (line 1199)
  - `GoalType` enum in recommendedGoalStatus (line 1458)
  - `goalTypes` no-args query (line 8534)
  - `goal` field in UpsertObjectiveMutationInput as ID scalar (line 593)

- Existing codebase (Phase 2 implementation):
  - `src/services/perdoo/types.ts` -- KeyResultType enum has KEY_RESULT | INITIATIVE
  - `src/services/perdoo/types.ts` -- UpsertKeyResultInput has `type` field
  - `src/services/perdoo/operations/key-results.ts` -- proven query patterns
  - `src/mcp/tools/key-results.ts` -- tool registration with type filter
  - `src/services/perdoo/client.ts` -- client method patterns

### Secondary (MEDIUM confidence)
- Perdoo Support: Strategic Pillars article (https://support.perdoo.com/en/articles/4725666-strategic-pillars)
  - Name, description, owner(s) fields
  - Superadmin required for creation/modification
  - Can be archived/restored
  - Not time-bound (unlike OKRs)
  - Success measured through KPIs

- Perdoo Support: Add Initiatives (https://support.perdoo.com/en/articles/3625166-add-initiatives)
  - Initiatives are hypotheses for achieving key results
  - Can nest under key results or other initiatives
  - Support tracking types (Binary, Milestone, Increase to, etc.)
  - Do NOT contribute to objective progress

### Tertiary (LOW confidence)
- Goal mutation existence (not found, but Mutation type not captured in introspection)
- PerdooApiGoalTypeChoices enum values (not introspected)
- Goal type field list (not introspected)
- Perdoo API docs at api-docs.perdoo.com (redirects to Apollo Studio, requires auth)

## Metadata

**Confidence breakdown:**
- Initiatives architecture: HIGH - Confirmed from code and introspection
- Initiative tool pattern: HIGH - Direct reuse of proven key result pattern
- Strategic pillar query names: HIGH - Confirmed from introspection
- Strategic pillar type/fields: LOW - Must introspect Goal type
- Strategic pillar mutations: LOW - Not found, may not exist
- Goal type filter value: LOW - PerdooApiGoalTypeChoices not introspected

**Research date:** 2026-01-23
**Valid until:** 60 days (initiative pattern stable; strategic pillar schema may evolve)
