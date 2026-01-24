/**
 * Approval tools for the Odoo MCP server.
 *
 * Provides expense approval, decision approval, and payment validation.
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

export function registerApprovalTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- approve_expense ---
  server.tool(
    'approve_expense',
    'Approve an expense report. Only works on sheets in "reported" state.',
    {
      expense_sheet_id: z.number().describe('Expense sheet ID to approve'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);

        // Verify state before attempting approval
        const sheets = await client.read('hr.expense.sheet', [params.expense_sheet_id], ['state', 'name']);
        if (!sheets.length) {
          return formatErrorForMcp(new McpToolError({ userMessage: 'Expense sheet not found.', isRetryable: false, errorCode: 'NOT_FOUND' }));
        }
        const sheet = sheets[0] as Record<string, unknown>;
        if (sheet.state !== 'reported') {
          return formatErrorForMcp(new McpToolError({
            userMessage: `Cannot approve: expense sheet is in "${sheet.state}" state (must be "reported").`,
            isRetryable: false,
            errorCode: 'INVALID_STATE',
          }));
        }

        await client.call('hr.expense.sheet', 'action_approve', { ids: [params.expense_sheet_id] });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: params.expense_sheet_id, message: 'Expense sheet approved.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- approve_decision ---
  server.tool(
    'approve_decision',
    'Approve a decision via its linked approval request.',
    {
      decision_id: z.number().describe('Decision ID (nh.decision) to approve'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);

        // Read the decision to get the approval_request_id
        const decisions = await client.read('nh.decision', [params.decision_id], ['approval_request_id', 'status']);
        if (!decisions.length) {
          return formatErrorForMcp(new McpToolError({ userMessage: 'Decision not found.', isRetryable: false, errorCode: 'NOT_FOUND' }));
        }
        const decision = decisions[0] as Record<string, unknown>;
        const approvalRef = decision.approval_request_id as [number, string] | false;
        if (!approvalRef) {
          return formatErrorForMcp(new McpToolError({ userMessage: 'Decision has no linked approval request. Submit for approval first.', isRetryable: false }));
        }

        await client.call('approval.request', 'action_approve', { ids: [approvalRef[0]] });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ decision_id: params.decision_id, message: 'Decision approved.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- validate_payment ---
  server.tool(
    'validate_payment',
    'Validate (post) a payment to confirm it.',
    {
      payment_id: z.number().describe('Payment ID to validate'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);

        // Verify state
        const payments = await client.read('account.payment', [params.payment_id], ['state', 'name']);
        if (!payments.length) {
          return formatErrorForMcp(new McpToolError({ userMessage: 'Payment not found.', isRetryable: false, errorCode: 'NOT_FOUND' }));
        }
        const payment = payments[0] as Record<string, unknown>;
        if (payment.state !== 'draft') {
          return formatErrorForMcp(new McpToolError({
            userMessage: `Cannot validate: payment is in "${payment.state}" state (must be "draft").`,
            isRetryable: false,
            errorCode: 'INVALID_STATE',
          }));
        }

        await client.call('account.payment', 'action_post', { ids: [params.payment_id] });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: params.payment_id, message: 'Payment validated.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
