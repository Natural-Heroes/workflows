/**
 * Expense tools for the Odoo MCP server.
 *
 * Provides expense report reading, receipt upload, and expense analysis.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OdooClientManager } from '../../services/odoo/client-manager.js';
import { OdooApiError, McpToolError, formatErrorForMcp } from '../../lib/errors.js';

function getApiKey(extra: { authInfo?: { extra?: { odooApiKey?: unknown } } }): string | null {
  return (extra.authInfo?.extra?.odooApiKey as string) || null;
}

function handleError(error: unknown) {
  if (error instanceof OdooApiError) {
    if (error.statusCode === 404) {
      return formatErrorForMcp(new McpToolError({
        userMessage: `Model or endpoint not found: ${error.message}. The required Odoo module may not be installed.`,
        isRetryable: false,
        errorCode: 'MODULE_NOT_INSTALLED',
      }));
    }
    return formatErrorForMcp(new McpToolError({
      userMessage: error.message,
      internalDetails: error.odooDebug,
      isRetryable: [429, 503].includes(error.statusCode),
      errorCode: error.odooErrorName,
    }));
  }
  return formatErrorForMcp(new McpToolError({
    userMessage: 'Unexpected error: ' + (error instanceof Error ? error.message : String(error)),
    isRetryable: false,
  }));
}

export function registerExpenseTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- read_expenses ---
  server.tool(
    'read_expenses',
    'Read expense reports with optional state/employee filters.',
    {
      state: z.enum(['draft', 'reported', 'approved', 'done', 'refused']).optional().describe('Expense sheet state'),
      employee_id: z.number().optional().describe('Filter by employee ID'),
      limit: z.number().min(1).max(100).default(20).describe('Max records'),
      offset: z.number().min(0).default(0).describe('Records to skip'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.state) domain.push(['state', '=', params.state]);
        if (params.employee_id) domain.push(['employee_id', '=', params.employee_id]);

        const expenses = await client.searchRead(
          'hr.expense.sheet',
          domain,
          ['id', 'name', 'employee_id', 'total_amount', 'state', 'expense_line_ids', 'create_date', 'currency_id'],
          { limit: params.limit, offset: params.offset, order: 'create_date desc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(expenses, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- upload_receipt ---
  server.tool(
    'upload_receipt',
    'Upload a receipt image/PDF to an expense line for OCR processing.',
    {
      expense_id: z.number().describe('Expense line ID (hr.expense) to attach receipt to'),
      filename: z.string().describe('Filename (e.g. "receipt.jpg")'),
      base64_data: z.string().describe('Base64-encoded file content'),
      mimetype: z.string().default('image/jpeg').describe('File MIME type'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const attachmentId = await client.create('ir.attachment', {
          name: params.filename,
          datas: params.base64_data,
          res_model: 'hr.expense',
          res_id: params.expense_id,
          mimetype: params.mimetype,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ attachment_id: attachmentId, message: 'Receipt uploaded. OCR will process automatically if enabled.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- expense_analysis ---
  server.tool(
    'expense_analysis',
    'Analyze expenses grouped by employee or product category for a date range.',
    {
      date_from: z.string().describe('Start date (YYYY-MM-DD)'),
      date_to: z.string().describe('End date (YYYY-MM-DD)'),
      group_by: z.enum(['employee_id', 'product_id']).default('employee_id').describe('Grouping dimension'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const data = await client.readGroup(
          'hr.expense',
          [
            ['date', '>=', params.date_from],
            ['date', '<=', params.date_to],
            ['state', '=', 'approved'],
          ],
          [params.group_by, 'total_amount:sum'],
          [params.group_by],
          { orderby: 'total_amount desc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
