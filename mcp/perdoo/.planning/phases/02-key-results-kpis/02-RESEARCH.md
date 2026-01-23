# Phase 2: Key Results + KPIs - Research

**Researched:** 2026-01-23
**Domain:** Perdoo GraphQL Key Results & KPIs CRUD via MCP tools
**Confidence:** MEDIUM (pattern proven in Phase 1, but entity-specific fields/mutations need introspection)

## Summary

This phase replicates the proven Phase 1 pattern (introspect -> operations -> tools) for two new entity types: Key Results and KPIs. The core architecture, resilience stack, and tool registration patterns are identical -- the work is purely entity-specific: discovering fields, mutations, and filters for each type via `__type` queries, then wiring operations and tools.

The Phase 1 introspection output already reveals significant information about query arguments (filters) for both `keyResults` and `allKpis` queries, plus the fact that `kpi(id: UUID!)` exists as a root query. However, the full type fields for `keyResult` and `kpi` types, their mutation names and input types, and relevant enums have NOT been introspected yet. These MUST be discovered before operations can be written.

**Primary recommendation:** Run targeted `__type` queries for `keyResult`, `kpi`, `Mutation` (to find KR/KPI mutations), and mutation input types. Then replicate the objectives pattern exactly for each entity.

## Standard Stack

No new libraries needed. Phase 2 uses the identical stack from Phase 1.

### What To Reuse (Copy Pattern From)

| Source File | Pattern | How to Replicate |
|-------------|---------|------------------|
| `operations/objectives.ts` | Query/mutation string constants | Create `operations/key-results.ts` and `operations/kpis.ts` |
| `types.ts` (Objective, UpsertObjectiveInput) | Type interfaces | Add KeyResult, KPI, and their input types |
| `client.ts` (listObjectives, getObjective, etc.) | Typed client methods | Add listKeyResults, getKeyResult, createKeyResult, updateKeyResult, listKpis, getKpi, createKpi, updateKpi |
| `tools/objectives.ts` | Tool registration with Zod schemas | Create `tools/key-results.ts` and `tools/kpis.ts` |
| `tools/index.ts` | Tool registration + instructions | Add registerKeyResultTools + registerKpiTools calls, update INSTRUCTIONS_RESOURCE |

## Architecture Patterns

### Pattern Replication: Objectives -> Key Results + KPIs

The Phase 1 pattern is fully proven. Each new entity follows these steps:

```
1. Introspect via __type queries:
   - { __type(name: "keyResult") { fields { name type { ... } } } }
   - { __type(name: "kpi") { fields { name type { ... } } } }
   - Discover mutations on Mutation type
   - Discover input types (UpsertKeyResultMutationInput, UpsertKpiMutationInput)

2. Create operations file with query/mutation constants
3. Add types to types.ts
4. Add client methods to client.ts
5. Create tool registration file
6. Register in tools/index.ts + update instructions
```

### Project Structure After Phase 2

```
src/
├── services/perdoo/
│   ├── operations/
│   │   ├── introspection.ts      (existing)
│   │   ├── objectives.ts         (existing)
│   │   ├── key-results.ts        (NEW)
│   │   └── kpis.ts               (NEW)
│   ├── client.ts                 (MODIFIED - add KR/KPI methods)
│   └── types.ts                  (MODIFIED - add KR/KPI types)
├── mcp/tools/
│   ├── objectives.ts             (existing)
│   ├── key-results.ts            (NEW)
│   ├── kpis.ts                   (NEW)
│   └── index.ts                  (MODIFIED - register new tools)
└── scripts/
    └── introspect.ts             (MODIFIED or new script for KR/KPI introspection)
```

### Key Architectural Decisions (Carried from Phase 1)

| Decision | Implication for Phase 2 |
|----------|------------------------|
| Upsert mutation pattern | KR/KPI mutations likely `upsertKeyResult`/`upsertKpi` (same pattern as objectives) |
| UUID scalar IDs | All entity IDs are UUID format, not generic ID |
| Django-style filters | KR/KPI list queries use `name_Icontains`, `lead_Id`, etc. |
| Relay pagination | All list queries return connection type with pageInfo + edges |
| Mutations never retried | createKeyResult/updateKeyResult/createKpi/updateKpi all set `isMutation: true` |
| Flatten for LLM | Tool responses strip edges/node wrappers |

