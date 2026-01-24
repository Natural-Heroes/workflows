# Phase 3: Tools - Research

**Researched:** 2026-01-24
**Domain:** Odoo 19 JSON-2 API models, fields, and methods
**Confidence:** MEDIUM-HIGH

## Summary

This research phase investigated the Odoo 19 models and APIs needed to implement ~28 tools across 7 domains (Accounting, HR, Expenses, Knowledge, Projects, Decisions, Approvals). The research focused on identifying exact model names, key fields for each domain, method signatures for CRUD and special operations, and gaps in the current OdooClient implementation.

**Key findings:**
- All models use the JSON-2 API format (`/json/2/{model}/{method}`) with bearer token authentication
- The current OdooClient supports searchRead, read, create, write, unlink, and generic call methods
- **Critical gap:** `read_group` method is NOT implemented but needed for reports (P&L, balance sheet, ledger)
- HTML↔Markdown conversion needed for Knowledge articles (turndown + marked packages)
- Custom modules (nh.decision, project.task templates) are well-documented in codebase

**Primary recommendation:** Add `read_group` method to OdooClient first (required for 6 of 28 tools), then implement tools in order: basic CRUD operations first, then reports/approvals that depend on read_group.

## Standard Stack

### Core Dependencies (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.25.0 | MCP server framework | Official MCP SDK |
| zod | ^3.25.0 | Schema validation | De facto TypeScript validation library |
| express | ^4.21.0 | HTTP server | Industry standard Node.js web framework |
| better-sqlite3 | ^12.6.2 | Credential storage | Fast, synchronous SQLite for Node |

### New Dependencies Needed
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| turndown | latest | HTML → Markdown | Knowledge article reads (KNOW-01) |
| marked | latest | Markdown → HTML | Knowledge article creates/updates (KNOW-02, KNOW-03) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| turndown | showdown (bidirectional) | Showdown is heavier; turndown is specialized for HTML→MD only |
| marked | markdown-it | Marked is faster and simpler; markdown-it has more plugins |

