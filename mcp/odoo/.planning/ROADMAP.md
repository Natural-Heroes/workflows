# Roadmap

**Project:** Odoo MCP Server
**Phases:** 4
**Depth:** Quick
**Coverage:** 35/35 requirements mapped

---

## Phase 1: Foundation

**Goal:** A running MCP server that can make authenticated calls to Odoo's JSON-2 API with per-user session isolation.

**Dependencies:** None (starting phase)

**Requirements:** INFRA-01, INFRA-02, INFRA-05, INFRA-06

**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffolding + OdooClient + OdooClientManager
- [x] 01-02-PLAN.md -- MCP server with session management, TTL sweep, test tools

**Success Criteria:**
1. Server starts on a configured port and accepts streamable HTTP connections from an MCP client
2. A test tool can call Odoo's JSON-2 API and return model data using a hardcoded API key
3. Multiple concurrent sessions maintain separate user contexts (no data bleed between sessions)
4. Idle sessions are evicted after TTL expires without crashing or leaking memory

---

## Phase 2: Auth

**Goal:** Users can authenticate via OAuth 2.1 from any Claude client and have their identity mapped to their personal Odoo API key.

**Dependencies:** Phase 1 (transport must exist to protect)

**Requirements:** INFRA-03, INFRA-04

**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md -- Credential store + OAuth provider + clients store + login page
- [x] 02-02-PLAN.md -- Server OAuth integration + MCP tool authInfo pattern

**Success Criteria:**
1. Claude client discovers OAuth endpoints via .well-known metadata and completes authorization flow
2. User authenticates with Odoo credentials during /authorize and receives a valid access token
3. Access token resolves to the correct Odoo API key from the encrypted credential store
4. Unauthorized requests (missing/invalid/expired token) are rejected with proper error responses

---

## Phase 3: Tools

**Goal:** Users can perform all domain workflows (accounting, HR, expenses, knowledge, projects, decisions, approvals) through natural language via Claude.

**Dependencies:** Phase 2 (tools need authenticated per-user Odoo access)

**Requirements:** ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05, ACCT-06, ACCT-07, HR-01, HR-02, HR-03, HR-04, HR-05, EXP-01, EXP-02, EXP-03, KNOW-01, KNOW-02, KNOW-03, KNOW-04, PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, DEC-01, DEC-02, APR-01, APR-02, APR-03

**Implemented:**
- OdooClient.readGroup method for aggregation
- HTML↔Markdown converters (turndown + marked)
- 7 accounting tools (list_invoices, read_invoice, read_transactions, upload_invoice_attachment, bank_sync_status, pl_summary, balance_sheet)
- 4 HR tools (search_employees, read_employee, read_payslips, read_time_off)
- 3 expense tools (read_expenses, upload_receipt, expense_analysis)
- 4 knowledge tools (read_articles, create_article, update_article, delete_article)
- 5 project tools (list_projects, list_tasks, create_project, create_task, launch_template)
- 2 decision tools (log_decision, read_decisions)
- 3 approval tools (approve_expense, approve_decision, validate_payment)

**Success Criteria:**
1. User can read and upload invoices/receipts (Odoo handles OCR in the background automatically)
2. User can query employees, payslips, time off, and expenses -- seeing only what their Odoo permissions allow
3. User can read, create, update, and delete knowledge articles with proper HTML/markdown conversion
4. User can manage projects/tasks and launch task templates to create pre-defined task sets
5. User can approve or reject expenses, decisions, and batch payments through the appropriate workflow actions

---

## Phase 4: Deployment

**Goal:** The server runs in production on Dokploy with health monitoring and LLM usage guidance.

**Dependencies:** Phase 3 (all functionality must exist before production deployment)

**Requirements:** INFRA-07, INFRA-08

**Success Criteria:**
1. Docker container builds, starts, and passes health check within 30 seconds
2. Health endpoint reports server status including session count and Odoo connectivity
3. Instructions resource provides Claude with domain context so it can guide users effectively

---

## Progress

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | Foundation | 4 | Done |
| 2 | Auth | 2 | Done |
| 3 | Tools | 27 | Done |
| 4 | Deployment | 2 | Done |
| **Total** | | **35** | |