## Entity Analysis: Key Results

### What We Know (HIGH confidence - from Phase 1 introspection)

**Query: `keyResults`** (list query with relay pagination)

Available filter arguments (ALL confirmed from introspection output):

| Arg | Type | Purpose |
|-----|------|---------|
| offset, before, after, first, last | Standard | Relay pagination |
| name_Icontains | String | Case-insensitive name search |
| name_Contains | String | Case-sensitive name search |
| objective_Timeframe_Id | UUID | Filter by parent objective's timeframe |
| objective_Timeframe_Id_In | String | Multiple timeframe IDs |
| objective_Groups_Id | UUID | Filter by parent objective's group |
| objective_Groups_Id_In | String | Multiple group IDs |
| lead_Id | UUID | Filter by lead user |
| lead_Id_In | String | Multiple lead IDs |
| tags_Id | String | Filter by tag |
| tags_Id_In | String | Multiple tag IDs |
| type_In | String | Filter by KR type (comma-separated) |
| type | String | Filter by single KR type |
| parent | UUID | Filter by parent KR |
| parent_In | String | Multiple parent KR IDs |
| parent_Isnull | Boolean | Filter KRs with/without parent |
| createdDate_Gte | DateTime | Created after date |
| createdDate_Lte | DateTime | Created before date |
| timeframe | UUID | Filter by timeframe |
| timeframes | String | Multiple timeframes |
| contributors | String | Filter by contributor |
| archived | Boolean | Filter archived/active |
| normalizedValue | String | Filter by normalized progress value |
| status_In | String | Filter by commit status |
| excludeAccomplished | Boolean | Exclude accomplished KRs |
| objective_Owner | String | Filter by objective owner |
| objectiveStage | String | Filter by objective stage |
| objective | UUID | Filter by parent objective ID |
| objective_In | String | Multiple objective IDs |
| private | Boolean | Filter private/public |
| isOutdated | Boolean | Filter outdated KRs |
| expectedProgress | String | Filter by expected progress |
| includeSubGoals | Boolean | Include sub-goal KRs |
| objective_Name | String | Filter by objective name |
| objective_ProgressMin | Decimal | Min objective progress |
| objective_ProgressMax | Decimal | Max objective progress |
| objective_Lead_Id | UUID | Filter by objective lead |
| objective_Lead_Id_In | String | Multiple objective lead IDs |
| objective_Contributors | String | Filter by objective contributors |
| objective_Tags_Id | String | Filter by objective tags |
| objective_Parent_Id | String | Filter by objective parent |
| objective_AlignedTo | String | Filter by objective alignment |
| objective_StatusFinal | String | Filter by objective final status |
| excludeIds | String | Exclude specific IDs |
| startDateAfter | DateTime | Start date after |
| dueDateBefore | DateTime | Due date before |
| progressMin | Decimal | Min progress value |
| progressMax | Decimal | Max progress value |
| userProfile | UUID | Filter by user profile |
| orderBy | String | Sort order |

**Key finding: No singular `keyResult(id: UUID!)` query visible in the Query type.**

The Query root type shows `keyResults(...)` and `initiatives(...)` but no singular `keyResult` query. This means:
- Get-by-ID might not be a direct root query
- Alternatives: filter `keyResults(objective: <uuid>)` list to a single result, OR there might be a `goal(id: UUID!)` query that works for KRs too (since Goals seem to be a supertype)
- This MUST be confirmed during introspection -- try `{ __type(name: "Query") { fields { name } } }` to get the complete list

**The `initiatives` query has identical args to `keyResults`** -- this suggests Key Results and Initiatives share the same underlying type (different `type` field values).

### What We Know About Key Result Fields (MEDIUM confidence)

From the objective type, `keyResults` returns a `keyResultConnection` with nodes having at least `id` and `name`. The full field list needs `__type(name: "keyResult")` introspection.

From the filter arguments and the objective's `results` field (which returns keyResultConnection with nodes having `name`, `type`, `normalizedValue`, `status`), we can infer likely fields:

| Field | Type (Inferred) | Confidence |
|-------|-----------------|------------|
| id | UUID! | HIGH (all entities have this) |
| name | String! | HIGH (from query results) |
| type | Enum/String | HIGH (filter exists: `type`, `type_In`) |
| normalizedValue | String/Float | MEDIUM (from objective.results selection) |
| status | CommitStatus enum | MEDIUM (from objective.results selection) |
| objective | objective (OBJECT) | HIGH (filter: `objective` UUID) |
| lead | user (OBJECT) | HIGH (filter: `lead_Id`) |
| parent | keyResult (OBJECT) | HIGH (filter: `parent`) |
| timeframe | timeframe (OBJECT) | MEDIUM (filter: `timeframe`) |
| progress | Float | MEDIUM (filter: `progressMin/Max`) |
| archived | Boolean | HIGH (filter exists) |
| private | Boolean | HIGH (filter exists) |
| startDate | DateTime | MEDIUM (filter: `startDateAfter`) |
| dueDate | DateTime | MEDIUM (filter: `dueDateBefore`) |
| createdDate | DateTime | HIGH (filter: `createdDate_Gte/Lte`) |
| contributors | userConnection | MEDIUM (filter: `contributors`) |
| tags | tagConnection | HIGH (filter: `tags_Id`) |

### What We DON'T Know (Must Introspect)

1. **Full `keyResult` type fields** -- Run `__type(name: "keyResult")`
2. **Whether a singular `keyResult(id: UUID!)` root query exists** -- Verify from full Query type
3. **Mutation name** -- Likely `upsertKeyResult` based on pattern, but must check Mutation type
4. **Input type name** -- Likely `UpsertKeyResultMutationInput` based on pattern
5. **Input type fields** -- What fields can be set on create/update
6. **`PerdooApiKeyResultTypeChoices` enum values** -- Referenced in objectives query filter

## Entity Analysis: KPIs

### What We Know (HIGH confidence - from Phase 1 introspection)

**Query: `kpi(id: UUID!)`** -- singular query EXISTS (confirmed from introspection)

**Query: `allKpis`** (list query with relay pagination)

Available filter arguments (ALL confirmed from introspection output):

| Arg | Type | Purpose |
|-----|------|---------|
| offset, before, after, first, last | Standard | Relay pagination |
| company_Id | UUID | Filter by company |
| company_Id_In | String | Multiple company IDs |
| createdDate_Gte | DateTime | Created after date |
| createdDate_Lte | DateTime | Created before date |
| lead | UUID | Filter by lead user |
| lead_In | String | Multiple lead users |
| lead_Id | UUID | Filter by lead user ID |
| lead_Id_In | String | Multiple lead IDs |
| name_Icontains | String | Case-insensitive name search |
| name_Contains | String | Case-sensitive name search |
| goal_Id | UUID | Filter by goal/objective |
| goal_Id_In | String | Multiple goal IDs |
| parent | UUID | Filter by parent KPI |
| parent_In | String | Multiple parent KPIs |
| parent_Id | String | Filter by parent KPI ID |
| parent_Id_In | String | Multiple parent IDs |
| tags_Id | String | Filter by tag |
| tags_Id_In | String | Multiple tag IDs |
| private | Boolean | Filter private/public |
| group | UUID | Filter by group |
| isCompanyGoal | Boolean | Filter company-level KPIs |
| groupId | UUID | Filter by group (alternate) |
| groupsType | String | Filter by group type |
| createdDatePreset | String | Preset date filter |
| lastCommitStatus_In | String | Filter by last commit status |
| owner | String | Filter by owner |
| status_In | String | Filter by status |
| goal_Id_NotIn | String | Exclude specific goal IDs |
| alignedTo | String | Filter by alignment |
| hasParent | Boolean | Filter KPIs with/without parent |
| isOutdated | Boolean | Filter outdated KPIs |
| archived | Boolean | Filter archived/active |
| orderBy | String | Sort order |

### KPI-Related Queries (Out of scope for Phase 2 but noted)

