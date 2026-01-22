# Project Research Summary

**Project:** Perdoo MCP Server (GraphQL API Wrapper)
**Domain:** OKR & Strategy Execution Platform Integration
**Researched:** 2026-01-23
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a GraphQL-to-MCP bridge server that exposes Perdoo's OKR management API as discrete MCP tools for LLM consumption. The recommended approach mirrors the existing MRPeasy MCP server architecture (layered: server → tools → client) with one critical difference: GraphQL semantics require fundamentally different error handling, retry safety, and pagination patterns compared to REST.

The technology choice is decisive: use **raw `fetch` with zero additional GraphQL libraries**. The existing MRPeasy resilience stack (queue → circuit breaker → retry → rate limiter) can be reused verbatim, but the detection logic at each layer must be rewritten to handle GraphQL's "200 OK with errors in body" pattern. This keeps the codebase consistent (one pattern, not two) while avoiding the bloat of graphql-request (474KB peer dependency) for what amounts to 20 lines of POST-with-JSON transport.

The primary risk is **GraphQL's error model breaking resilience assumptions**. REST APIs return 401/429/503 HTTP status codes that the MRPeasy retry/circuit breaker logic understands. GraphQL returns 200 OK for authentication failures, rate limits, and server errors—errors live in `response.body.errors[]` not `response.status`. Additionally, mutations cannot be safely retried like GET requests (risk of duplicate entities). The mitigation is threefold: (1) parse response body for errors before success determination, (2) classify GraphQL error codes (`UNAUTHENTICATED`, `RATE_LIMITED`) to derive retry eligibility, and (3) disable automatic retry for all mutations.

## Key Findings

### Recommended Stack

Use the exact same stack as MRPeasy with zero additional dependencies for GraphQL handling. The decision to **avoid `graphql-request` and use raw `fetch`** is based on consistency (MRPeasy pattern), minimal bundle size (no 474KB `graphql` peer dependency), and full control over error handling (GraphQL 200-with-errors requires custom logic anyway). GraphQL-over-HTTP is trivial—just POST with `{query, variables}` body—no library needed.

**Core technologies:**
- **TypeScript ^5.7 + Node.js >=18.0.0**: Native fetch, ESM support, strict type safety — matches MRPeasy exactly
- **Express ^4.21 + @modelcontextprotocol/sdk ^1.15.0**: HTTP transport via StreamableHTTPServerTransport — identical to MRPeasy
- **Zod ^3.25.0**: MCP tool input validation — same pattern, same library
- **Raw `fetch` (native)**: GraphQL client transport — zero deps, full control, consistency with MRPeasy's REST client

**Deferred (not initially):**
- **GraphQL Codegen**: Adds 5+ dev dependencies for type generation. Perdoo's API surface is small (5 entities, ~20 queries/mutations) and hand-typing gives better control. Only reconsider if schema exceeds 30 types or changes frequently.

### Expected Features

API surface is **5 entity types with CRUD-minus-D operations** (Perdoo disallows deletes via API by design). Research confidence: HIGH for Objectives/Key Results (confirmed via Power BI integration Gist), MEDIUM for KPIs/Initiatives/Strategic Pillars (inferred from support docs and Zapier integration).

**Must have (confirmed via Zapier + Power BI sources):**
- **List/get Objectives** — time-bound goals with status, progress, alignment (confirmed: `name`, `status`, `progress`, `timeframe`, `results` connection)
- **List/get Key Results** — outcome metrics within objectives (confirmed: `name`, `type`, `normalizedValue`, `status` via Power BI Gist)
- **Update Key Results** — progress tracking (confirmed via Zapier "Update Key Result" action: ID + Value + Comment)
- **Update KPIs** — ongoing metric tracking (confirmed via Zapier "Update KPI" action)
- **Relay-style cursor pagination** — `first`/`after` with `pageInfo.endCursor`/`hasNextPage` (HIGH confidence from Power BI Gist)

**Should have (inferred from support docs, MEDIUM confidence):**
- **Create Objectives/Key Results/KPIs** — support docs confirm API "creates goals" but exact mutation names unknown
- **List/get KPIs** — standalone metrics aligned to Strategic Pillars (field structure from support articles)
- **List/get Initiatives** — project/task outputs driving Key Results (shares same "Results" type as KRs per Gist)
- **List/get Strategic Pillars** — high-level strategy alignment (least documented entity, LOW-MEDIUM confidence)
- **Filtering** — by status, timeframe, owner, lead (inferred from "All Goals" UI columns, needs introspection to confirm)

