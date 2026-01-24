# Requirements

**Project:** Odoo MCP Server
**Version:** v1
**Total:** 35 requirements across 8 categories

---

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: MCP server runs with streamable HTTP transport (Express + SDK ^1.25.0)
- [ ] **INFRA-02**: Session management with TTL and cleanup (prevent OOM)
- [ ] **INFRA-03**: OAuth 2.1 provider with 6 endpoints (authorize, token, register, 2x .well-known, /mcp)
- [ ] **INFRA-04**: Per-user credential store mapping OAuth tokens to Odoo API keys (encrypted SQLite)
- [ ] **INFRA-05**: Odoo JSON-2 client using native fetch with bearer auth
- [ ] **INFRA-06**: Per-user OdooClient instances via LRU cache (session isolation)
- [ ] **INFRA-07**: Docker deployment configuration with health check
- [ ] **INFRA-08**: Instructions resource providing LLM usage guidance

### Accounting

- [ ] **ACCT-01**: User can list and read invoices (vendor bills + customer invoices)
- [ ] **ACCT-02**: User can read bank transactions
- [ ] **ACCT-03**: User can upload an invoice photo (base64 → ir.attachment → OCR)
- [ ] **ACCT-04**: User can check bank sync status (account.online.provider)
- [ ] **ACCT-05**: User can read P&L summary (read_group on account.move.line by account_type)
- [ ] **ACCT-06**: User can read balance sheet summary (read_group on account.move.line)
- [ ] **ACCT-07**: User can read ledger summaries

### HR

- [ ] **HR-01**: User can search employees by name, role, department
- [ ] **HR-02**: User can read employee details (salary, resume, start date, contract)
- [ ] **HR-03**: User can read payslips (own only; admin sees all — enforced by Odoo record rules)
- [ ] **HR-04**: User can read time off balances and requests
- [ ] **HR-05**: User can read employee history (contract changes, amendments)

### Expenses

- [ ] **EXP-01**: User can read their expenses (list + detail)
- [ ] **EXP-02**: User can upload an expense receipt (base64 → ir.attachment → OCR)
- [ ] **EXP-03**: User can read expense analysis (aggregated stats)

### Knowledge

- [ ] **KNOW-01**: User can read knowledge articles (HTML body → markdown)
- [ ] **KNOW-02**: User can create knowledge articles (markdown → HTML)
- [ ] **KNOW-03**: User can update knowledge articles
- [ ] **KNOW-04**: User can delete knowledge articles

### Projects

- [ ] **PROJ-01**: User can list and read projects
- [ ] **PROJ-02**: User can list and read tasks
- [ ] **PROJ-03**: User can create and update projects
- [ ] **PROJ-04**: User can create and update tasks
- [ ] **PROJ-05**: User can launch task templates to create pre-defined task sets

### Decisions

- [ ] **DEC-01**: User can log a decision (custom module — requires Odoo module to exist)
- [ ] **DEC-02**: User can read decisions with filters

### Approvals

- [ ] **APR-01**: User can approve or reject expense reports (hr.expense.sheet workflow)
- [ ] **APR-02**: User can approve or reject decisions
- [ ] **APR-03**: User can approve or reject batch payments

---

## v2 Requirements (Deferred)

- Multi-level approval workflows (currently single-layer)
- Full rendered PDF/HTML report export
- Real-time push notifications (webhooks/SSE from Odoo)
- Generic model access for ad-hoc queries
- Multiple MCP server split by domain (if tool count exceeds ~40)

---

## Out of Scope

- **Generic CRUD on arbitrary models** — workflow tools only; generic access forces LLM to know Odoo internals
- **Odoo module development** — this is a standalone server, not an Odoo addon (except Decisions module which is pre-existing)
- **Public API access** — internal team only, OAuth scoped to known users
- **XML-RPC** — deprecated in Odoo 19, using JSON-2 API instead
- **External OAuth provider (Keycloak)** — embedded provider is simpler for internal team
- **Report rendering** — summary numbers via read_group, not the Odoo report engine

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 2 | Pending |
| INFRA-04 | Phase 2 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 4 | Pending |
| INFRA-08 | Phase 4 | Pending |
| ACCT-01 | Phase 3 | Pending |
| ACCT-02 | Phase 3 | Pending |
| ACCT-03 | Phase 3 | Pending |
| ACCT-04 | Phase 3 | Pending |
| ACCT-05 | Phase 3 | Pending |
| ACCT-06 | Phase 3 | Pending |
| ACCT-07 | Phase 3 | Pending |
| HR-01 | Phase 3 | Pending |
| HR-02 | Phase 3 | Pending |
| HR-03 | Phase 3 | Pending |
| HR-04 | Phase 3 | Pending |
| HR-05 | Phase 3 | Pending |
| EXP-01 | Phase 3 | Pending |
| EXP-02 | Phase 3 | Pending |
| EXP-03 | Phase 3 | Pending |
| KNOW-01 | Phase 3 | Pending |
| KNOW-02 | Phase 3 | Pending |
| KNOW-03 | Phase 3 | Pending |
| KNOW-04 | Phase 3 | Pending |
| PROJ-01 | Phase 3 | Pending |
| PROJ-02 | Phase 3 | Pending |
| PROJ-03 | Phase 3 | Pending |
| PROJ-04 | Phase 3 | Pending |
| PROJ-05 | Phase 3 | Pending |
| DEC-01 | Phase 3 | Pending |
| DEC-02 | Phase 3 | Pending |
| APR-01 | Phase 3 | Pending |
| APR-02 | Phase 3 | Pending |
| APR-03 | Phase 3 | Pending |
