# Perdoo GraphQL API Feature Research

**Domain:** Perdoo OKR & Strategy Execution Platform - GraphQL API Surface
**Researched:** 2026-01-23
**Overall Confidence:** MEDIUM (API docs are behind auth; findings synthesized from Power BI integration examples, Zapier integration, support articles, and public Apollo Studio schema reference)

## API Endpoint & Authentication

| Property | Value | Confidence |
|----------|-------|------------|
| Endpoint | `https://api-eu.perdoo.com/graphql/` | HIGH (confirmed in Power BI Gist) |
| Alt Endpoint | `https://eu.perdoo.com/graphql/` (per PROJECT.md) | MEDIUM (may be alias) |
| Auth Method | Bearer token in `Authorization` header | HIGH (confirmed in Power BI Gist + support docs) |
| Token Source | Personal Settings > API Tokens (or Integrations) | HIGH (confirmed in multiple support articles) |
| Schema Explorer | `https://studio.apollographql.com/public/Perdoo-GQL/variant/current/explorer` | HIGH (public URL confirmed) |
| Protocol | GraphQL (POST with JSON body) | HIGH |

**Note:** The schema is publicly browsable via Apollo GraphOS Studio but the explorer renders client-side (SPA), making automated schema extraction impossible without introspection query access. The findings below are synthesized from the Power BI integration Gist, Zapier integration metadata, support articles, and the "All Goals" filter/column documentation.

---

## Pagination Pattern

**Pattern:** Relay-style cursor-based connections (confirmed HIGH confidence)

