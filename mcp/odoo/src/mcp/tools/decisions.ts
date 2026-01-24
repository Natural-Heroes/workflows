/**
 * Decision tools for the Odoo MCP server.
 *
 * Provides decision logging and reading via the custom nh.decision model.
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

export function registerDecisionTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- log_decision ---
  server.tool(
    'log_decision',
    'Log a new business decision in the nh.decision model.',
    {
      title: z.string().describe('Decision title'),
      description: z.string().optional().describe('Decision description/rationale'),
      decision_type: z.string().optional().describe('Type of decision (e.g. refund, purchase)'),
      amount: z.number().optional().describe('Monetary amount if applicable'),
      subject_type: z.string().optional().describe('Subject type (e.g. order, invoice)'),
      subject_ref: z.string().optional().describe('Subject reference (e.g. order number)'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const vals: Record<string, unknown> = {
          title: params.title,
          decided_at: new Date().toISOString().split('T')[0],
        };
        if (params.description) vals.description = params.description;
        if (params.decision_type) vals.decision_type = params.decision_type;
        if (params.amount) vals.amount = params.amount;
        if (params.subject_type) vals.subject_type = params.subject_type;
        if (params.subject_ref) vals.subject_ref = params.subject_ref;

        const decisionId = await client.create('nh.decision', vals);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: decisionId, message: 'Decision logged.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- read_decisions ---
  server.tool(
    'read_decisions',
    'Read business decisions with optional filters.',
    {
      status: z.string().optional().describe('Decision status filter'),
      decision_type: z.string().optional().describe('Decision type filter'),
      limit: z.number().min(1).max(100).default(20).describe('Max records'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.status) domain.push(['status', '=', params.status]);
        if (params.decision_type) domain.push(['decision_type', '=', params.decision_type]);

        const decisions = await client.searchRead(
          'nh.decision',
          domain,
          ['id', 'name', 'title', 'status', 'decision_type', 'amount', 'subject_type', 'subject_ref', 'decided_at', 'decided_by_id'],
          { limit: params.limit, order: 'decided_at desc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(decisions, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
