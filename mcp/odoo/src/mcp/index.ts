/**
 * MCP server factory.
 *
 * Creates and configures an McpServer instance with all registered tools
 * and resources. Tools access the authenticated user's Odoo API key via
 * extra.authInfo.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OdooClientManager } from '../services/odoo/client-manager.js';
import { registerPingTool } from './tools/ping.js';
import { registerTestOdooTool } from './tools/test-odoo.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerAccountingTools } from './tools/accounting.js';
import { registerHrTools } from './tools/hr.js';
import { registerExpenseTools } from './tools/expenses.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerProjectTools } from './tools/projects.js';
import { registerDecisionTools } from './tools/decisions.js';
import { registerApprovalTools } from './tools/approvals.js';

const INSTRUCTIONS = `# Odoo MCP Server - Usage Guide

You are connected to the Natural Heroes Odoo 19 instance via MCP.
All tools use the authenticated user's permissions — results are filtered
by Odoo's access control rules.

## Multi-Company Support

This Odoo instance has multiple companies. Use **list_companies** to see which
companies you have access to. Most listing tools accept an optional \`company_id\`
parameter to filter results to a specific company. When no company filter is set,
results may include records from all companies you have access to.

The \`company_id\` field is included in tool outputs as a [id, name] tuple so you
can always see which company a record belongs to.

## Available Domains

### Companies
- **list_companies**: List all companies you have access to (use returned IDs for filtering)

### Accounting
- **list_invoices** / **read_invoice**: Browse and inspect invoices/bills
- **read_transactions**: View bank statement lines
- **upload_invoice_attachment**: Attach photos/PDFs (triggers OCR if enabled)
- **bank_sync_status**: Check bank connection health
- **pl_summary**: Profit & Loss by account for a date range
- **balance_sheet**: Balance sheet as of a given date

### HR
- **search_employees** / **read_employee**: Find and inspect employee records
- **read_payslips**: View payslip history
- **read_time_off**: View leave requests

### Expenses
- **read_expenses**: Browse expense reports
- **upload_receipt**: Attach receipt to an expense line
- **expense_analysis**: Aggregated expense data by employee or category

### Knowledge
- **read_articles**: Search articles (body returned as Markdown)
- **create_article** / **update_article**: Write articles (provide Markdown)
- **delete_article**: Remove an article

### Projects
- **list_projects** / **list_tasks**: Browse projects and tasks
- **create_project** / **create_task**: Create new work items
- **launch_template**: Instantiate a task from a template

### Decisions
- **log_decision**: Record a business decision
- **read_decisions**: Browse decision history

### Approvals
- **approve_expense**: Approve a submitted expense report
- **approve_decision**: Approve a decision via its approval request
- **validate_payment**: Post a draft payment

## Tips
- Use **list_companies** first to discover company IDs, then pass \`company_id\` to filter
- Many2one fields (like partner_id, company_id) return [id, display_name] tuples
- Dates use YYYY-MM-DD format
- Use limit/offset for pagination on list endpoints
- Approval tools check state before acting — they'll tell you if the record isn't in the right state
- Knowledge article bodies are converted HTML↔Markdown automatically
- Knowledge articles and decisions are shared across companies (no company filter)
`;

/**
 * Creates a configured MCP server with all tools and resources registered.
 *
 * @param clientManager - OdooClientManager for per-user client access
 * @returns Configured McpServer ready for transport connection
 */
export function createMcpServer(clientManager: OdooClientManager): McpServer {
  const server = new McpServer({
    name: 'odoo-mcp',
    version: '0.1.0',
  });

  // Instructions resource
  server.resource(
    'instructions',
    'odoo://instructions',
    async () => ({
      contents: [{
        uri: 'odoo://instructions',
        mimeType: 'text/plain',
        text: INSTRUCTIONS,
      }],
    })
  );

  // Utility tools
  registerPingTool(server);
  registerTestOdooTool(server, clientManager);

  // Company tools
  registerCompanyTools(server, clientManager);

  // Domain tools
  registerAccountingTools(server, clientManager);
  registerHrTools(server, clientManager);
  registerExpenseTools(server, clientManager);
  registerKnowledgeTools(server, clientManager);
  registerProjectTools(server, clientManager);
  registerDecisionTools(server, clientManager);
  registerApprovalTools(server, clientManager);

  return server;
}