```graphql
query {
  objectives(first: 50, after: "cursor_string") {
    pageInfo {
      endCursor
      hasNextPage
    }
    edges {
      node {
        # ... fields
      }
    }
  }
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `first` | Int | Number of items to fetch (batch size, confirmed: 50 in Power BI example) |
| `after` | String | Cursor for next page (from `pageInfo.endCursor`) |
| `pageInfo.endCursor` | String | Cursor to pass as `after` for next page |
| `pageInfo.hasNextPage` | Boolean | Whether more pages exist |

**Confidence:** HIGH - Confirmed from Power BI Gist source code showing recursive pagination loop.

---

## Entity 1: Objectives

### Query: `objectives`

**Confirmed fields** (from Power BI Gist - HIGH confidence):

| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Objective title |
| `status` | String/Enum | See status values below |
| `progress` | Float | Percentage (0-100), calculated from KRs or aligned objectives |
| `timeframe` | Object | Contains `name` (e.g., "Q1 2026") |
| `company` | Object | Contains `name` |
| `groups` | Connection | Teams/groups owning the objective (edges > node > name) |
| `results` | Connection | Key Results + Initiatives (edges > node > {name, type, normalizedValue, status}) |

**Inferred fields** (from support articles + "All Goals" columns - MEDIUM confidence):

| Field | Type | Notes |
|-------|------|-------|
| `id` | ID | Unique identifier (confirmed in support docs) |
| `description` | String | Optional description text |
| `lead` | Object | Person responsible for updates |
| `owner` | Object | Team owning the objective |
| `contributors` | Connection | Additional people working on it |
| `tags` | [String] or Connection | Organizational labels |
| `alignedTo` | Object | Strategic Pillar, OKR, or KPI alignment |
| `parent` | Object | Parent objective (confirmed: `id` queryable for parent) |
| `stage` | String/Enum | Active or Draft |
| `createdAt` | DateTime | Creation date (filterable in UI) |
| `lastUpdated` | DateTime | Last update timestamp |
| `archived` | Boolean | Whether archived |
| `startDate` | DateTime | Optional start date |
| `dueDate` | DateTime | Optional due date |
| `updateFrequency` | String/Enum | How often progress should be updated |
| `expectedProgress` | Float | Expected progress at current point in timeframe |
| `keyResultsCount` | Int | Number of Key Results |

### Objective Status Values (HIGH confidence - from "All Goals" docs):

| Status | Applicable To |
|--------|---------------|
| `on track` | Objectives, Key Results, Initiatives |
| `needs attention` | Objectives, Key Results, Initiatives |
| `off track` | Objectives, Key Results, Initiatives, KPIs |
| `accomplished` | Objectives, Key Results, Initiatives |
| `achieved` | Objectives only |
| `canceled` | Objectives only |
| `missed` | Objectives only |
| `partially achieved` | Objectives only |
| `postponed` | Objectives only |
| `no status` | Objectives, Key Results, Initiatives |

### Objective Filters (inferred from "All Goals" UI - MEDIUM confidence):

Likely available as query arguments:

| Filter | Type | Notes |
|--------|------|-------|
| `status` | Enum/String | Filter by status values |
| `timeframe` | String/ID | Past, current, future |
| `owner` | ID | Team ID |
| `lead` | ID | User ID |
| `tag` | String/ID | Tag filter |
| `archived` | Boolean | Include archived |
| `alignedTo` | ID | Strategic Pillar/OKR/KPI ID |
| `contributor` | ID | Contributor user ID |

### Mutations (MEDIUM confidence - inferred from support articles + Perdoo capabilities):

**`createObjective`** (or similar name):

| Input Field | Type | Required | Notes |
|-------------|------|----------|-------|
| `name` | String | YES | Objective title |
| `timeframe` | ID/String | YES | Timeframe selection |
| `owner` | ID | YES | Team ID |
| `lead` | ID | YES | Person responsible |
| `alignment` | Object/ID | NO | Strategic Pillar, OKR, or KPI |
| `description` | String | NO | Optional description |
| `draft` | Boolean | NO | Save as draft |
| `contributors` | [ID] | NO | Additional people |
| `tags` | [String/ID] | NO | Tags |
| `progressCalculation` | Enum | NO | "keyResults" or "alignedObjectives" |

**`updateObjective`** (or similar name):

| Input Field | Type | Notes |
|-------------|------|-------|
| `id` | ID | Required - objective to update |
| `name` | String | Update title |
| `description` | String | Update description |
| `status` | Enum | Update status |
| `lead` | ID | Change lead |
| `alignment` | ID | Change alignment |
| `tags` | [ID] | Update tags |

---

## Entity 2: Key Results (Results)

Key Results are a sub-type of "Results" in Perdoo (alongside Initiatives). They live within an Objective.

### Query: Accessed via `objectives > results` connection OR potentially a top-level `keyResults` query

**Confirmed fields** (from Power BI Gist - HIGH confidence):

| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Key Result title |
| `type` | String/Enum | "keyResult" or "initiative" |
| `normalizedValue` | Float | Current progress as normalized value |
| `status` | String/Enum | See status values above |

**Inferred fields** (from support articles + "All Goals" columns - MEDIUM confidence):

| Field | Type | Notes |
|-------|------|-------|
| `id` | ID | Unique identifier |
| `description` | String | Optional description |
| `lead` | Object/ID | Person responsible |
| `targetType` | Enum | increase_to, decrease_to, binary, stay_at_or_below, stay_at_or_above, milestone |
| `measurementUnit` | Enum | numerical, percentage, currency |
| `startValue` | Float | Starting metric value |
| `targetValue` | Float | Goal metric value |
| `currentValue` | Float | Current metric value |
| `threshold` | Float | For stay_at types |
| `progress` | Float | Calculated percentage (0-100) |
| `parent` | Object | Parent Key Result (for nesting) |
| `objective` | Object | Parent Objective |
| `contributors` | Connection | Additional people |
| `startDate` | DateTime | When tracking begins |
| `dueDate` | DateTime | Target completion |
| `tags` | Connection | Tags |
| `lastUpdated` | DateTime | Last progress update |
| `metricUnit` | String | Display unit (from "All Goals" columns) |
| `endValue` | Float | Final/closing value |

### Key Result Target Types (HIGH confidence - from support articles):

| Target Type | Start Value | Target Value | Auto-set |
|-------------|-------------|--------------|----------|
| `increase_to` | User-defined | User-defined | No |
| `decrease_to` | User-defined | User-defined | No |
| `binary` | 0 | 1 | Yes (numerical) |
| `stay_at_or_below` | N/A | Threshold | Uses threshold |
| `stay_at_or_above` | N/A | Threshold | Uses threshold |
| `milestone` | 0 | 100 | Yes (percentage) |

### Mutations (MEDIUM confidence):

**`createKeyResult`** (or similar):

| Input Field | Type | Required | Notes |
|-------------|------|----------|-------|
| `objectiveId` | ID | YES | Parent objective |
| `name` | String | YES | Key Result title |
| `targetType` | Enum | YES | See target types above |
| `measurementUnit` | Enum | Conditional | Required for increase_to/decrease_to |
| `startValue` | Float | Conditional | Required for increase_to/decrease_to |
| `targetValue` | Float | Conditional | Required for increase_to/decrease_to |
| `threshold` | Float | Conditional | Required for stay_at types |
| `lead` | ID | NO | Person responsible |
| `description` | String | NO | Optional |
| `parentKeyResult` | ID | NO | For nesting under another KR |
| `contributors` | [ID] | NO | Additional people |
| `startDate` | DateTime | NO | Start tracking date |
| `dueDate` | DateTime | NO | Target date |
| `tags` | [String/ID] | NO | Tags |

**`updateKeyResult`** (or similar):

| Input Field | Type | Notes |
|-------------|------|-------|
| `id` | ID | Required - KR to update |
| `currentValue` | Float | Update progress value |
| `status` | Enum | Update status |
| `name` | String | Update title |
| `comment` | String | Progress update comment |

**Note from Zapier:** The "Update Key Result" Zapier action requires: Key Result ID, New Value, and optional Comment. This strongly suggests a mutation that accepts `id`, `value`/`currentValue`, and `comment` fields.

---

## Entity 3: KPIs

KPIs are standalone metrics not tied to a timeframe (unlike Key Results). They measure Strategic Pillar success.

### Query: Likely `kpis` top-level query (MEDIUM confidence)

**Inferred fields** (from support articles + "All Goals" columns + Zapier - MEDIUM confidence):

| Field | Type | Notes |
|-------|------|-------|
| `id` | ID | Unique identifier (confirmed via Zapier "Find KPI" by ID) |
| `name` | String | KPI title |
| `currentValue` | Float | Present measurement |
| `targetValue` | Float | Target/threshold value |
| `targetType` | Enum | stay_at_or_above, stay_at_or_below, increase_to, decrease_to |
| `metricUnit` | String | Unit of measurement |
| `targetFrequency` | Enum | monthly, quarterly, annually |
| `updateFrequency` | Enum | How often KPI refreshes |
| `resetToZero` | Boolean | Auto-reset at period start |
| `owner` | Object | Team owning the KPI |
| `lead` | Object | Person responsible |
| `description` | String | KPI description |
| `alignment` | Object | Strategic Pillar alignment |
| `tags` | Connection | Tags |
| `status` | Enum | on_track, off_track (only 2 values for KPIs) |
| `progress` | Float | Current vs target |
| `privacy` | Boolean/Enum | Privacy settings |
| `progressDriver` | Enum | Automatic calculation method |
| `archived` | Boolean | Whether archived |
| `lastUpdated` | DateTime | Last update timestamp |

### KPI Status Values (HIGH confidence):

| Status | Description |
|--------|-------------|
| `on track` | Current value meets target criteria |
| `off track` | Current value does not meet target criteria |

### Mutations (MEDIUM confidence):

**`createKpi`** (or similar):

| Input Field | Type | Required | Notes |
|-------------|------|----------|-------|
| `name` | String | YES | KPI title |
| `currentValue` | Float | YES | Initial value |
| `metricUnit` | String | YES | Unit of measurement |
| `targetType` | Enum | YES | 4 target type options |
| `targetValue` | Float | YES | Target/threshold |
| `targetFrequency` | Enum | NO | Monthly/quarterly/annual |
| `updateFrequency` | Enum | NO | Update cadence |
| `resetToZero` | Boolean | NO | Period reset |
| `owner` | ID | NO | Team |
| `lead` | ID | NO | Person |
| `description` | String | NO | Description |
| `alignment` | ID | NO | Strategic Pillar ID |
| `tags` | [String/ID] | NO | Tags |
| `privacy` | Boolean | NO | Private KPI |

**`updateKpi`** (or similar):

| Input Field | Type | Notes |
|-------------|------|-------|
| `id` | ID | Required - KPI to update |
| `currentValue` | Float | Update current measurement |
| `name` | String | Update title |
| `targetValue` | Float | Update target |
| `comment` | String | Optional update context |

**Note from Zapier:** The "Update KPI" Zapier action requires: KPI ID, New Value, and optional Comment.

---

## Entity 4: Initiatives

Initiatives are the second sub-type of "Results" (alongside Key Results). They represent projects/tasks that drive Key Results.

### Query: Accessed via `objectives > results` connection (where type = "initiative") OR potentially a top-level `initiatives` query

**Inferred fields** (from support articles + Zapier - MEDIUM confidence):

| Field | Type | Notes |
|-------|------|-------|
| `id` | ID | Unique identifier (confirmed via Zapier "Find Initiative" by ID) |
| `name` | String | Initiative title |
| `type` | Enum | "initiative" (within results connection) |
| `description` | String | Optional description |
| `lead` | Object | Person responsible |
| `targetType` | Enum | Same as Key Results: increase_to, decrease_to, binary, stay_at_or_below, stay_at_or_above, milestone |
| `measurementUnit` | Enum | numerical, percentage, currency |
| `startValue` | Float | Starting value |
| `targetValue` | Float | Goal value |
| `currentValue` | Float | Current progress |
| `threshold` | Float | For stay_at types |
| `normalizedValue` | Float | Normalized progress (confirmed in Power BI Gist) |
| `status` | Enum | on_track, needs_attention, off_track, accomplished, no_status |
| `progress` | Float | Calculated percentage |
| `parent` | Object | Parent Key Result or Initiative |
| `objective` | Object | Parent Objective |
| `contributors` | Connection | Additional people |
| `startDate` | DateTime | Start date |
| `dueDate` | DateTime | Due date |
| `tags` | Connection | Tags |
| `lastUpdated` | DateTime | Last update |

### Mutations (MEDIUM confidence):

**`createInitiative`** (or similar):

| Input Field | Type | Required | Notes |
|-------------|------|----------|-------|
| `objectiveId` | ID | YES | Parent objective |
| `name` | String | YES | Initiative title |
| `targetType` | Enum | YES | Same options as Key Results |
| `measurementUnit` | Enum | Conditional | Based on target type |
| `startValue` | Float | Conditional | Based on target type |
| `targetValue` | Float | Conditional | Based on target type |
| `lead` | ID | NO | Person responsible |
| `description` | String | NO | Description |
| `parentResult` | ID | NO | Parent KR/Initiative for nesting |
| `contributors` | [ID] | NO | People |
| `startDate` | DateTime | NO | Start date |
| `dueDate` | DateTime | NO | Due date |
| `tags` | [String/ID] | NO | Tags |

**`updateInitiative`** (or similar):

| Input Field | Type | Notes |
|-------------|------|-------|
| `id` | ID | Required |
| `currentValue` | Float | Progress update |
| `status` | Enum | Status update |
| `comment` | String | Update context |

**Note from Zapier:** The "Update Initiative" Zapier action requires: Initiative ID, New Value, and optional Comment.

---

## Entity 5: Strategic Pillars

Strategic Pillars represent organizational strategy. They are not time-bound and are measured through KPIs.

### Query: Likely `strategicPillars` or `pillars` (LOW confidence - least documented entity)

**Inferred fields** (from support articles - MEDIUM confidence):

| Field | Type | Notes |
|-------|------|-------|
| `id` | ID | Unique identifier |
| `name` | String | Pillar title |
| `description` | String | Hover description on Strategy Map |
| `owner` | Object | Defaults to Company, can be customized |
| `kpis` | Connection | KPIs measuring pillar success |
| `objectives` | Connection | OKRs aligned to this pillar |
| `archived` | Boolean | Whether archived |
| `displayOrder` | Int | Order in Strategy Map (oldest first by default) |
| `company` | Object | Company the pillar belongs to |

### Mutations (LOW confidence):

**`createStrategicPillar`** (or similar):

| Input Field | Type | Required | Notes |
|-------------|------|----------|-------|
| `name` | String | YES | Pillar title |
| `description` | String | NO | Description |
| `owner` | ID | NO | Team/company (defaults to Company) |

**`updateStrategicPillar`** (or similar):

| Input Field | Type | Notes |
|-------------|------|-------|
| `id` | ID | Required |
| `name` | String | Update title |
| `description` | String | Update description |
| `archived` | Boolean | Archive/restore |

**Important:** Creating/managing Strategic Pillars requires Superadmin rights in the Perdoo UI. The API may have the same permission restriction.

---

## Entity Relationships

```
Strategic Pillar (not time-bound)
    |
    |-- measured by --> KPIs (ongoing metrics, no due date)
    |
    |-- aligned from --> Objectives (time-bound goals)
                            |
                            |-- contains --> Key Results (outcome metrics)
                            |                   |
                            |                   |-- nested under --> Parent Key Result
                            |
                            |-- contains --> Initiatives (project/task outputs)
                                                |
                                                |-- nested under --> Parent KR or Initiative