- `allKpiBoards(...)` -- KPI boards (filtered by name)
- `kpiBoard(id: UUID!)` -- single board
- `allKpiTargets(...)` -- KPI targets (filtered by activeBefore/activeAfter)
- `kpiTarget(id: UUID!)` -- single target

These are NOT in scope for Phase 2 but may be relevant for future phases.

### What We Know About KPI Fields (MEDIUM confidence)

From the objective type having a `kpi` field of type `kpi` (OBJECT), and from the filter arguments:

| Field | Type (Inferred) | Confidence |
|-------|-----------------|------------|
| id | UUID! | HIGH (all entities have this) |
| name | String! | HIGH (filter: name_Icontains) |
| lead | user (OBJECT) | HIGH (filter: lead_Id) |
| company | company (OBJECT) | HIGH (filter: company_Id) |
| parent | kpi (OBJECT) | HIGH (filter: parent) |
| tags | tagConnection | HIGH (filter: tags_Id) |
| private | Boolean | HIGH (filter exists) |
| isCompanyGoal | Boolean | HIGH (filter exists) |
| archived | Boolean | HIGH (filter exists) |
| createdDate | DateTime | HIGH (filter: createdDate_Gte/Lte) |
| goal | Goal/objective | MEDIUM (filter: goal_Id) |
| groups | groupConnection | MEDIUM (filter: group/groupId) |
| status/lastCommitStatus | Enum | MEDIUM (filter: status_In, lastCommitStatus_In) |
| isOutdated | Boolean | MEDIUM (filter exists) |

### What We DON'T Know (Must Introspect)

1. **Full `kpi` type fields** -- Run `__type(name: "kpi")`
2. **Mutation name** -- Likely `upsertKpi` based on pattern
3. **Input type name** -- Likely `UpsertKpiMutationInput`
4. **Input type fields** -- What fields can be set on create/update
5. **KPI value/measurement fields** -- KPIs track metrics; what are the value fields?
6. **KPI target relationship** -- How do KPI targets relate to KPIs?

## Introspection Queries Needed

Phase 2 must run these `__type` queries before writing operations:

### Priority 1: Type Fields

```graphql
# Key Result type fields
{ __type(name: "keyResult") { name kind fields { name type { name kind ofType { name kind ofType { name kind } } } } } }

# KPI type fields
{ __type(name: "kpi") { name kind fields { name type { name kind ofType { name kind ofType { name kind } } } } } }
```

### Priority 2: Mutations Discovery

```graphql
# Full mutation type to find KR/KPI mutations
{ __type(name: "Mutation") { name fields { name args { name type { name kind ofType { name kind } } } type { name kind ofType { name kind } } } } }
```

### Priority 3: Input Types (after finding mutation names)

```graphql
# Expected names based on objective pattern:
{ __type(name: "UpsertKeyResultMutationInput") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }

{ __type(name: "UpsertKpiMutationInput") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }
```

### Priority 4: Enums

```graphql
# Key Result type choices (referenced in objectives filter)
{ __type(name: "PerdooApiKeyResultTypeChoices") { name kind enumValues { name } } }

# Any KPI-specific enums (discover from mutation/type fields)
```

### Priority 5: Verify Query Existence

