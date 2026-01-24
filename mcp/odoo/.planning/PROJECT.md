# Odoo MCP Server

## What This Is

A custom MCP server that gives the Natural Heroes team AI-powered access to their Odoo ERP system. Team members connect from Claude (iOS, web, desktop) and interact with Odoo data through natural language — reading invoices, checking payslips, managing projects, approving expenses, and more. Hosted on Dokploy, authenticated via OAuth 2.1, respecting Odoo's native per-user security.

## Core Value

Team members can securely access and act on their Odoo data from any Claude client, with each user seeing only what their Odoo permissions allow.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Streamable HTTP transport with session-based architecture
- [ ] OAuth 2.1 authentication mapping users to their Odoo API keys
- [ ] XML-RPC service layer connecting to Odoo instance
- [ ] Per-user security enforcement (Odoo ACLs + record rules apply)
- [ ] Accounting: upload invoice (binary → attachment → OCR)
- [ ] Accounting: read invoices
- [ ] Accounting: read transactions
- [ ] Accounting: check bank sync status
- [ ] Accounting: read reports (P&L, balance sheet) — summary numbers
- [ ] Accounting: ledger summaries
- [ ] HR: search employees (name, role, etc.)
- [ ] HR: read employee details (salary, resume, start date, contract)
- [ ] HR: read payslips (own only, or all if admin)
- [ ] HR: read time off
- [ ] HR: read employee history
- [ ] Expenses: upload expense receipt (binary → attachment → OCR)
- [ ] Expenses: read expenses
- [ ] Expenses: expense analysis
- [ ] Knowledge: read articles (full markdown content)
- [ ] Knowledge: create articles
- [ ] Knowledge: update articles
- [ ] Knowledge: delete articles
- [ ] Projects: CRUD projects
- [ ] Projects: CRUD tasks
- [ ] Projects: launch task templates
- [ ] Decisions: log decisions (custom module)
- [ ] Decisions: read decisions
- [ ] Approvals: approve decisions
- [ ] Approvals: approve expenses
- [ ] Approvals: approve batch payments
- [ ] Docker deployment configuration
- [ ] Health check endpoint
- [ ] Instructions resource for LLM guidance

### Out of Scope

- Generic CRUD on arbitrary Odoo models — workflow-oriented tools only, not a raw ORM wrapper
- Odoo module development — this is a standalone server, not an Odoo addon
- Public API access — internal team only
- Real-time push notifications — request/response only
- Report rendering (PDF/HTML) — summary numbers only for v1
- Multi-level approval workflows — single-layer approve/reject for v1

## Context

**Existing infrastructure:**
- Two MCP servers already built with the same stack (mrpeasy, Perdoo) in `/Code/workflows/mcp/`
- Both use `@modelcontextprotocol/sdk` v1.15.0, Express, Zod, TypeScript, Docker
- Both follow identical architecture: `src/server.ts` + `src/mcp/tools/<domain>.ts` + `src/services/<name>/`
- Perdoo adds circuit breaker, rate limiter, retry — useful patterns for remote API resilience
- Odoo instance runs on Odoo.sh (production) with XML-RPC accessible

**Odoo modules involved:**
- `account.move` — invoices/bills
- `account.bank.statement.line` — transactions
- `account.online.provider` — bank sync status
- `hr.employee` — employee records
- `hr.payslip` — payslips (record-rule protected)
- `hr.leave` — time off
- `hr.expense` — expenses
- `knowledge.article` — articles
- `project.project` / `project.task` — projects and tasks
- `nh_project_task_template` — task templates (custom module)
- Custom decisions module (model TBD)
- `approval.request` — approvals

**Auth challenge:**
Unlike mrpeasy/Perdoo (single API key in env vars), this server needs per-user authentication. Claude's remote MCP integrations require OAuth 2.1. Each user's OAuth token maps to their Odoo API key, ensuring Odoo enforces their specific permissions.

**Existing Odoo MCP module (apps.odoo.com):**
Evaluated and rejected. It's a REST/XML-RPC API gateway, not a real MCP server. The actual MCP protocol is handled by an external package (`mcp-server-odoo`) that exposes generic CRUD tools. Neither is workflow-oriented or worth building on.

## Constraints

- **Stack**: TypeScript + `@modelcontextprotocol/sdk` v1.15.0 + Express + Zod — must match mrpeasy/Perdoo pattern
- **Transport**: Streamable HTTP only (required for Claude iOS/web access)
- **Auth**: OAuth 2.1 (mandatory for Claude remote MCP integrations)
- **Security**: All data access must respect Odoo's per-user ACLs and record rules — no privilege escalation
- **Hosting**: Dokploy (Docker-based, existing infrastructure)
- **Tool count**: ~25-30 tools across 7 domains — well within safe range (<50)
- **Response size**: ~25,000 token limit per response, truncate with indicator if exceeded
- **Odoo connection**: XML-RPC to Odoo.sh instance (existing, no new endpoints needed)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build from scratch, not extend existing Odoo module | Existing module is a REST gateway, not MCP. No protocol implementation to build on | — Pending |
| TypeScript over Python (FastMCP) | Consistency with mrpeasy/Perdoo; team already has the pattern | — Pending |
| Streamable HTTP, not stdio | Need mobile (Claude iOS) and web access, not just local desktop | — Pending |
| Workflow-oriented tools, not generic CRUD | Generic CRUD forces LLM to know Odoo internals; workflows are more reliable | — Pending |
| Per-user OAuth → Odoo API key mapping | Claude remote integrations require OAuth 2.1; Odoo keys enforce permissions | — Pending |
| Hosted on Dokploy | Existing infrastructure, Docker-native, team already uses it | — Pending |
| Live in /Code/workflows/mcp/odoo/ | Consistent with mrpeasy/Perdoo organization; MCP servers are infrastructure, not Odoo modules | — Pending |

---
*Last updated: 2026-01-23 after initialization*