```

### Alignment Rules (HIGH confidence from support docs):
- Each Objective can align to ONE of: Strategic Pillar, another Objective, or a KPI
- Objectives cannot align to multiple goals simultaneously
- Company OKRs typically align to Strategic Pillars
- Team OKRs typically align to Company OKRs (cascading)

### Result Containment:
- Key Results and Initiatives are BOTH "Results" that belong to an Objective
- Results can be nested (parent-child) within the same Objective
- Max recommended: 3-5 Key Results per Objective

### KPI Independence:
- KPIs exist independently (not within Objectives)
- KPIs align to Strategic Pillars
- KPIs have no timeframe/due date (ongoing measurement)
- OKRs can "improve a KPI" as their alignment target

---

## Zapier Integration: Confirmed CRUD Operations

The Zapier integration confirms which operations the API supports (HIGH confidence for existence, MEDIUM for exact GraphQL names):

### Triggers (Read/Subscribe):
| Entity | Trigger | Implies |
|--------|---------|---------|
| Objective | "New Objective" | `objectives` query exists |
| Key Result | "New Key Result" | KR query exists |
| KPI | "New KPI" | `kpis` query exists |
| Initiative | "New Initiative" | Initiative query exists |
| Group | "New Group" | `groups` query exists |
| User | "New User" | `users` query exists |

### Actions (Write):
| Entity | Action | Implies |
|--------|--------|---------|
| Key Result | "Update Key Result" (ID + Value + Comment) | Update mutation exists |
| KPI | "Update KPI" (ID + Value + Comment) | Update mutation exists |
| Initiative | "Update Initiative" (ID + Value + Comment) | Update mutation exists |

### Searches (Read):
| Entity | Search | Search By |
|--------|--------|-----------|
| Objective | "Find Objective" | ID |
| KPI | "Find KPI" | ID |
| Initiative | "Find Initiative" | ID |
| Group | "Find Group" | Name |
| User | "Find User" | Email |

**Notable absence from Zapier:** No "Create Objective", "Create Key Result", "Create KPI", or "Create Initiative" actions in Zapier. However, the support article explicitly states the API can "create goals in Perdoo," so create mutations likely exist but may not be exposed in the Zapier integration.

---

## "All Goals" Columns: Complete Field Reference

The "All Goals / Custom Reports" view exposes 30+ columns. These map closely to API fields (MEDIUM confidence):

| Column | Applicable To | Likely API Field |
|--------|---------------|------------------|
| Name | All | `name` |
| Result type | Results | `type` (keyResult/initiative) |
| Lead | All | `lead` |
| Owner | All | `owner` |
| Timeframe | Obj, Results | `timeframe` |
| Progress | All | `progress` |
| Status | All | `status` |
| Stage | All | `stage` (active/draft) |
| Description | All | `description` |
| Tags | All | `tags` |
| Objective | Results | `objective` (parent) |
| Aligned to | Objectives | `alignedTo` |
| Contributors | All | `contributors` |
| Last updated | All | `lastUpdated` |
| Archived | All | `archived` |
| Start value | Results | `startValue` |
| End value | Results | `endValue` |
| Current value | Results, KPIs | `currentValue` |
| Target value | KPIs | `targetValue` |
| Metric unit | Results | `metricUnit` |
| Start date | Results | `startDate` |
| Due date | Results | `dueDate` |
| Closing date | Objectives | `closingDate` |
| Key Results count | Objectives | `keyResultsCount` |
| Date created | All | `createdAt` |
| Expected progress | All | `expectedProgress` |
| Parent | Results | `parent` |

---

## MCP Tool Mapping Recommendation

Based on the API surface, here are the recommended MCP tools:

### Read Tools (Query):

| Tool Name | GraphQL Query | Description |
|-----------|---------------|-------------|
| `list_objectives` | `objectives(first, after, filters...)` | List/filter objectives with pagination |
| `get_objective` | `objective(id)` or filter by ID | Get single objective with KRs/Initiatives |
| `list_key_results` | Via objectives or top-level query | List/filter key results |
| `list_kpis` | `kpis(first, after, filters...)` | List/filter KPIs |
| `list_initiatives` | Via objectives or top-level query | List/filter initiatives |
| `list_strategic_pillars` | `strategicPillars(...)` | List strategic pillars |
| `list_groups` | `groups(...)` | List teams/groups (for owner assignment) |
| `list_timeframes` | `timeframes(...)` or similar | List available timeframes |

### Write Tools (Mutation):

| Tool Name | GraphQL Mutation | Description |
|-----------|------------------|-------------|
| `create_objective` | `createObjective(input)` | Create new objective |
| `update_objective` | `updateObjective(input)` | Update objective properties |
| `create_key_result` | `createKeyResult(input)` | Add KR to objective |
| `update_key_result` | `updateKeyResult(input)` | Update KR value/properties |
| `create_kpi` | `createKpi(input)` | Create new KPI |
| `update_kpi` | `updateKpi(input)` | Update KPI value/properties |
| `create_initiative` | `createInitiative(input)` | Add initiative to objective |
| `update_initiative` | `updateInitiative(input)` | Update initiative progress |
| `create_strategic_pillar` | `createStrategicPillar(input)` | Create new pillar |
| `update_strategic_pillar` | `updateStrategicPillar(input)` | Update pillar properties |

---

## Critical Discovery: Introspection Required

**The most important finding:** The Perdoo GraphQL API schema is publicly browsable at Apollo GraphOS Studio but cannot be extracted via WebFetch (client-side rendered). The exact query/mutation names, input types, and field definitions MUST be confirmed via:

1. **GraphQL Introspection Query** against `https://api-eu.perdoo.com/graphql/` (or `https://eu.perdoo.com/graphql/`)
2. **Apollo Studio Schema Explorer** at `https://studio.apollographql.com/public/Perdoo-GQL/variant/current/explorer`