```graphql
# Check if singular keyResult query exists (not visible in prior output)
# Try direct execution:
{ keyResult(id: "<known-kr-id>") { id name } }
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key Result CRUD operations | Custom GraphQL strings from guessing | Introspected schema-matching operations | Phase 1 proved guessed operations fail; must match real schema |
| Type definitions | Inferred interfaces | Fields from `__type` query results | Mismatched types cause runtime errors |
| Filter parameter names | REST-style naming | Django-style from introspection (name_Icontains, lead_Id) | Perdoo uses Django GraphQL conventions |
| Pagination handling | Custom cursor logic | Copy relay flattening from objectives | Same pattern, different entity |
| Error handling | New error types | Reuse PerdooApiError + handleToolError | Same GraphQL error structure |
| Rate limiting | Separate per-entity limits | Shared TokenBucket(30, 3) | Same API, same rate limits |

**Key insight:** Phase 2 is purely additive -- no new infrastructure, patterns, or libraries. The only new code is entity-specific operations, types, and tool registrations following the exact same template.

## Common Pitfalls

### Pitfall 1: No Singular `keyResult` Query

**What goes wrong:** Assuming `keyResult(id: UUID!)` exists like `kpi(id: UUID!)` and `objective(id: UUID!)`.
**Why it happens:** Pattern suggests it should exist, but it's not visible in the Query type output.
**How to avoid:** During introspection, check the full Mutation/Query type. If no singular query exists, implement `getKeyResult` by filtering `keyResults` list with specific ID or using `goal(id: UUID!)` if KRs are a subtype of Goal.
**Warning signs:** GraphQL error "Cannot query field keyResult on type Query".

### Pitfall 2: Assuming upsertKeyResult Exists

**What goes wrong:** Writing operations assuming `upsertKeyResult` mutation exists without checking.
**Why it happens:** Pattern from objectives suggests it. But could be `createKeyResult`/`updateKeyResult` or entirely different.
**How to avoid:** Introspect the Mutation type first. Get the real mutation name and input type.
**Warning signs:** Mutation not found error.

### Pitfall 3: Key Results vs Initiatives Confusion

**What goes wrong:** Not understanding that `keyResults` and `initiatives` queries have identical filter signatures and both return `keyResultConnection`.
**Why it happens:** The objective type has both `keyResults`, `results`, and `initiatives` fields, all returning keyResultConnection.
**How to avoid:** Introspect the `keyResult` type to understand the `type` field (likely distinguishes KRs from Initiatives). The `PerdooApiKeyResultTypeChoices` enum likely has values like "KEY_RESULT" and "INITIATIVE".
**Warning signs:** Getting initiatives when expecting only key results, or vice versa.

### Pitfall 4: KPI Value Fields Unknown

**What goes wrong:** Creating KPI tools without understanding how KPI values/measurements work.
**Why it happens:** KPIs are metric-tracking entities with current value, target, unit concepts that aren't obvious from filters alone.
**How to avoid:** Introspect the full `kpi` type. Look for fields like `currentValue`, `targetValue`, `unit`, `format`, or related concepts.
**Warning signs:** KPI tools that can't display meaningful metric data.

### Pitfall 5: Missing Objective Reference on Key Result Creation

**What goes wrong:** Creating a key result without specifying the parent objective.
**Why it happens:** If the mutation input has `objective` as optional (like all other fields in UpsertObjectiveMutationInput), a KR might be created orphaned.
**How to avoid:** Examine the input type carefully. If `objective` is required for creation, make it required in the create_key_result tool schema. If optional, add clear tool description that it should be provided.
**Warning signs:** Key results created without parent objective link.

### Pitfall 6: `allKpis` vs `kpis` Query Naming

**What goes wrong:** Using `kpis` as the list query name instead of `allKpis`.
**Why it happens:** Pattern from objectives uses `objectives` (plural), but KPIs use `allKpis` (prefixed with "all").
**How to avoid:** The introspection output confirms the query name is `allKpis`, not `kpis`. Use this exact name.
**Warning signs:** Query not found error.

## Code Examples

### Key Result Operations (Template - Pre-Introspection)

```typescript
// services/perdoo/operations/key-results.ts
// NOTE: Field selections and mutation names MUST be updated after introspection

export const KEY_RESULTS_QUERY = `
  query ListKeyResults(
    $first: Int,
    $after: String,
    $objective: UUID,
    $name_Icontains: String,
    $lead_Id: UUID,
    $type: String,
    $archived: Boolean,
    $status_In: String,
    $objectiveStage: String
  ) {
    keyResults(
      first: $first,
      after: $after,
      objective: $objective,
      name_Icontains: $name_Icontains,
      lead_Id: $lead_Id,
      type: $type,
      archived: $archived,
      status_In: $status_In,
      objectiveStage: $objectiveStage
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
          # ... fields from introspection
        }
      }
    }
  }
`;

// Singular query - MAY NOT EXIST, needs verification
// If it doesn't exist, use keyResults with ID filter or goal query
export const KEY_RESULT_QUERY = `
  query GetKeyResult($id: UUID!) {
    keyResult(id: $id) {
      id
      name
      # ... full fields from introspection
    }
  }
`;

