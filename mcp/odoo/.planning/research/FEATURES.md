# Feature Landscape: Odoo MCP Server Tools

**Domain:** ERP MCP Server (workflow-oriented tools for Odoo 19)
**Researched:** 2026-01-23
**Overall Confidence:** HIGH (verified against MCP spec, Odoo docs, existing codebase patterns)

---

## Tool Granularity Strategy

**Recommendation: One tool per action, NOT consolidated tools with action parameters.**

Rationale based on the mrpeasy pattern already in use:
- `get_customer_orders` (list) vs `get_customer_order_details` (single) -- separate tools
- Each tool has focused input schema with Zod validation
- LLM tool selection works better with distinct, descriptively-named tools
- Consolidated "do everything" tools create ambiguous parameter combinations

**Naming convention:** `{verb}_{domain}_{entity}` -- e.g., `read_accounting_invoices`, `upload_expense_receipt`

**Target: 28 tools across 7 domains** (within the 25-30 range specified in constraints).

---

## Table Stakes

Features users expect. Missing = product feels incomplete.

### Domain 1: Accounting (6 tools)

| Tool | Description | Odoo Model(s) | Key Fields | Complexity |
|------|-------------|----------------|------------|------------|
| `upload_invoice` | Upload invoice image, create attachment, trigger OCR | `account.move`, `ir.attachment` | `move_type='in_invoice'`, `datas` (base64) | HIGH |
| `read_invoices` | List/search invoices with filters (status, date, partner) | `account.move` | `name`, `partner_id`, `amount_total`, `state`, `payment_state`, `invoice_date` | LOW |
| `read_transactions` | List bank transactions with filters | `account.bank.statement.line` | `amount`, `date`, `payment_ref`, `partner_id`, `is_reconciled` | LOW |
| `read_bank_sync_status` | Check bank synchronization health | `account.online.provider` | `status`, `last_refresh`, `next_refresh`, `provider_type` | LOW |
| `read_report_pnl` | Profit & Loss summary numbers for date range | `account.move.line` (read_group) | `balance` grouped by `account_id` where `account_type` in income/expense types | MED |
| `read_report_balance_sheet` | Balance Sheet summary numbers at a date | `account.move.line` (read_group) | `balance` grouped by `account_id` where `account_type` in asset/liability types | MED |

**Implementation notes for reports:**

P&L uses `read_group` on `account.move.line` with domain:
```python
[
  ('parent_state', '=', 'posted'),
  ('date', '>=', date_from),
  ('date', '<=', date_to),
  ('account_id.account_type', 'in', [
    'income', 'income_other',
    'expense', 'expense_depreciation', 'expense_direct_cost'
  ])
]
```
Group by `account_id` or `account_id.account_type`, aggregate `balance`.

Balance Sheet uses same pattern but with:
```python
('account_id.account_type', 'in', [
  'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current',
  'asset_fixed', 'asset_prepayments',
  'liability_payable', 'liability_credit_card',
  'liability_current', 'liability_non_current',
  'equity', 'equity_unaffected'
])
```
And date filter is `('date', '<=', as_of_date)` (cumulative, not period).

**Confidence: HIGH** -- verified via Odoo source code patterns on GitHub for account_type values and read_group usage.

---

### Domain 2: HR (5 tools)

| Tool | Description | Odoo Model(s) | Key Fields | Complexity |
|------|-------------|----------------|------------|------------|
| `search_employees` | Search employees by name, department, job | `hr.employee` | `name`, `department_id`, `job_id`, `work_email`, `parent_id` | LOW |
| `read_employee_details` | Full employee profile (salary, contract, resume) | `hr.employee`, `hr.contract` | `name`, `department_id`, `job_id`, `contract_id`, `identification_id`, `work_email`, `coach_id` | MED |
| `read_payslips` | Read payslips (own only unless admin) | `hr.payslip`, `hr.payslip.line` | `employee_id`, `date_from`, `date_to`, `state`, `struct_id`, lines: `code`, `amount` | MED |
| `read_time_off` | Read leave requests and balances | `hr.leave`, `hr.leave.allocation` | `employee_id`, `holiday_status_id`, `date_from`, `date_to`, `state`, `number_of_days` | LOW |
| `read_employee_history` | Employment timeline (contracts, department changes) | `hr.contract`, `hr.employee` | `date_start`, `date_end`, `state`, `wage`, `department_id`, `job_id` | MED |