### Recommended Introspection Query:

```graphql
{
  __schema {
    queryType {
      fields {
        name
        args { name type { name kind ofType { name kind } } }
        type { name kind ofType { name kind } }
      }
    }
    mutationType {
      fields {
        name
        args { name type { name kind ofType { name kind } } }
        type { name kind ofType { name kind } }
      }
    }
    types {
      name
      kind
      fields {
        name
        type { name kind ofType { name kind } }
      }
      inputFields {
        name
        type { name kind ofType { name kind } }
      }
      enumValues { name }
    }
  }
}
```

**This introspection query should be run as the FIRST step of implementation** to confirm all field names, types, and mutation signatures before building tools.

---

## Known Limitations & Quirks

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| No delete operations | Cannot remove entities via API | By design - destructive actions in UI only |
| KR metric values out of scope | Cannot enter daily progress values | PROJECT.md explicitly excludes this |
| Private goals not accessible | Private OKRs/KPIs excluded from API | Document in tool descriptions |
| Draft goals may be excluded | Draft OKRs not in Google Sheets Add-on | May also apply to API queries |
| Single alignment rule | Objectives can only align to ONE parent | Validate in create/update input |
| Progress capped at 0-100% | Start value is floor, 100% is cap | Not possible to exceed bounds |
| Superadmin required for pillars | Strategic Pillar CRUD may require elevated permissions | Document permission requirements |
| Status is read-only for KPIs | KPI status (on/off track) is calculated, not set manually | Only `currentValue` drives status |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Pagination pattern | HIGH | Confirmed in Power BI Gist source code |
| Objective query fields | HIGH | 6 fields confirmed in Power BI Gist |
| Objective mutation fields | MEDIUM | Inferred from support article entity properties |
| Key Result fields | MEDIUM-HIGH | Mix of Gist (normalizedValue, type, status) + support articles |
| KPI fields | MEDIUM | Inferred from support articles + Zapier |
| Initiative fields | MEDIUM | Same structure as KR (both "Results") + Zapier |
| Strategic Pillar fields | LOW-MEDIUM | Least documented entity, only support articles |
| Exact mutation names | LOW | No public API documentation exposes these |
| Filter arguments | MEDIUM | Inferred from "All Goals" UI filter options |
| Endpoint URL | HIGH | Confirmed in Power BI Gist (`api-eu.perdoo.com/graphql/`) |