**Defer (out of scope or needs validation):**
- **Delete operations** — Perdoo disallows destructive actions via API (by design, HIGH confidence)
- **Daily KR metric values** — PROJECT.md explicitly excludes this (entering granular progress data)
- **Private goals** — Private OKRs/KPIs excluded from Google Sheets Add-on, likely same for API
- **Draft goals** — Draft OKRs excluded from Sheets Add-on, may not be queryable via API
- **Strategic Pillar create/update** — Requires Superadmin rights in UI, likely same in API (needs permission validation)

### Architecture Approach

The architecture is a **3-layer GraphQL-to-MCP bridge** that mirrors MRPeasy's proven pattern with GraphQL-specific adaptations. The server uses Express + StreamableHTTP transport (identical to MRPeasy), tools layer validates inputs with Zod and formats LLM-friendly responses (identical pattern, new entities), and the client layer executes GraphQL operations through a resilience stack (same components, new detection logic).

**Major components:**
1. **PerdooClient (services/perdoo/client.ts)** — Hybrid pattern: private `execute<T>(operation, variables)` method handles queue → circuit breaker → retry → rate limiter → fetch, with typed public methods per entity (`listObjectives()`, `createKeyResult()`) that wrap execute(). Same philosophy as MRPeasy's `MrpEasyClient` but POST-only, single endpoint, variables in body.
2. **GraphQL operations (services/perdoo/operations/*.ts)** — String constants per entity (objectives.ts, key-results.ts, etc.) containing query/mutation templates. Clean separation: operations define "what to ask", client defines "how to ask", tools define "when to ask". Prevents 500-line bloated client file and keeps GraphQL syntax isolated from MCP layer.
3. **MCP tools (mcp/tools/*.ts)** — One file per entity with 4 tools each (list, get, create, update) totaling ~20 tools. Each tool: validates input with Zod, calls client typed method, flattens GraphQL response (edges/nodes → simple arrays), formats for LLM. Zero GraphQL knowledge in this layer (no query strings, no variables).
4. **Resilience stack (services/perdoo/{rate-limiter,retry,circuit-breaker,request-queue}.ts)** — Copy from MRPeasy, tune parameters (start conservative: 30 req/10s vs MRPeasy's 100 req/10s since Perdoo limits are unknown). Same architecture, different tuning.

**Critical architectural difference from REST:**
- **Error detection**: MRPeasy checks `!response.ok` → Perdoo must parse `response.json().errors[]`
- **Retry safety**: MRPeasy retries all GET requests → Perdoo NEVER retries mutations (risk of duplicate creation)
- **Pagination**: MRPeasy uses Range headers → Perdoo uses Relay cursor connections (`edges[].node`, `pageInfo`)
- **Auth**: MRPeasy uses Basic Auth (never expires) → Perdoo uses Bearer token (may expire, needs detection)

### Critical Pitfalls

Research identified 14 pitfalls across 3 severity levels. Top 5 CRITICAL/MODERATE risks for roadmap phasing:

1. **GraphQL returns 200 OK for failures** — HTTP status codes are useless. Authentication errors, rate limits, validation failures all return `200 OK` with `errors` array in body. The MRPeasy resilience stack (checking `response.ok` and `status === 429`) will never trigger. **Mitigation**: Parse response body BEFORE determining success, extract error codes from `errors[].extensions.code`, map GraphQL codes (`UNAUTHENTICATED` → 401 semantics, `RATE_LIMITED` → 429 semantics) for retry/circuit breaker logic.

2. **Mutation retry creates duplicate entities** — MRPeasy retries all requests (they're all GET). Perdoo has create/update mutations. Retrying `createObjective` on timeout can create duplicate OKRs if first request succeeded server-side. **Mitigation**: Disable automatic retry for mutations. On timeout, query to verify entity wasn't created before retrying. Or use two-phase: execute once, then verify-and-retry only if provably failed.

3. **Partial data + errors both present** — GraphQL can return `{data: {...}, errors: [...]}` simultaneously. Treating any error as total failure discards valid partial results. Ignoring errors when data exists returns incomplete data to LLM. **Mitigation**: Three-state response model: (1) data only = success, (2) errors only = failure, (3) both = partial success with warnings in tool response. For mutations: treat any error as failure. For queries: return available data with explicit warnings.

4. **Rate limits are undocumented** — Perdoo's API docs (only accessible to Superadmins) don't publicly document rate limits, throttling behavior, or error codes. Conservative tuning (30 req/10s) may be too loose or too tight. **Mitigation**: Start conservative, implement adaptive rate limiting that detects throttling from error messages, log all rate-related errors for pattern discovery, contact Perdoo support for official limits.

5. **Over-fetching bloats responses** — GraphQL power = request exact fields needed. Naive approach = request all fields "just in case" → 50+ field responses consuming excessive tokens and confusing LLM. **Mitigation**: Define minimal field sets per tool purpose (list_objectives: 5-6 summary fields; get_objective: full field set), calculate token budget (<1000 tokens per list response), use separate "summary" vs "detail" tools.

**Additional moderate risks:**
- **Bearer token expiry** (Pitfall 8): Detect `UNAUTHENTICATED` errors, stop retrying immediately, return actionable error message
- **N+1 query problem** (Pitfall 9): Use nested GraphQL queries to fetch objectives WITH key results in single request (never loop)
- **Schema drift** (Pitfall 5): Run introspection on startup to verify expected fields exist, detect `@deprecated` warnings
- **Validation errors not LLM-friendly** (Pitfall 10): Zod validation BEFORE GraphQL, translate GraphQL type errors into actionable messages

## Implications for Roadmap

Based on research, suggested phase structure mirrors the build order dependencies discovered in ARCHITECTURE.md. The approach is **validate with one entity end-to-end before scaling to all five entities**.

### Phase 1: Core Infrastructure + First Entity (Objectives)
**Rationale:** Foundation must handle GraphQL semantics correctly before replicating to 20 tools. Build bottom-up: env/types → resilience stack → GraphQL client → first entity tools → transport. Objectives are the best-documented entity (HIGH confidence from Power BI Gist) making them ideal for validating the integration pattern.

**Delivers:**
- Environment setup (PERDOO_API_TOKEN validation, tsconfig, package.json)
- GraphQL client with `execute<T>()` handling POST-with-variables, error parsing, resilience stack
- Objectives operations (OBJECTIVES_QUERY, OBJECTIVE_QUERY, CREATE/UPDATE mutations as string constants)
- 4 objectives tools (list_objectives, get_objective, create_objective, update_objective)
- Express + StreamableHTTP transport with session management
- **Functional server with 1/5 entities** validating all patterns work against real Perdoo API

**Addresses pitfalls:**
- Pitfall 1 (200 OK errors): GraphQL error parser in client.executeRequest()
- Pitfall 2 (partial data): Three-state response handler
- Pitfall 3 (mutation retry): Separate retry logic for queries vs mutations
- Pitfall 8 (auth expiry): UNAUTHENTICATED error detection
- Pitfall 11 (injection): Variables-only enforcement

**Critical decision point:** Run introspection query against Perdoo API to discover actual schema (query/mutation names, field types, enum values, pagination structure) BEFORE building tools. Hand-typed assumptions in FEATURES.md need validation.

### Phase 2: Remaining Entities (Key Results, KPIs, Initiatives, Strategic Pillars)
**Rationale:** Once Objectives validate the pattern, remaining entities are parallelizable. They share the same structure (operations/*.ts → client methods → tools/*.ts). Key Results have HIGH confidence (Power BI Gist), KPIs/Initiatives have MEDIUM (Zapier), Strategic Pillars have LOW-MEDIUM (support docs only).

**Delivers:**
- 4 operations files (key-results.ts, kpis.ts, initiatives.ts, strategic-pillars.ts)
- Client extensions (listKeyResults, createKPI, updateInitiative, etc.)
- 16 additional tools (4 tools × 4 entities)
- **Complete API coverage: 20 tools across 5 entities**

**Uses:**
- Established client pattern from Phase 1
- Validated GraphQL error handling
- Proven resilience stack tuning (adjusted based on Phase 1 observations)

**Avoids:**
- Pitfall 6 (over-fetching): Minimal field sets per tool (learned from Objectives token budget analysis)
- Pitfall 7 (pagination): Relay cursor pattern established in Phase 1
- Pitfall 9 (N+1 queries): Nested query pattern established for objectives.results connection
- Pitfall 14 (ID type): Confirmed string UUIDs vs numeric in Phase 1 introspection

**Risk areas:**
- Strategic Pillars: LOW confidence on schema (only support articles), may require Superadmin permissions
- Initiatives: Accessed via objectives.results connection where `type = "initiative"`, confirm no dedicated top-level query

### Phase 3: Polish + Validation
**Rationale:** Once all entities work, add non-functional requirements and validate against real use cases.

**Delivers:**
- Instructions resource (perdoo://instructions) for LLM guidance
- Tool descriptions tuned for LLM comprehension (explicit filtering/pagination capabilities)
- Rate limiter tuning based on empirical data from Phase 2 usage
- Schema validation on startup (introspection check for expected fields)
- Error message translation for LLM consumption (GraphQL jargon → actionable guidance)
- Integration testing with realistic OKR workflows

**Implements:**
- Pitfall 5 mitigation (schema drift): Startup introspection validation
- Pitfall 10 mitigation (validation errors): Translate GraphQL errors to LLM-friendly messages
- Pitfall 12 mitigation (tool descriptions): Document filtering/pagination capabilities explicitly
- Pitfall 13 mitigation (operation names): Named operations in all logs for debugging

### Phase Ordering Rationale

- **Foundation before tools** because tools call client methods—cannot build tools without working client
- **One entity end-to-end** validates GraphQL integration pattern with real API responses before replicating 4× (prevents building 20 broken tools)
- **Objectives first** because they have the highest research confidence (Power BI Gist confirmed fields) reducing validation risk
- **Remaining entities parallelizable** once pattern established—same structure (operations → client → tools), different data models
- **Polish last** because rate limit tuning, schema validation, and error translation require real API usage data from Phases 1-2

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 1 (CRITICAL):** Run introspection query FIRST to discover actual schema. All mutation names, input types, filter arguments, enum values in FEATURES.md are LOW confidence inferences. Cannot build tools without confirmed schema.
- **Phase 2 (Strategic Pillars):** Least documented entity. May need `/gsd:research-phase strategic-pillars` if introspection reveals complex structure or Phase 1 uncovers permission restrictions.

**Phases with standard patterns (skip research-phase):**
- **Phase 2 (Key Results, KPIs, Initiatives):** Follow Objectives pattern exactly. MEDIUM confidence on fields is sufficient—introspection in Phase 1 will validate.
- **Phase 3 (Polish):** Standard MCP server practices (instructions resource, error messages, logging). No domain-specific research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | MRPeasy provides proven pattern; raw fetch is well-understood; zero new dependencies |
| Features | **MEDIUM-HIGH** | Objectives/KR fields confirmed via Power BI Gist (HIGH); mutation names/filters inferred (MEDIUM); Strategic Pillars minimal docs (LOW) |
| Architecture | **HIGH** | Layered pattern matches MRPeasy (proven); GraphQL semantics well-documented; build order clear |
| Pitfalls | **HIGH** | GraphQL error handling is standard problem with known solutions; mutation retry safety is documented; sources are official (GraphQL spec, Shopify/Apollo blogs) |

**Overall confidence:** **MEDIUM-HIGH**

Stack and architecture are HIGH confidence (proven patterns, official docs). Features are MEDIUM (mix of confirmed Power BI Gist fields and inferred support article properties). The introspection query in Phase 1 will raise feature confidence to HIGH by confirming exact schema.

### Gaps to Address

**Critical gaps requiring Phase 1 validation:**
- **Exact schema structure**: Introspection query must run BEFORE building any tools to confirm query/mutation names, input types, filter arguments, enum values, pagination style
- **Rate limit behavior**: Undocumented publicly. Must observe during Phase 1 testing. Look for error codes/messages containing "rate", "limit", "throttl". Consider contacting support@perdoo.com for official limits.
- **Bearer token expiry**: Perdoo docs confirm Bearer token auth but don't specify expiry duration or refresh mechanism. Implement detection (catch `UNAUTHENTICATED` errors) in Phase 1, investigate refresh flow if tokens expire during testing.

**Medium gaps addressable during implementation:**
- **Strategic Pillar permissions**: Support docs state Superadmin rights required for create/update in UI. Validate API has same restriction during Phase 2. May need to document permission requirements in tool descriptions.
- **Private/draft goal visibility**: Google Sheets Add-on excludes private/draft goals. Likely same for API. Test during Phase 1 to confirm and document in tool descriptions ("only active, non-private goals returned").
- **Partial data handling strategy**: Three-state model (data only / errors only / both) is defined but actual Perdoo partial response scenarios unknown. Observe during testing to tune logging and warnings.

**Minor gaps (low priority):**
- **graphql-request migration path**: If raw fetch becomes unmaintainable (unlikely), migration to graphql-request is straightforward (same variable pattern, POST transport). Defer decision until codebase shows need.
- **GraphQL Codegen value**: Deferred based on small API surface (5 entities). Revisit if Perdoo schema exceeds 30 types or changes frequently (monitor via startup introspection warnings).

## Sources

### Primary (HIGH confidence)
- [Power Query script for Perdoo API (GitHub Gist)](https://gist.github.com/jmorrice/f7e4c08e9b5d73f8f3523621cf036ff5) — Confirmed endpoint (`api-eu.perdoo.com/graphql/`), auth (Bearer token), pagination (Relay cursor: `first`, `after`, `pageInfo`, `edges/node`), and objective fields (`name`, `status`, `progress`, `timeframe`, `results` connection)
- [GraphQL Specification: Response Format](https://graphql.org/learn/response/) — Official spec for `{data, errors}` structure, partial response handling
- [GraphQL Specification: Section 7 (Response)](https://github.com/graphql/graphql-spec/blob/main/spec/Section%207%20--%20Response.md) — Detailed response semantics (both data and errors can coexist)
- MRPeasy MCP server codebase (`/mcp/mrpeasy/src/`) — Reference implementation for all patterns (client structure, resilience stack, tool registration, error handling)
- [Perdoo API Support Article](https://support.perdoo.com/en/articles/3629954-api) — Confirmed GraphQL-based, Bearer auth, general capabilities

### Secondary (MEDIUM confidence)
- [Perdoo Zapier Integration](https://zapier.com/apps/perdoo/integrations) — Confirmed CRUD operations exist (Update Key Result/KPI/Initiative actions require ID + Value + Comment; Find actions exist for Objective/KPI/Initiative by ID; New triggers for all entities)
- [Perdoo Goals & Custom Reports](https://support.perdoo.com/en/articles/3112213-all-goals-custom-reports) — Complete filter/column reference (30+ columns map to likely API fields: `lead`, `owner`, `timeframe`, `progress`, `status`, `tags`, `startValue`, `currentValue`, etc.)
- [Shopify Engineering: Building Resilient GraphQL APIs Using Idempotency](https://shopify.engineering/building-resilient-graphql-apis-using-idempotency) — Mutation retry safety, idempotency key patterns
- [Apollo GraphQL Blog: Building MCP Tools with GraphQL](https://www.apollographql.com/blog/building-mcp-tools-with-graphql-a-better-way-to-connect-llms-to-your-api) — MCP-specific GraphQL patterns, context management
- [Grafbase: Managing MCP Context with GraphQL](https://grafbase.com/blog/managing-mcp-context-graphql) — Over-fetching mitigation, token budget strategies
- [Mastering GraphQL Error Handling (Testfully)](https://testfully.io/blog/graphql-error-handling/) — Error classification, retry eligibility
- [200 OK! Error Handling in GraphQL (Medium)](https://sachee.medium.com/200-ok-error-handling-in-graphql-7ec869aec9bc) — Pitfall 1 deep dive
- Support articles for entities ([Add Key Results](https://support.perdoo.com/en/articles/1588530-add-key-results), [Add Company KPIs](https://support.perdoo.com/en/articles/2298516-add-company-kpis), [Add Initiatives](https://support.perdoo.com/en/articles/3625166-add-initiatives), [Create Objectives](https://support.perdoo.com/en/articles/2998922-create-objectives), [Strategic Pillars](https://support.perdoo.com/en/articles/4725666-strategic-pillars)) — Field properties, relationships, validation rules

### Tertiary (LOW confidence, needs validation)
- [Perdoo Apollo GraphQL Explorer](https://studio.apollographql.com/public/Perdoo-GQL/variant/current/explorer) — Schema explorer (client-side rendered, not scrapable; introspection query needed for validation)
- [Relay Cursor Connections Specification](https://relay.dev/graphql/connections.htm) — Pagination pattern (HIGH confidence on spec, MEDIUM on Perdoo implementing it exactly)
- [GitHub: Breaking Changes Policy](https://docs.github.com/en/graphql/overview/breaking-changes) — Schema drift patterns (not Perdoo-specific)
- Perdoo rate limiting behavior — Undocumented publicly, needs empirical discovery in Phase 1
- Perdoo Bearer token expiry — Auth method confirmed, expiry semantics unknown
- Strategic Pillar schema — Only support article descriptions, no confirmed API fields

---
*Research completed: 2026-01-23*
*Ready for roadmap: **YES** (Phase 1 must run introspection FIRST to validate schema assumptions)*
