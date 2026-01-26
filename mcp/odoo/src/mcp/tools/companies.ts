/**
 * Company tools for the Odoo MCP server.
 *
 * Provides company listing so users can discover available companies
 * and use company_id filters on other tools.
 */

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

export function registerCompanyTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- list_companies ---
  server.tool(
    'odoo_list_companies',
    'List all companies the current user has access to. Use the returned IDs to filter other tools by company.',
    {},
    async (_params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const companies = await client.searchRead(
          'res.company',
          [],
          ['id', 'name', 'currency_id', 'country_id', 'partner_id'],
          { limit: 100, order: 'name asc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(companies, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