**Security enforcement:**
- Record rules on `hr.payslip` restrict access: employees see only their own payslips, department managers see their team's. HR managers see all. This is enforced automatically by XML-RPC when authenticated as the user.
- Domain: `['|', ('employee_id.user_id', '=', user.id), ('employee_id.department_id.manager_id.user_id', '=', user.id)]`
- No MCP-side filtering needed -- Odoo enforces this via `ir.rule` on every `search`/`read` call through XML-RPC.

**Confidence: HIGH** -- verified via Odoo forum posts and documentation on hr.payslip record rules.

---

### Domain 3: Expenses (3 tools)

| Tool | Description | Odoo Model(s) | Key Fields | Complexity |
|------|-------------|----------------|------------|------------|
| `upload_expense_receipt` | Upload receipt image, create expense with OCR | `hr.expense`, `ir.attachment` | `name`, `total_amount`, `employee_id`, `product_id`, `payment_mode`, `datas` (base64) | HIGH |
| `read_expenses` | List expenses with filters (status, date, employee) | `hr.expense` | `name`, `total_amount`, `state`, `employee_id`, `product_id`, `payment_mode`, `date` | LOW |
| `read_expense_analysis` | Expense totals grouped by category/period/employee | `hr.expense` (read_group) | `total_amount` grouped by `product_id`, `employee_id`, `date` | MED |

**Expense states:** `draft` -> `reported` -> `approved` -> `done` -> `paid` (plus `refused`)

**Confidence: HIGH** -- verified via Odoo documentation and source.

---

### Domain 4: Knowledge (4 tools)

| Tool | Description | Odoo Model(s) | Key Fields | Complexity |
|------|-------------|----------------|------------|------------|
| `read_articles` | Search/list articles, return full markdown content | `knowledge.article` | `name`, `body` (HTML), `parent_id`, `category`, `icon`, `write_date` | MED |
| `create_article` | Create new article with markdown content | `knowledge.article` | `name`, `body` (HTML), `parent_id`, `icon` | MED |
| `update_article` | Update article title/content | `knowledge.article` | `name`, `body` (HTML), `icon` | MED |
| `delete_article` | Archive/delete an article | `knowledge.article` | `active` (set to False for archive) | LOW |

**HTML-to-Markdown conversion:**
- Odoo stores `body` as HTML in the database
- MCP tools should return content as Markdown (more LLM-friendly)
- Use `markdownify` (Python) or equivalent TypeScript library for HTML->Markdown
- Accept Markdown input, convert to HTML before writing to Odoo
- Recommended TypeScript library: `turndown` (HTML->Markdown) + `marked` or `showdown` (Markdown->HTML)

**Category field:** Computed from access rights (`workspace`, `private`, `shared`). Not directly settable -- determined by the article's permission configuration.

**Article hierarchy:** `parent_id` creates nesting. Nested articles inherit parent access rights.

**Confidence: HIGH** -- verified via Odoo 19 documentation.

---

### Domain 5: Projects (5 tools)

| Tool | Description | Odoo Model(s) | Key Fields | Complexity |
|------|-------------|----------------|------------|------------|
| `read_projects` | List projects with task counts and status | `project.project` | `name`, `user_id`, `partner_id`, `task_count`, `date_start` | LOW |
| `create_task` | Create a new task in a project | `project.task` | `name`, `project_id`, `stage_id`, `user_ids`, `date_deadline`, `description`, `priority`, `tag_ids` | LOW |
| `update_task` | Update task fields (stage, assignee, deadline, etc.) | `project.task` | any writable field | LOW |
| `read_tasks` | Search/list tasks with filters | `project.task` | `name`, `project_id`, `stage_id`, `user_ids`, `state`, `priority` | LOW |
| `launch_task_template` | Create task(s) from template | `project.task` | calls `action_create_from_template()` on template records where `is_template=True` | MED |

**Template mechanism:**
- Uses the existing `nh_project_task_template` module
- Template tasks have `is_template=True` (filtered out of normal views)
- `action_create_from_template()` copies the task, clears user/deadline, preserves child tasks
- Via XML-RPC: call `search` with `[('is_template', '=', True)]` to find templates, then call `action_create_from_template` on the record

