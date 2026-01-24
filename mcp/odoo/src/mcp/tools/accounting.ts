/**
 * Accounting tools for the Odoo MCP server.
 *
 * Provides invoice listing/reading, transaction viewing, invoice photo upload,
 * bank sync status, P&L summary, and balance sheet.
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

export function registerAccountingTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- list_invoices ---
  server.tool(
    'list_invoices',
    'List customer and vendor invoices with optional filters.',
    {
      limit: z.number().min(1).max(200).default(50).describe('Max records to return'),
      offset: z.number().min(0).default(0).describe('Records to skip'),
      state: z.enum(['draft', 'posted', 'cancel']).optional().describe('Invoice state filter'),
      move_type: z.enum(['out_invoice', 'out_refund', 'in_invoice', 'in_refund']).optional().describe('Invoice type'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.state) domain.push(['state', '=', params.state]);
        if (params.move_type) domain.push(['move_type', '=', params.move_type]);

        const invoices = await client.searchRead(
          'account.move',
          domain,
          ['id', 'name', 'partner_id', 'invoice_date', 'amount_total', 'amount_residual', 'state', 'move_type', 'currency_id'],
          { limit: params.limit, offset: params.offset, order: 'invoice_date desc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(invoices, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- read_invoice ---
  server.tool(
    'read_invoice',
    'Read a single invoice/bill by ID with full details.',
    {
      invoice_id: z.number().describe('The invoice ID to read'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const result = await client.read(
          'account.move',
          [params.invoice_id],
          ['id', 'name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'amount_tax', 'state', 'move_type', 'currency_id', 'invoice_line_ids', 'narration', 'ref', 'payment_state']
        );
        if (!result.length) {
          return formatErrorForMcp(new McpToolError({ userMessage: 'Invoice not found.', isRetryable: false, errorCode: 'NOT_FOUND' }));
        }

        // Also fetch invoice lines
        const invoice = result[0] as Record<string, unknown>;
        const lineIds = invoice.invoice_line_ids as number[];
        if (lineIds?.length) {
          const lines = await client.read(
            'account.move.line',
            lineIds.slice(0, 50),
            ['id', 'name', 'product_id', 'quantity', 'price_unit', 'price_subtotal', 'tax_ids', 'account_id']
          );
          (invoice as Record<string, unknown>).lines = lines;
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(invoice, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- read_transactions ---
  server.tool(
    'read_transactions',
    'Read bank statement transactions with optional date/journal filters.',
    {
      limit: z.number().min(1).max(200).default(50).describe('Max records'),
      offset: z.number().min(0).default(0).describe('Records to skip'),
      date_from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('End date (YYYY-MM-DD)'),
      journal_id: z.number().optional().describe('Bank journal ID filter'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.date_from) domain.push(['date', '>=', params.date_from]);
        if (params.date_to) domain.push(['date', '<=', params.date_to]);
        if (params.journal_id) domain.push(['journal_id', '=', params.journal_id]);

        const transactions = await client.searchRead(
          'account.bank.statement.line',
          domain,
          ['id', 'date', 'payment_ref', 'partner_id', 'amount', 'journal_id', 'is_reconciled'],
          { limit: params.limit, offset: params.offset, order: 'date desc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(transactions, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- upload_invoice_attachment ---
  server.tool(
    'upload_invoice_attachment',
    'Upload a file attachment (photo/PDF) to an invoice for OCR processing.',
    {
      invoice_id: z.number().describe('Invoice ID to attach to'),
      filename: z.string().describe('Filename (e.g. "receipt.pdf")'),
      base64_data: z.string().describe('Base64-encoded file content'),
      mimetype: z.string().default('application/pdf').describe('File MIME type'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const attachmentId = await client.create('ir.attachment', {
          name: params.filename,
          datas: params.base64_data,
          res_model: 'account.move',
          res_id: params.invoice_id,
          mimetype: params.mimetype,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ attachment_id: attachmentId, message: 'Attachment uploaded. OCR will process automatically if enabled.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- bank_sync_status ---
  server.tool(
    'bank_sync_status',
    'Check bank synchronization provider connection status.',
    {},
    async (_params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const providers = await client.searchRead(
          'account.online.provider',
          [],
          ['id', 'name', 'status', 'last_refresh', 'provider_type'],
          { limit: 50 }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(providers, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- pl_summary ---
  server.tool(
    'pl_summary',
    'Get Profit & Loss summary grouped by account for a date range.',
    {
      date_from: z.string().describe('Start date (YYYY-MM-DD)'),
      date_to: z.string().describe('End date (YYYY-MM-DD)'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const data = await client.readGroup(
          'account.move.line',
          [
            ['move_id.state', '=', 'posted'],
            ['account_id.account_type', 'in', ['income', 'income_other', 'expense', 'expense_direct_cost', 'expense_depreciation']],
            ['date', '>=', params.date_from],
            ['date', '<=', params.date_to],
          ],
          ['account_id', 'balance:sum'],
          ['account_id'],
          { orderby: 'account_id' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- balance_sheet ---
  server.tool(
    'balance_sheet',
    'Get balance sheet summary grouped by account type as of a given date.',
    {
      date_to: z.string().describe('As-of date (YYYY-MM-DD)'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const data = await client.readGroup(
          'account.move.line',
          [
            ['move_id.state', '=', 'posted'],
            ['account_id.account_type', 'in', ['asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current', 'asset_fixed', 'asset_prepayments', 'liability_payable', 'liability_credit_card', 'liability_current', 'liability_non_current', 'equity', 'equity_unaffected']],
            ['date', '<=', params.date_to],
          ],
          ['account_id', 'balance:sum'],
          ['account_id'],
          { orderby: 'account_id' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