// Mutation - name likely upsertKeyResult based on pattern
export const UPSERT_KEY_RESULT_MUTATION = `
  mutation UpsertKeyResult($input: UpsertKeyResultMutationInput!) {
    upsertKeyResult(input: $input) {
      keyResult {
        id
        name
        # ... fields from introspection
      }
      errors {
        field
        messages
      }
      clientMutationId
    }
  }
`;
```

### KPI Operations (Template - Pre-Introspection)

```typescript
// services/perdoo/operations/kpis.ts

export const KPIS_QUERY = `
  query ListKpis(
    $first: Int,
    $after: String,
    $name_Icontains: String,
    $lead_Id: UUID,
    $group: UUID,
    $archived: Boolean,
    $status_In: String,
    $isCompanyGoal: Boolean
  ) {
    allKpis(
      first: $first,
      after: $after,
      name_Icontains: $name_Icontains,
      lead_Id: $lead_Id,
      group: $group,
      archived: $archived,
      status_In: $status_In,
      isCompanyGoal: $isCompanyGoal
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
          # ... fields from introspection
        }
      }
    }
  }
`;

export const KPI_QUERY = `
  query GetKpi($id: UUID!) {
    kpi(id: $id) {
      id
      name
      # ... full fields from introspection
    }
  }
`;

export const UPSERT_KPI_MUTATION = `
  mutation UpsertKpi($input: UpsertKpiMutationInput!) {
    upsertKpi(input: $input) {
      kpi {
        id
        name
        # ... fields from introspection
      }
      errors {
        field
        messages
      }
      clientMutationId
    }
  }
`;
```

### Client Methods (Template)

```typescript
// Add to services/perdoo/client.ts

// Key Result methods
async listKeyResults(params?: {
  first?: number;
  after?: string;
  objective?: string;  // Parent objective UUID
  name_Icontains?: string;
  lead_Id?: string;
  type?: string;
  archived?: boolean;
  status_In?: string;
  objectiveStage?: string;
}): Promise<KeyResultsData> {
  return this.execute<KeyResultsData>(KEY_RESULTS_QUERY, {
    first: params?.first ?? 20,
    after: params?.after,
    objective: params?.objective,
    name_Icontains: params?.name_Icontains,
    lead_Id: params?.lead_Id,
    type: params?.type,
    archived: params?.archived,
    status_In: params?.status_In,
    objectiveStage: params?.objectiveStage,
  });
}

async getKeyResult(id: string): Promise<KeyResultData> {
  // Implementation depends on whether singular query exists
  return this.execute<KeyResultData>(KEY_RESULT_QUERY, { id });
}

async createKeyResult(input: Omit<UpsertKeyResultInput, 'id'>): Promise<UpsertKeyResultData> {
  return this.execute<UpsertKeyResultData>(
    UPSERT_KEY_RESULT_MUTATION,
    { input },
    { isMutation: true }
  );
}

async updateKeyResult(id: string, input: Omit<UpsertKeyResultInput, 'id'>): Promise<UpsertKeyResultData> {
  return this.execute<UpsertKeyResultData>(
    UPSERT_KEY_RESULT_MUTATION,
    { input: { ...input, id } },
    { isMutation: true }
  );
}

// KPI methods
async listKpis(params?: {
  first?: number;
  after?: string;
  name_Icontains?: string;
  lead_Id?: string;
  group?: string;
  archived?: boolean;
  status_In?: string;
  isCompanyGoal?: boolean;
}): Promise<KpisData> {
  return this.execute<KpisData>(KPIS_QUERY, {
    first: params?.first ?? 20,
    after: params?.after,
    name_Icontains: params?.name_Icontains,
    lead_Id: params?.lead_Id,
    group: params?.group,
    archived: params?.archived,
    status_In: params?.status_In,
    isCompanyGoal: params?.isCompanyGoal,
  });
}

async getKpi(id: string): Promise<KpiData> {
  return this.execute<KpiData>(KPI_QUERY, { id });
}

async createKpi(input: Omit<UpsertKpiInput, 'id'>): Promise<UpsertKpiData> {
  return this.execute<UpsertKpiData>(
    UPSERT_KPI_MUTATION,
    { input },
    { isMutation: true }
  );
}