**Stage management:**
- `stage_id` is a Many2one to `project.task.type` (Kanban columns like "New", "In Progress", "Done")
- XML-RPC returns as tuple: `[stage_id, "Stage Name"]`
- Moving a task = writing new `stage_id` value

**Confidence: HIGH** -- verified against actual codebase in nh_project_task_template module.

---

### Domain 6: Decisions (2 tools)

| Tool | Description | Odoo Model(s) | Key Fields | Complexity |
|------|-------------|----------------|------------|------------|
| `log_decision` | Record a decision with context and rationale | Custom model (TBD) | `name`, `description`, `date`, `user_id`, `category`, `status` | LOW |
| `read_decisions` | Search/list decisions | Custom model (TBD) | Same as above | LOW |

**Note:** This requires a custom Odoo module to be built. Model name TBD (likely `nh.decision`).

**Confidence: MEDIUM** -- custom module, no existing implementation to verify against.

---

### Domain 7: Approvals (3 tools)

| Tool | Description | Odoo Model(s) | Key Fields | Complexity |
|------|-------------|----------------|------------|------------|
| `approve_request` | Approve a pending approval request (decisions, expenses, payments) | `approval.request`, `hr.expense`, `account.payment.order` | `request_status`, approval action methods | MED |
| `reject_request` | Reject/refuse a pending request with reason | Same as above | `request_status` + refusal reason | MED |
| `read_pending_approvals` | List all pending items awaiting user's approval | Multiple models | Composite query across approval-capable models | MED |

**Odoo Approvals module (`approval.request`) states:**
- `new` -> `pending` -> `approved` / `refused` / `cancel`
- Submit action: New -> Pending
- Approve action: Pending -> Approved (when minimum approvers reached)
- Refuse action: Pending -> Refused

**Expense approval:** separate from `approval.request`
- State `reported` = awaiting approval
- Method: `action_approve_expense_sheets()` on the expense sheet
- Only users in `hr.group_hr_user` can approve

**Payment order approval:** via `account.payment.order`
- Standard workflow varies by configuration

**Confidence: MEDIUM** -- approval.request model verified via documentation, but exact method names for approve/reject need verification against Odoo 19 source.

---

## File Upload Mechanism

### How Binary Content Flows: Claude -> MCP Server -> Odoo

**Step 1: User sends image to Claude**
- User attaches photo of invoice/receipt in Claude conversation
- Claude receives it as base64 image content in the conversation

**Step 2: Claude calls MCP tool with base64 data**
- MCP tool `inputSchema` defines a `file_data` parameter of type `string` (base64-encoded)
- MCP tool also accepts `file_name` (string) and `mime_type` (string)
- Claude passes the base64 content as a string argument to the tool

**Important limitation (verified):** The MCP protocol specification (2025-11-25) defines `inputSchema` as JSON Schema for tool arguments. Tool arguments are JSON objects -- they can contain strings (including base64-encoded binary). There is NO native binary transport in tool arguments. Base64 string in JSON is the mechanism.

