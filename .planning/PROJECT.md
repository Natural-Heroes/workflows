# Inventory Planner MCP Server

## What This Is

An MCP server that exposes Inventory Planner data to LLMs for conversational stock analytics. Users ask natural language questions about stockouts, stock history, and inventory value — the LLM queries the appropriate Inventory Planner endpoints and synthesizes answers. Also supports creating and updating purchase orders on user instruction.

## Core Value

LLM can answer questions about stock history (stockouts, duration, value) by querying Inventory Planner data.

## Requirements

### Validated

<!-- Existing patterns from MRPeasy server that will be reused -->

- ✓ MCP server with Express + StreamableHTTPServerTransport — existing pattern
- ✓ Resilience stack (rate limiter, circuit breaker, retry, request queue) — existing pattern
- ✓ Environment validation with Zod at startup — existing pattern
- ✓ Error translation layer (API errors → LLM-friendly messages) — existing pattern
- ✓ Tool registration pattern with Zod schemas — existing pattern
- ✓ Docker deployment with multi-stage build — existing pattern

### Active

<!-- v1.0 complete - all capabilities delivered -->

- [x] Read all Inventory Planner data (variants, replenishment, POs, vendors, warehouses)
- [x] Create purchase orders on user instruction
- [x] Update purchase orders on user instruction
- [x] Same resilience patterns as MRPeasy (rate limiter, circuit breaker, retry, queue)
- [x] Update variant planning parameters (lead time, review period, safety stock)

### Out of Scope

- Automated PO creation (LLM suggesting orders without user instruction) — user wants explicit control
- Real-time webhooks/notifications — read-only analytics focus
- Data persistence/caching layer — query fresh data each time
- Integration with MRPeasy server — separate standalone server

## Context

**Inventory Planner API:**
- Base URL: `https://app.inventory-planner.com`
- Auth: API Key + Account ID headers (`Authorization: {apiKey}`, `Account: {accountId}`)
- Response format: JSON with pagination metadata

**Existing Codebase:**
- MRPeasy MCP server in `mcp/mrpeasy/` provides reference architecture
- Scaffolding already exists in `mcp/inventory-planner/` (package.json, Dockerfile, src/)
- Same resilience patterns should be applied (token bucket, circuit breaker, retry, queue)

**Use Case:**
User asks questions like:
- "How long was SKU X out of stock last month?"
- "What's the total value of stockouts this quarter?"
- "Show me products that were out of stock for more than 7 days"
- "Create a PO for supplier Y with these items"

## Constraints

- **Tech stack**: TypeScript + ESM, Express, @modelcontextprotocol/sdk — match MRPeasy patterns
- **Compatibility**: Must follow conventions from `.planning/codebase/CONVENTIONS.md`
- **Auth**: Inventory Planner API Key + Account ID from environment variables
- **Deployment**: Docker container, same pattern as MRPeasy

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Read all endpoints, write only POs | User needs full data access for analytics, but wants explicit control over mutations | ✓ Delivered in v1.0 |
| Reuse MRPeasy resilience patterns | Proven patterns, consistency across servers, reduced implementation risk | ✓ Delivered in v1.0 |
| Standalone server (not combined with MRPeasy) | Different API, different auth, cleaner separation | ✓ Delivered in v1.0 |
| Preview/confirm pattern for writes | All write operations require explicit confirmation | ✓ Delivered in v1.0 |
| App/server separation | Enable testability with supertest | ✓ Delivered in v1.0 |

## Milestones

| Version | Status | Date | Notes |
|---------|--------|------|-------|
| v1.0 | Complete | 2026-01-25 | Production-ready MCP server with 17 requirements satisfied |

See [MILESTONES.md](MILESTONES.md) for detailed milestone history.

---
*Last updated: 2026-01-25 after v1.0 milestone completion*