async updateKpi(id: string, input: Omit<UpsertKpiInput, 'id'>): Promise<UpsertKpiData> {
  return this.execute<UpsertKpiData>(
    UPSERT_KPI_MUTATION,
    { input: { ...input, id } },
    { isMutation: true }
  );
}
```

### Tool Registration Pattern (Template)

```typescript
// mcp/tools/key-results.ts

export function registerKeyResultTools(
  server: McpServer,
  client: PerdooClient
): void {
  // list_key_results
  server.tool(
    'list_key_results',
    'List Perdoo key results with pagination and filters. Can filter by parent objective, lead, type, status. Returns flattened list.',
    {
      limit: z.number().int().min(1).max(100).default(20)
        .describe('Number of key results to return (max 100)'),
      cursor: z.string().optional()
        .describe('Pagination cursor for next page'),
      objective_id: z.string().optional()
        .describe('Filter by parent objective UUID'),
      name_contains: z.string().optional()
        .describe('Filter by name (case-insensitive)'),
      lead_id: z.string().optional()
        .describe('Filter by lead user UUID'),
      // ... more filters from introspection
    },
    async (params) => {
      // Same pattern as list_objectives
    }
  );

  // get_key_result
  server.tool(
    'get_key_result',
    'Get a single key result by UUID with full details.',
    {
      id: z.string().describe('The key result UUID'),
    },
    async (params) => {
      // Same pattern as get_objective
    }
  );

  // create_key_result
  server.tool(
    'create_key_result',
    'Create a new key result under an objective.',
    {
      name: z.string().min(1).describe('Key result name'),
      objective: z.string().describe('Parent objective UUID (required)'),
      // ... fields from introspection
    },
    async (params) => {
      // Same pattern as create_objective
    }
  );

  // update_key_result
  server.tool(
    'update_key_result',
    'Update an existing key result by UUID.',
    {
      id: z.string().describe('Key result UUID to update'),
      // ... optional fields from introspection
    },
    async (params) => {
      // Same pattern as update_objective
    }
  );
}
```

## Entity Relationships

### Key Result -> Objective (Parent Reference)

From the introspection, the `keyResults` query has an `objective` filter (UUID type). This means:
- Key Results belong to an Objective
- The `objective` field on the key result type likely references back to the parent
- When creating a KR, the `objective` field in the input type specifies the parent

Additionally, the objective type has:
- `keyResults` field (keyResultConnection) -- KRs under this objective
- `results` field (keyResultConnection) -- appears to be the same connection
- `initiatives` field (keyResultConnection) -- suggests initiatives ARE key results with type "INITIATIVE"

### KPI -> Goal/Objective

From the introspection, `allKpis` has `goal_Id` filter (UUID). The objective type has a `kpi` field (kpi OBJECT). This suggests:
- KPIs can be linked to objectives/goals
- The relationship is optional (filter exists but field may be nullable)

### Key Result Hierarchy

- `parent` filter (UUID) on keyResults query
- `parent_Isnull` filter (Boolean)
- Key Results can have parent Key Results (hierarchy)

### KPI Hierarchy

- `parent` filter (UUID) on allKpis query
- `hasParent` filter (Boolean)
- KPIs can have parent KPIs (hierarchy)

## Phase Execution Order

### Sub-phase 1: Introspection (Must complete first)

Run targeted `__type` queries to discover:
1. `keyResult` type full fields
2. `kpi` type full fields
3. Mutation type (full list to find KR/KPI mutations)
4. Input types for discovered mutations
5. Relevant enums (`PerdooApiKeyResultTypeChoices`, any KPI enums)
6. Verify whether `keyResult(id: UUID!)` singular query exists

### Sub-phase 2: Key Results Implementation

1. Create `operations/key-results.ts` with corrected queries/mutations
2. Add KeyResult types to `types.ts`
3. Add client methods to `client.ts`
4. Create `tools/key-results.ts` with 4 tools
5. Register in `tools/index.ts`

### Sub-phase 3: KPIs Implementation

1. Create `operations/kpis.ts` with corrected queries/mutations
2. Add KPI types to `types.ts`
3. Add client methods to `client.ts`
4. Create `tools/kpis.ts` with 4 tools
5. Register in `tools/index.ts`

### Sub-phase 4: Update Instructions + Validate

1. Update INSTRUCTIONS_RESOURCE with KR/KPI tool docs
2. Build and type-check
3. Validate against real API

## Open Questions

Things that can ONLY be resolved at implementation time (during introspection):

1. **Does `keyResult(id: UUID!)` singular query exist?**
   - What we know: Not visible in the Query type fields from prior introspection
   - What's unclear: Might exist but wasn't captured, or might need alternate approach
   - Recommendation: Try the query. If it fails, use `goal(id: UUID!)` or filter `keyResults` by ID

2. **What are the KR/KPI mutation names?**
   - What we know: Pattern suggests `upsertKeyResult` and `upsertKpi`
   - What's unclear: Could be different naming (create/update separate, or entirely different)
   - Recommendation: Introspect Mutation type to find all mutation names

3. **What is `PerdooApiKeyResultTypeChoices`?**
   - What we know: Referenced as filter enum on objectives query (`keyResults_Type`)
   - What's unclear: Exact enum values (likely KEY_RESULT, INITIATIVE, maybe more)
   - Recommendation: Introspect this enum type

4. **What value/measurement fields do KPIs have?**
   - What we know: KPIs track metrics, must have current/target values
   - What's unclear: Field names, types (Decimal? Float?), units, formats
   - Recommendation: Full `kpi` type introspection reveals this

5. **Is `objective` required for KR creation?**
   - What we know: Filter exists, relationship is clear
   - What's unclear: Whether mutation input makes it required or optional
   - Recommendation: Check input type after discovering mutation name

6. **How do KPI Targets relate to KPIs?**
   - What we know: `allKpiTargets` query exists with date filters
   - What's unclear: Whether targets are embedded in KPI or separate entity
   - Recommendation: Introspect `kpiTarget` type if KPI fields reference it

## Sources

### Primary (HIGH confidence)
- Phase 1 introspection output: `/mcp/perdoo/.planning/phases/01-foundation-objectives/introspection-output.json`
  - Full `keyResults` query filter args (lines 4941-5383)
  - Full `initiatives` query filter args (identical to keyResults, lines 5385-5828)
  - Full `allKpis` query filter args (lines 7587-7894)
  - `kpi(id: UUID!)` query signature (lines 7571-7585)
  - `allKpiBoards`, `allKpiTargets` queries (lines 7400-7569)
  - Objective type has `kpi` field (kpi OBJECT) and `keyResults` field (keyResultConnection)
  - `PerdooApiKeyResultTypeChoices` enum referenced in filter args

- Phase 1 implementation source code:
  - `src/services/perdoo/operations/objectives.ts` -- proven query/mutation pattern
  - `src/services/perdoo/types.ts` -- type interface pattern
  - `src/services/perdoo/client.ts` -- typed method pattern
  - `src/mcp/tools/objectives.ts` -- tool registration pattern
  - `src/mcp/tools/index.ts` -- server setup with instructions

### Secondary (MEDIUM confidence)
- Phase 1 Summary (01-03-SUMMARY.md) -- confirmed upsert pattern, __type workaround

### Tertiary (LOW confidence)
- Mutation names for KR/KPI (inferred from objective pattern, not verified)
- Input type names (inferred from naming convention, not verified)
- Key Result field list (inferred from filters, not verified via __type)
- KPI field list (inferred from filters, not verified via __type)
- Whether singular `keyResult` query exists (not visible, needs verification)

## Metadata

**Confidence breakdown:**
- Architecture/pattern: HIGH - Direct replication of proven Phase 1 pattern
- Query names and filter args: HIGH - Directly from introspection output
- Key Result type fields: LOW - Inferred from filters, must introspect
- KPI type fields: LOW - Inferred from filters, must introspect
- Mutation names: LOW - Inferred from pattern, must introspect
- Input type fields: LOW - Unknown, must introspect

**Research date:** 2026-01-23
**Valid until:** 60 days (pattern stable, entity schemas may evolve)