**Community status:** Active discussion (GitHub Discussion #1197) confirms base64 in tool arguments works but is "unreliable for large files." For invoice/receipt photos (typically 100KB-2MB), this is acceptable. SEP-1306 proposes binary elicitation mode but is not yet ratified.

**Step 3: MCP server creates ir.attachment in Odoo**
```typescript
// Tool receives base64 string from Claude
const attachmentId = await odooClient.execute_kw(
  'ir.attachment', 'create', [{
    name: fileName,
    type: 'binary',
    res_model: 'account.move',  // or 'hr.expense'
    res_id: recordId,
    datas: fileData,  // base64 string - XML-RPC handles this natively
    mimetype: mimeType,
  }]
);
```

**Step 4: Trigger OCR (if configured)**
- Odoo's Digitization/OCR features (for invoices and expenses) may trigger automatically when an attachment is created
- For invoices: creating a vendor bill with an attachment may trigger the extract API
- For expenses: the `hr.expense` digitization feature processes receipts when enabled
- OCR requires IAP credits configured in the Odoo instance

**Tool input schema pattern:**
```typescript
const UploadInvoiceSchema = z.object({
  file_data: z.string().describe('Base64-encoded file content (PDF, PNG, JPG)'),
  file_name: z.string().describe('Original filename with extension'),
  mime_type: z.string().optional().describe('MIME type (auto-detected from extension if omitted)'),
  partner_id: z.number().optional().describe('Vendor/partner ID if known'),
});
```

**Confidence: HIGH** -- verified MCP spec (2025-11-25), Odoo ir.attachment creation patterns, and XML-RPC base64 handling.

---

## Record Rule Enforcement

**Critical finding: XML-RPC respects ir.rule automatically.**

When the MCP server authenticates to Odoo XML-RPC as a specific user (via their API key mapped through OAuth):
1. **ACLs (ir.model.access)** are enforced on every CRUD operation
2. **Record rules (ir.rule)** are evaluated record-by-record after ACL check
3. No additional filtering needed in the MCP server -- Odoo handles it

**What this means for the MCP server:**
- Payslip access: Employee sees only their own. Manager sees team. HR Manager sees all. Automatic.
- Expense access: Standard expense record rules apply per user.
- Project access: Users see only projects/tasks they have access to.

**Exception: Non-CRUD method calls.** Methods like `action_approve_expense_sheets()` or `action_create_from_template()` are public methods called via XML-RPC. ACL/record-rule verification does NOT happen automatically for these -- the method implementation itself must check permissions. Odoo's built-in methods typically do this, but it is worth verifying for each approval action.

**Confidence: HIGH** -- verified via Odoo 19 security documentation.

---

## Differentiators

Features that set this product apart from generic Odoo API wrappers.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Workflow-oriented tool names | LLM doesn't need to know Odoo internals | LOW | Already decided in project constraints |
| Markdown in/out for Knowledge | LLM-native format, not raw HTML | MED | Requires HTML<->Markdown conversion layer |
| Report summaries as structured data | Actionable numbers, not rendered PDFs | MED | read_group aggregation, not report renderer |
| Composite `read_pending_approvals` | Single tool shows all items needing action | MED | Queries multiple models, returns unified list |
| Template launching | Create standardized task sets in one call | LOW | Leverages existing nh_project_task_template module |
| Expense analysis with grouping | "What did we spend on travel last quarter?" | MED | read_group with flexible groupby |
| Instructions resource | LLM reads usage guide on connection | LOW | Pattern from mrpeasy -- `odoo://instructions` resource |
| Per-user security context | Each user sees only their own data | LOW (Odoo handles it) | OAuth token -> Odoo API key mapping |

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Generic CRUD on any model | Forces LLM to know Odoo model names, fields, domains | Build workflow-oriented tools with pre-configured domains |
| PDF/HTML report rendering | Too large for MCP responses, LLM can't parse them | Return structured summary numbers via read_group |
| Multi-level approval chains | Overly complex for v1, hard to surface in conversation | Single-layer approve/reject only |
| Real-time push/subscriptions | MCP supports notifications but adds major complexity | Request/response only |
| Write access to accounting entries | High-risk financial data, easy to corrupt | Read-only for journal entries; write only for uploading new invoices |
| Direct SQL queries | Bypasses ORM security, ACLs, record rules | Always use XML-RPC execute_kw |
| Bulk operations (mass update/delete) | Risky in conversational context, hard to undo | Single-record operations with confirmation |
| Arbitrary field selection | LLM doesn't know which fields exist or are useful | Pre-selected field lists per tool, curated for usefulness |
| Raw Odoo error messages | Cryptic tracebacks, not user-friendly | Map common errors to human-readable messages |
| File downloads (get attachment content) | Large binary responses blow up context window | Provide metadata/links, not file content |

---

## Feature Dependencies

```
Authentication (OAuth 2.1 + API key mapping)
  |
  v
XML-RPC Service Layer (execute_kw, read_group)
  |
  +---> Accounting tools (depend on: account.move, account.move.line access)
  |       +---> upload_invoice (depends on: ir.attachment creation)
  |       +---> read_report_pnl / read_report_balance_sheet (depend on: read_group)
  |
  +---> HR tools (depend on: hr.employee, hr.payslip, hr.leave access)
  |       +---> read_payslips (depends on: record rules working correctly)
  |
  +---> Expense tools (depend on: hr.expense access)
  |       +---> upload_expense_receipt (depends on: ir.attachment creation)
  |       +---> read_expense_analysis (depends on: read_group)
  |
  +---> Knowledge tools (depend on: knowledge.article access)
  |       +---> All CRUD (depends on: HTML<->Markdown conversion library)
  |
  +---> Project tools (depend on: project.project, project.task access)
  |       +---> launch_task_template (depends on: nh_project_task_template module installed)
  |
  +---> Decision tools (depend on: custom nh.decision module -- MUST BE BUILT FIRST)
  |
  +---> Approval tools (depend on: approval.request + hr.expense + account.payment.order access)
        +---> read_pending_approvals (depends on: all approvable models being accessible)
        +---> approve_request / reject_request (depend on: action methods being callable via XML-RPC)
```

**Critical path:** OAuth -> XML-RPC layer -> per-domain tools. Decisions module is a blocker for that domain.

---

## MVP Recommendation

For MVP, prioritize these 18 tools (covering core read + one write workflow):

**Phase 1 (Foundation):**
1. Authentication + XML-RPC service layer
2. `read_invoices` (validates the full stack)
3. `read_transactions`
4. `search_employees`
5. `read_tasks`
6. Instructions resource

**Phase 2 (Core Read):**
7. `read_employee_details`
8. `read_payslips`
9. `read_time_off`
10. `read_expenses`
11. `read_projects`
12. `read_articles`
13. `read_bank_sync_status`

**Phase 3 (Write + Reports):**
14. `create_task` / `update_task`
15. `create_article` / `update_article`
16. `read_report_pnl` / `read_report_balance_sheet`
17. `upload_invoice`
18. `upload_expense_receipt`

**Defer to post-MVP:**
- `delete_article`: Low priority, can archive via update
- `read_employee_history`: Nice-to-have, not urgent
- `read_expense_analysis`: Aggregation can wait
- `launch_task_template`: Needs template module verified on production
- All Decision tools: Requires custom module to be built
- All Approval tools: Complex, needs method verification

---

## Odoo Model Field Reference

### account.move (Invoices/Bills)
| Field | Type | Notes |
|-------|------|-------|
| `name` | Char | Invoice number (e.g., "INV/2024/0001") |
| `move_type` | Selection | `out_invoice`, `in_invoice`, `out_refund`, `in_refund`, `entry` |
| `partner_id` | Many2one -> res.partner | Customer/Vendor |
| `invoice_date` | Date | Invoice date |
| `amount_total` | Monetary | Total amount |
| `amount_residual` | Monetary | Amount due (unpaid) |
| `state` | Selection | `draft`, `posted`, `cancel` |
| `payment_state` | Selection | `not_paid`, `in_payment`, `paid`, `partial`, `reversed` |
| `invoice_line_ids` | One2many | Line items |

### account.bank.statement.line (Transactions)
| Field | Type | Notes |
|-------|------|-------|
| `date` | Date | Transaction date |
| `amount` | Float | Transaction amount |
| `payment_ref` | Char | Payment reference/description |
| `partner_id` | Many2one -> res.partner | Counterparty |
| `is_reconciled` | Boolean | Whether matched to invoice/bill |
| `journal_id` | Many2one -> account.journal | Bank journal |

### hr.employee
| Field | Type | Notes |
|-------|------|-------|
| `name` | Char | Full name |
| `department_id` | Many2one -> hr.department | Department |
| `job_id` | Many2one -> hr.job | Job title |
| `parent_id` | Many2one -> hr.employee | Manager |
| `work_email` | Char | Work email |
| `contract_id` | Many2one -> hr.contract | Active contract |
| `identification_id` | Char | Employee ID number |

### hr.payslip
| Field | Type | Notes |
|-------|------|-------|
| `employee_id` | Many2one -> hr.employee | Employee (required) |
| `date_from` | Date | Period start |
| `date_to` | Date | Period end |
| `state` | Selection | `draft`, `verify`, `done`, `cancel` |
| `struct_id` | Many2one -> hr.payroll.structure | Salary structure |
| `line_ids` | One2many -> hr.payslip.line | Computed salary lines |
| `name` | Char | Payslip name/reference |

### hr.expense
| Field | Type | Notes |
|-------|------|-------|
| `name` | Char | Expense description |
| `total_amount` | Float | Total amount |
| `employee_id` | Many2one -> hr.employee | Employee |
| `product_id` | Many2one -> product.product | Expense category |
| `payment_mode` | Selection | `own_account` (reimburse) or `company_account` |
| `state` | Selection | `draft`, `reported`, `approved`, `done`, `refused` |
| `date` | Date | Expense date |
| `sheet_id` | Many2one -> hr.expense.sheet | Expense report |

### knowledge.article
| Field | Type | Notes |
|-------|------|-------|
| `name` | Char | Article title |
| `body` | Html | Article content (stored as HTML) |
| `parent_id` | Many2one -> knowledge.article | Parent article (hierarchy) |
| `category` | Selection | `workspace`, `private`, `shared` (computed from access rights) |
| `icon` | Char | Emoji icon |
| `active` | Boolean | Archived if False |

### project.task
| Field | Type | Notes |
|-------|------|-------|
| `name` | Char | Task title |
| `project_id` | Many2one -> project.project | Parent project |
| `stage_id` | Many2one -> project.task.type | Kanban stage |
| `user_ids` | Many2many -> res.users | Assignees |
| `date_deadline` | Date | Deadline |
| `description` | Html | Task description |
| `priority` | Selection | `0` (Normal), `1` (Important) |
| `is_template` | Boolean | Template flag (nh_project_task_template) |

### approval.request
| Field | Type | Notes |
|-------|------|-------|
| `name` | Char | Request title |
| `request_status` | Selection | `new`, `pending`, `approved`, `refused`, `cancel` |
| `request_owner_id` | Many2one -> res.users | Requester |
| `category_id` | Many2one -> approval.category | Request type |
| `date_confirmed` | Datetime | When submitted |
| `approver_ids` | One2many | Approval entries |

---

## Sources

### MCP Protocol
- [MCP Tools Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [SEP-1306: Binary Mode Elicitation](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1306)
- [File Upload Discussion #1197](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1197)
- [Multi-Modal MCP Servers (HackerNoon)](https://hackernoon.com/multi-modal-mcp-servers-handling-files-images-and-streaming-data)

### Odoo Documentation
- [Security in Odoo 19.0 (Record Rules)](https://www.odoo.com/documentation/19.0/developer/reference/backend/security.html)
- [Knowledge Articles (Odoo 19.0)](https://www.odoo.com/documentation/19.0/applications/productivity/knowledge.html)
- [Bank Synchronization (Odoo 19.0)](https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/bank_synchronization.html)
- [Custom Reports (Odoo 19.0)](https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/customize.html)
- [Payslips (Odoo 19.0)](https://www.odoo.com/documentation/19.0/applications/hr/payroll/payslips.html)
- [Time Off Management (Odoo 19.0)](https://www.odoo.com/documentation/19.0/applications/hr/time_off/management.html)
- [Log Expenses (Odoo 19.0)](https://www.odoo.com/documentation/19.0/applications/finance/expenses/log_expenses.html)
- [Approval Rules (Odoo 19.0)](https://www.odoo.com/documentation/19.0/applications/studio/approval_rules.html)
- [External API (Odoo 19.0)](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
- [Restrict Data Access (Odoo 19.0)](https://www.odoo.com/documentation/19.0/developer/tutorials/restrict_data_access.html)

### Odoo Source / Community
- [account.move.line (GitHub, Odoo 16.0)](https://github.com/odoo/odoo/blob/16.0/addons/account/models/account_move_line.py)
- [account.account account_type (GitHub, Odoo 17.0)](https://github.com/odoo/odoo/blob/17.0/addons/account/models/account_account.py)
- [Attachment via XML-RPC (Odoo Forum)](https://www.odoo.com/forum/help-1/how-to-add-attachement-through-xml-rpc-webservice-120539)
- [Payslip Access Denied (Odoo Forum)](https://www.odoo.com/forum/help-1/access-denied-with-payslip-28246)

### Libraries
- [markdownify (Python)](https://github.com/matthewwithanm/python-markdownify)
- [turndown (JavaScript, HTML->Markdown)](https://github.com/mixmark-io/turndown)
- [html-to-markdown (Python, typed fork)](https://pypi.org/project/html-to-markdown/1.3.1/)