---

## Gaps Requiring Introspection

The following MUST be confirmed via introspection query before implementation:

1. **Exact query names** - Is it `objectives` or `allObjectives`? Is there a singular `objective(id: ID!)` query?
2. **Exact mutation names** - Naming convention (camelCase? e.g., `createObjective` vs `objectiveCreate`)
3. **Input type structures** - Are mutations using `input: CreateObjectiveInput!` pattern or individual args?
4. **Available filters** - What filter arguments exist on list queries?
5. **Top-level KPI/Initiative queries** - Are there dedicated queries or only via `objectives > results`?
6. **Strategic Pillar query name** - `strategicPillars`? `pillars`? Something else?
7. **Enum value representations** - Are statuses strings or enum values? What format? (snake_case? UPPER_CASE?)
8. **Timeframe structure** - Is `timeframe` an ID reference or inline object?
9. **Group/Team query** - What's the query for listing available groups for owner assignment?
10. **User query** - How to look up users for lead assignment?

---

## Sources

### HIGH Confidence
- [Power Query script for Perdoo API (GitHub Gist)](https://gist.github.com/jmorrice/f7e4c08e9b5d73f8f3523621cf036ff5) - Confirmed endpoint, auth pattern, pagination, and objective fields
- [Perdoo API Support Article](https://support.perdoo.com/en/articles/3629954-api) - Confirmed GraphQL, Bearer auth, capabilities
- [Perdoo Goals & Custom Reports](https://support.perdoo.com/en/articles/3112213-all-goals-custom-reports) - Complete filter/column reference
- [Perdoo Zapier Integration](https://zapier.com/apps/perdoo/integrations) - Confirmed CRUD operations exist

### MEDIUM Confidence
- [Add Key Results](https://support.perdoo.com/en/articles/1588530-add-key-results) - KR field properties
- [Add Company KPIs](https://support.perdoo.com/en/articles/2298516-add-company-kpis) - KPI field properties
- [Add Initiatives](https://support.perdoo.com/en/articles/3625166-add-initiatives) - Initiative field properties
- [Create Objectives](https://support.perdoo.com/en/articles/2998922-create-objectives) - Objective field properties
- [Strategic Pillars](https://support.perdoo.com/en/articles/4725666-strategic-pillars) - Pillar concept and relationships
- [Aligning OKRs](https://support.perdoo.com/en/articles/5391069-aligning-okrs) - Entity hierarchy
- [Power BI Integration](https://support.perdoo.com/en/articles/5069314-power-bi-integration) - API field references
- [Apollo GraphOS Studio (Perdoo-GQL)](https://studio.apollographql.com/public/Perdoo-GQL/variant/current/explorer) - Schema explorer (client-side rendered)
- [Setting targets for KPIs](https://support.perdoo.com/en/articles/5627060-setting-targets-for-your-kpis) - KPI target types
- [Update Key Results and Initiatives](https://support.perdoo.com/en/articles/1588540-update-key-results-and-initiatives) - Update mechanisms

---

*Feature research for: Perdoo MCP Server - GraphQL API Surface*
*Researched: 2026-01-23*
*Primary method: Synthesis from Power BI Gist (confirmed schema), Zapier integration (confirmed CRUD), support articles (entity properties), Apollo Studio (public schema reference)*
*Critical next step: Run introspection query against API endpoint to confirm exact field names, types, and mutation signatures*