**Installation:**
\`\`\`bash
npm install turndown marked
\`\`\`

## Architecture Patterns

### Recommended Project Structure
\`\`\`
src/
├── mcp/
│   ├── tools/
│   │   ├── accounting/        # ACCT-01 through ACCT-07
│   │   ├── hr/                # HR-01 through HR-05
│   │   ├── expenses/          # EXP-01 through EXP-03
│   │   ├── knowledge/         # KNOW-01 through KNOW-04
│   │   ├── projects/          # PROJ-01 through PROJ-05
│   │   ├── decisions/         # DEC-01, DEC-02
│   │   └── approvals/         # APR-01 through APR-03
│   └── index.ts
├── services/
│   └── odoo/
│       ├── client.ts          # Add read_group method here
│       └── types.ts           # Add OdooReadGroupOptions interface
└── lib/
    └── converters.ts          # HTML↔Markdown utilities (new file)
\`\`\`

### Pattern 1: Basic CRUD Tool (List/Read)
**What:** Standard pattern for listing and reading records
**When to use:** Most tools (invoices, employees, expenses, projects, tasks, decisions)

**Example:**
\`\`\`typescript
// Source: Existing test-odoo.ts tool + research findings
import { z } from 'zod';

const ListInvoicesSchema = z.object({
  limit: z.number().optional().default(100),
  offset: z.number().optional().default(0),
  state: z.enum(['draft', 'posted', 'cancel']).optional(),
  move_type: z.enum(['out_invoice', 'out_refund', 'in_invoice', 'in_refund']).optional(),
});

server.addTool({
  name: 'list_invoices',
  description: 'List customer and vendor invoices',
  inputSchema: zodToJsonSchema(ListInvoicesSchema),
  handler: async (params, extra) => {
    // 1. Get API key from extra.authInfo.extra.odooApiKey
    const apiKey = extra?.authInfo?.extra?.odooApiKey as string;
    if (!apiKey) throw new Error('Missing Odoo API key');

    // 2. Get OdooClient
    const client = clientManager.getClient(apiKey);

    // 3. Build domain filter
    const domain: unknown[] = [];
    if (params.state) domain.push(['state', '=', params.state]);
    if (params.move_type) domain.push(['move_type', '=', params.move_type]);

    // 4. Call searchRead
    const invoices = await client.searchRead<Invoice>(
      'account.move',
      domain,
      ['id', 'name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'move_type'],
      { limit: params.limit, offset: params.offset, order: 'invoice_date desc' }
    );

    // 5. Return formatted result
    return { content: [{ type: 'text', text: JSON.stringify(invoices, null, 2) }] };
  },
});
\`\`\`

### Pattern 2: File Upload (Binary Attachments)
**What:** Upload photos/receipts as ir.attachment with base64 encoding
**When to use:** Invoice photo upload (ACCT-03), expense receipt upload (EXP-02)

**Example:**
\`\`\`typescript
// Source: Odoo forum discussions + official docs
const UploadInvoicePhotoSchema = z.object({
  invoice_id: z.number(),
  filename: z.string(),
  base64_data: z.string(), // base64-encoded file
  mimetype: z.string().optional().default('image/jpeg'),
});

handler: async (params, extra) => {
  const client = clientManager.getClient(apiKey);

  // Create ir.attachment linked to account.move
  const attachmentId = await client.create('ir.attachment', {
    name: params.filename,
    datas: params.base64_data, // base64 string
    res_model: 'account.move',
    res_id: params.invoice_id,
    mimetype: params.mimetype,
  });

  // Odoo automatically triggers OCR if Document Digitization is enabled
  // No additional method call needed

  return { content: [{ type: 'text', text: \`Uploaded attachment \${attachmentId}\` }] };
}
\`\`\`

**Key insight:** Odoo's document digitization (OCR) is automatic when enabled in settings. Simply creating the ir.attachment with \`res_model='account.move'\` triggers the OCR workflow.

### Pattern 3: Read Group for Reports
**What:** Aggregate data grouped by dimensions (account, employee, product)
**When to use:** P&L summary (ACCT-05), balance sheet (ACCT-06), expense analysis (EXP-03)

**Example (after implementing read_group):**
\`\`\`typescript
// Source: https://www.odoo.com/documentation/19.0/developer/reference/backend/orm.html
async readGroup<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  groupby: string[],
  options?: {
    offset?: number;
    limit?: number;
    orderby?: string;
    lazy?: boolean; // default true
  }
): Promise<T[]> {
  return this.call<T[]>(model, 'read_group', {
    domain,
    fields,
    groupby,
    offset: options?.offset,
    limit: options?.limit,
    orderby: options?.orderby,
    lazy: options?.lazy ?? true,
  });
}

// Usage for P&L summary
const plData = await client.readGroup<PLRow>(
  'account.move.line',
  [
    ['move_id.state', '=', 'posted'],
    ['account_id.account_type', 'in', ['income', 'expense']],
    ['date', '>=', '2026-01-01'],
    ['date', '<=', '2026-12-31'],
  ],
  ['account_id', 'balance:sum'], // field:aggregation format
  ['account_id'], // group by account
  { orderby: 'account_id' }
);
\`\`\`

**Key Odoo 19 feature:** Can now group by date parts numbers (year_number, month_number, iso_week_number) and related no-store fields.

### Pattern 4: Knowledge Article Conversion
**What:** Convert between HTML (Odoo storage) and Markdown (LLM-friendly format)
**When to use:** All knowledge tools (KNOW-01 through KNOW-04)

**Example:**
\`\`\`typescript
// Source: npm packages turndown + marked
import TurndownService from 'turndown';
import { marked } from 'marked';

// Create converter instances (reuse across requests)
const turndownService = new TurndownService();

// HTML → Markdown (for reads)
export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

// Markdown → HTML (for creates/updates)
export function markdownToHtml(markdown: string): string {
  return marked(markdown) as string;
}

// In KNOW-01 (read article)
const articles = await client.searchRead('knowledge.article', domain, ['id', 'name', 'body']);
const formatted = articles.map(a => ({
  ...a,
  body: htmlToMarkdown(a.body), // Convert for LLM
}));

// In KNOW-02 (create article)
const articleId = await client.create('knowledge.article', {
  name: params.title,
  body: markdownToHtml(params.body), // Convert from LLM
});
\`\`\`

### Pattern 5: Approval Actions
**What:** Call specific action methods (action_approve, action_refuse) on models
**When to use:** Expense approvals (APR-01), decision approvals (APR-02)

**Example:**
\`\`\`typescript
// Source: https://www.odoo.com/documentation/19.0/applications/finance/expenses/approve_expenses.html
// Expense sheet approval
await client.call('hr.expense.sheet', 'action_approve', { ids: [sheetId] });

// Expense sheet rejection (requires reason)
await client.call('hr.expense.sheet', 'action_refuse', {
  ids: [sheetId],
  reason: 'Missing receipts',
});

// Decision approval (via approval.request model)
const decision = await client.read('nh.decision', [decisionId], ['approval_request_id']);
const approvalRequestId = decision[0].approval_request_id[0]; // Many2one returns [id, name]
await client.call('approval.request', 'action_approve', { ids: [approvalRequestId] });
\`\`\`

**Critical constraint:** Only records in the correct state can be approved (e.g., expense sheets must be in 'submit' state, not 'draft').

### Anti-Patterns to Avoid

- **Don't fetch all fields:** Always specify the fields list. Fetching all fields is slow and includes computed/binary fields that bloat responses.
- **Don't use raw SQL:** The JSON-2 API enforces access rights, record rules, and field access. Raw SQL bypasses all security.
- **Don't manually paginate with offset:** For large datasets, use search_read with limit + offset, but consider if the LLM needs all records or just a summary (use read_group instead).
- **Don't hardcode database name:** Use the X-Odoo-Database header (already implemented in OdooClient).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML to Markdown | Custom regex parser | turndown npm package | HTML parsing is complex (nested tags, entities, edge cases) |
| Markdown to HTML | String replacement | marked npm package | Markdown has many flavors and edge cases (tables, code blocks, escaping) |
| Odoo domain filters | Custom query builder | Native Odoo domain syntax | Domain filters support complex logic (OR, NOT, nested) that's error-prone to build |
| Aggregation queries | Manual summing/grouping | read_group method | read_group handles grouping, aggregation, and access rights correctly |
| Date filtering | String manipulation | Odoo date fields with operators | Odoo handles timezones, date formats, and fiscal periods |
| File encoding | Custom base64 | Node.js Buffer.from(data, 'base64') | Built-in, tested, handles edge cases |

**Key insight:** Odoo's ORM methods (search_read, read_group, call) already implement complex logic for access control, record rules, computed fields, and data formatting. Using them directly is simpler and more secure than building custom solutions.

## Common Pitfalls

### Pitfall 1: Many2one Field Format Confusion
**What goes wrong:** Many2one fields return \`[id, display_name]\` tuples, not just IDs. Accessing the ID requires index 0.
**Why it happens:** Odoo optimizes by returning both ID and display name to avoid extra reads.
**How to avoid:**
- When reading Many2one fields, expect \`[number, string]\` format
- Access ID: \`record.partner_id[0]\`
- Access name: \`record.partner_id[1]\`
- Check for false/null: \`if (record.partner_id) { ... }\`
**Warning signs:** TypeScript errors about accessing number on tuple, undefined is not a number.

### Pitfall 2: Domain Filter Syntax Errors
**What goes wrong:** Invalid domain filters cause cryptic server errors or return wrong results.
**Why it happens:** Odoo domain syntax is strict: \`[['field', 'operator', value], ...]\`
**How to avoid:**
- Always use array-of-arrays format: \`[['state', '=', 'posted']]\` not \`['state', '=', 'posted']\`
- Valid operators: \`=\`, \`!=\`, \`>\`, \`>=\`, \`<\`, \`<=\`, \`like\`, \`ilike\`, \`in\`, \`not in\`, \`child_of\`
- AND multiple conditions: \`[['state', '=', 'posted'], ['move_type', '=', 'out_invoice']]\`
- OR conditions: \`['|', ['state', '=', 'draft'], ['state', '=', 'posted']]\`
**Warning signs:** "invalid domain" error, or filter returns all/no records unexpectedly.

### Pitfall 3: Missing read_group Method (Current Gap)
**What goes wrong:** Cannot implement reports without read_group (P&L, balance sheet, ledger, expense analysis).
**Why it happens:** The current OdooClient only implements CRUD methods, not aggregation.
**How to avoid:** Add read_group method to OdooClient before implementing report tools.
**Warning signs:** Need to aggregate data (sum, count, avg) grouped by a dimension.

**Implementation needed:**
\`\`\`typescript
// In src/services/odoo/client.ts
async readGroup<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  groupby: string[],
  options?: { offset?: number; limit?: number; orderby?: string; lazy?: boolean }
): Promise<T[]> {
  return this.call<T[]>(model, 'read_group', {
    domain,
    fields,
    groupby,
    offset: options?.offset,
    limit: options?.limit,
    orderby: options?.orderby,
    lazy: options?.lazy ?? true,
  });
}
\`\`\`

### Pitfall 4: Forgetting State Constraints for Approvals
**What goes wrong:** Approval actions fail silently or throw permission errors.
**Why it happens:** Models enforce state transitions (e.g., can only approve 'submit' state expenses).
**How to avoid:**
- Check current state before calling approval actions
- For hr.expense.sheet: Only approve if state = 'submit'
- For nh.decision: Only approve if status = 'pending_approval' (via approval.request)
- Return clear error messages when state is invalid
**Warning signs:** "Cannot approve record in state X" errors.

### Pitfall 5: OCR Attachment Wrong res_model
**What goes wrong:** Uploading invoice photo doesn't trigger OCR.
**Why it happens:** OCR only activates for \`res_model='account.move'\` attachments when Document Digitization is enabled.
**How to avoid:**
- Always set \`res_model='account.move'\` for invoice attachments
- Set \`res_model='hr.expense'\` for expense receipt attachments
- Include \`res_id\` (the record ID) to link attachment
- OCR is automatic if enabled in Accounting → Configuration → Settings → Document Digitization
**Warning signs:** Attachment created but no OCR fields populated on the invoice.

### Pitfall 6: Knowledge Article Body Encoding
**What goes wrong:** Markdown formatting lost when creating/updating articles, or HTML renders as text.
**Why it happens:** Odoo stores knowledge.article.body as HTML field, but LLMs work better with Markdown.
**How to avoid:**
- **Always** convert Markdown → HTML before create/write operations
- **Always** convert HTML → Markdown after read operations
- Use consistent conversion libraries (turndown, marked)
- Test with complex Markdown (tables, code blocks, nested lists)
**Warning signs:** Articles display raw HTML tags or lose formatting.

## Code Examples

Verified patterns from official sources:

### Read Group Example (P&L Summary)
\`\`\`typescript
// Source: https://www.odoo.com/documentation/19.0/developer/reference/backend/orm.html
interface PLRow {
  account_id: [number, string]; // Many2one format
  balance: number; // Sum aggregation
  __domain: unknown[]; // Auto-added by read_group
}

const plData = await client.readGroup<PLRow>(
  'account.move.line',
  [
    ['move_id.state', '=', 'posted'], // Only posted journal entries
    ['account_id.account_type', 'in', ['income', 'expense']], // Income/expense accounts
    ['date', '>=', params.date_from],
    ['date', '<=', params.date_to],
  ],
  ['account_id', 'balance:sum'], // Group by account, sum balance
  ['account_id'], // Groupby dimension
  { orderby: 'account_id' }
);

// Format for LLM
const formatted = plData.map(row => ({
  account: row.account_id[1], // Display name
  balance: row.balance,
}));
\`\`\`

### Batch Payment Validation
\`\`\`typescript
// Source: https://www.odoo.com/documentation/19.0/applications/finance/accounting/payments/batch.html
// Note: Standard Odoo doesn't have approval workflow, just validation
// For approval workflow, would need custom module

// List batch payments
const batches = await client.searchRead(
  'account.payment',
  [['payment_type', '=', 'outbound']],
  ['id', 'name', 'payment_date', 'amount', 'state'],
  { limit: 100 }
);

// Validate batch (standard workflow)
await client.call('account.payment', 'action_post', { ids: [batchId] });

// Note: account.payment.batch model exists but approval depends on custom module
// For APR-03, may need to check if custom approval module is installed
\`\`\`

### Bank Sync Status Check
\`\`\`typescript
// Source: https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/bank_synchronization.html
// Requires developer mode: Accounting → Configuration → Online Synchronization

const providers = await client.searchRead(
  'account.online.provider',
  [], // All providers
  ['id', 'name', 'status', 'last_refresh', 'provider_type'],
  { limit: 50 }
);

// Each provider has status field indicating connection health
// New in Odoo 19: online_transaction_id field on transactions
\`\`\`

### Custom Module: Task Template
\`\`\`typescript
// Source: /Users/nevilhulspas/conductor/workspaces/odoo/barcelona/nh_project_task_template/models/project_task.py
// Launch task from template
const result = await client.call(
  'project.task',
  'action_create_from_template',
  { ids: [templateTaskId] }
);

// Returns action dict to open the new task
// The method copies the template and sets is_template=False
\`\`\`

### Custom Module: Decision Logging
\`\`\`typescript
// Source: /Users/nevilhulspas/conductor/workspaces/odoo/barcelona/nh_decision/models/decision.py
// Model: nh.decision

// Create decision
const decisionId = await client.create('nh.decision', {
  title: 'Approve refund for order #12345',
  description: '<p>Customer reported damaged product</p>',
  decision_type: 'refund',
  amount: 49.99,
  currency_id: 1, // EUR
  subject_type: 'order',
  subject_ref: '#12345',
  decided_by_id: userId,
  decided_at: new Date().toISOString(),
});

// Submit for approval (triggers approval.request creation)
await client.call('nh.decision', 'action_submit_for_approval', { ids: [decisionId] });

// Read decision with approval status
const decision = await client.read(
  'nh.decision',
  [decisionId],
  ['id', 'name', 'title', 'status', 'approval_request_id', 'decided_at']
);
\`\`\`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| XML-RPC API | JSON-2 API | Odoo 19 | XML-RPC deprecated, removed in Odoo 20 (fall 2026) |
| account.invoice model | account.move model | Odoo 13 | Invoices are now journal entries (unified accounting) |
| Manual OCR/parsing | Automatic document digitization | Odoo 15+ | Upload triggers OCR automatically if enabled |
| read_group lazy=False for all groups | read_group lazy=True by default | Odoo 19 | Better performance, group by date parts supported |
| Static task creation | Task templates | Odoo 19 | Reusable task templates reduce manual work |

**Deprecated/outdated:**
- XML-RPC endpoint \`/xmlrpc/2\`: Scheduled for removal in Odoo 20 (fall 2026). Use JSON-2 API instead.
- JSON-RPC endpoint \`/jsonrpc\`: Also deprecated. Use JSON-2 API (\`/json/2/{model}/{method}\`).
- account.invoice model: Merged into account.move in Odoo 13. Use account.move with move_type filter.
- Manual bank statement imports: Bank synchronization via account.online.provider is now standard (Odoo Fin service).

## Open Questions

Things that couldn't be fully resolved:

1. **Batch Payment Approval Workflow**
   - What we know: Standard Odoo has validation (action_post), not approval workflow
   - What's unclear: Whether Barcelona Odoo instance has custom approval module installed
   - Recommendation: Implement validation first (APR-03), add approval if module exists

2. **Account Types for Reports**
   - What we know: P&L uses account_type 'income' and 'expense', balance sheet uses 'asset', 'liability', 'equity'
   - What's unclear: Complete list of account_type values in Odoo 19
   - Recommendation: Start with common types, expand based on testing

3. **Bank Sync Provider Status Values**
   - What we know: account.online.provider has status field
   - What's unclear: Complete list of status values (connected, error, pending, etc.)
   - Recommendation: Use searchRead to fetch sample records and document actual values

4. **Read Group Performance**
   - What we know: lazy=True is default and more performant
   - What's unclear: When to use lazy=False for nested groupings in reports
   - Recommendation: Start with lazy=True, only set lazy=False if multi-level grouping needed

5. **Document Digitization Credits**
   - What we know: OCR is an IAP (In-App Purchase) service requiring credits
   - What's unclear: How to check credit balance, what happens when credits run out
   - Recommendation: Document that OCR requires configuration and credits, fail gracefully if not enabled

## Sources

### Primary (HIGH confidence)

- [Odoo 19.0 ORM API Documentation](https://www.odoo.com/documentation/19.0/developer/reference/backend/orm.html) - read_group method specification
- [Odoo 19.0 External JSON-2 API Documentation](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html) - JSON-2 API format, authentication, endpoints
- [Odoo 19.0 Approve Expenses Documentation](https://www.odoo.com/documentation/19.0/applications/finance/expenses/approve_expenses.html) - Expense approval workflow
- [Odoo 19.0 Document Digitization Documentation](https://www.odoo.com/documentation/19.0/applications/finance/accounting/vendor_bills/invoice_digitization.html) - OCR attachment processing
- [Odoo 19.0 Bank Synchronization Documentation](https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/bank_synchronization.html) - account.online.provider model
- [Odoo 19.0 Batch Payments Documentation](https://www.odoo.com/documentation/19.0/applications/finance/accounting/payments/batch.html) - Batch payment workflow
- Barcelona codebase \`/nh_decision/models/decision.py\` - nh.decision model definition
- Barcelona codebase \`/nh_project_task_template/models/project_task.py\` - Task template action

### Secondary (MEDIUM confidence)

- [Accounting and Invoicing — Odoo 19.0 documentation](https://www.odoo.com/documentation/19.0/applications/finance/accounting.html) - account.move model fields
- [Odoo 19 Release Notes](https://www.odoo.com/odoo-19-release-notes) - New features (task templates, date part grouping)
- [GitHub - mixmark-io/turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown converter
- [Marked Documentation](https://marked.js.org/) - Markdown to HTML converter
- [Transactions — Odoo 19.0 documentation](https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/transactions.html) - account.bank.statement.line fields
- [Task creation — Odoo 19.0 documentation](https://www.odoo.com/documentation/19.0/applications/services/project/tasks/task_creation.html) - project.task fields
- [Knowledge — Odoo 19.0 documentation](https://www.odoo.com/documentation/19.0/applications/productivity/knowledge.html) - knowledge.article body field

### Tertiary (LOW confidence)

- Odoo forum discussions about account.move fields (Odoo 14-16 era, not 19-specific)
- Odoo Apps Store modules (third-party, not standard Odoo features)
- GitHub source code from older Odoo versions (structure may have changed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Packages are well-documented and widely used
- Architecture patterns: HIGH - Based on official Odoo 19 docs and existing codebase patterns
- Model names and fields: MEDIUM-HIGH - Verified from official docs, but some field lists incomplete
- Approval workflows: MEDIUM - Standard workflows documented, custom modules may vary
- Pitfalls: HIGH - Based on Odoo forum discussions and official documentation warnings
- read_group implementation: HIGH - Official ORM API documentation provides exact signature

**Research date:** 2026-01-24
**Valid until:** ~30 days (Odoo 19 is stable, but check for patches/updates)

**Critical gaps identified:**
1. OdooClient missing read_group method (MUST implement before report tools)
2. Need turndown + marked npm packages for Knowledge tools
3. Batch payment approval workflow unclear (may need custom module check)
4. Account type enumeration incomplete (can extend during implementation)

**Next steps for planner:**
1. Add read_group method to OdooClient
2. Install turndown + marked packages
3. Create 28 tools organized by domain (accounting, hr, expenses, knowledge, projects, decisions, approvals)
4. Each tool follows standard pattern: Zod schema → get API key → getClient → call Odoo method → return JSON
5. Prioritize basic CRUD tools first, then reports/approvals that depend on read_group
