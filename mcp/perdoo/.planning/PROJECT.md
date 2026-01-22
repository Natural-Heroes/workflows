# Perdoo MCP Server

## What This Is

An MCP server that wraps the Perdoo GraphQL API, enabling LLMs to create, read, and update OKR structures (objectives, key results, KPIs, initiatives, and strategic pillars) in Perdoo. Built for the same multi-tenant session-based architecture as the existing MRPeasy MCP server.

## Core Value

LLMs can fully manage OKR structures in Perdoo — creating, reading, and updating all core entities through a single MCP interface.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Query and list objectives (with filtering)
- [ ] Create and update objectives
- [ ] Query and list key results (with filtering)
- [ ] Create and update key results
- [ ] Query and list KPIs (with filtering)
- [ ] Create and update KPIs
- [ ] Query and list initiatives (with filtering)
- [ ] Create and update initiatives
- [ ] Query and list strategic pillars (with filtering)
- [ ] Create and update strategic pillars
- [ ] Bearer token authentication via environment variable
- [ ] GraphQL client with resilience stack (retry, rate limiter, circuit breaker)
- [ ] Server instructions resource for LLM guidance
- [ ] Session-based MCP-over-HTTP transport (Express)

### Out of Scope

- Deleting entities — destructive operations should be done in the Perdoo UI directly
- Entering KR metric values — this is operational tracking, not structure management
- User/team management — admin operations outside OKR scope
- Webhooks/real-time sync — one-directional API calls only

## Context

- Follows the established MRPeasy MCP server architecture in this repo (`mcp/mrpeasy/`)
- Perdoo API is GraphQL at `https://eu.perdoo.com/graphql/`
- Auth is Bearer token from Personal Settings > API Tokens
- The MRPeasy server uses REST; this server adapts the same layered architecture for GraphQL
- Same dependencies: `@modelcontextprotocol/sdk`, `express`, `zod`
- Will need a GraphQL client (likely raw fetch with query strings, no heavy lib needed)

## Constraints

- **Stack**: TypeScript, ESM, same deps as MRPeasy (MCP SDK, Express, Zod) — consistency across servers
- **Architecture**: Must follow MRPeasy patterns (layered: server.ts → mcp/ → tools/ → services/) — team familiarity
- **API**: GraphQL only, single endpoint — all operations go through queries/mutations
- **Auth**: Bearer token, validated at startup — fail-fast on missing credentials

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| GraphQL via raw fetch (no Apollo/urql) | Minimal deps, same pattern as MRPeasy's raw fetch for REST | — Pending |
| Follow MRPeasy directory structure exactly | Team familiarity, consistency across MCP servers | — Pending |
| No delete operations | Destructive actions should require human in the loop via Perdoo UI | — Pending |

---
*Last updated: 2026-01-22 after initialization*
