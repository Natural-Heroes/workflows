/**
 * Test Odoo tool - verifies Odoo JSON-2 API connectivity.
 *
 * Reads records from a specified model to confirm the authenticated
 * user's API key is valid and the Odoo instance is reachable.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OdooClientManager } from '../../services/odoo/client-manager.js';
import {
  OdooApiError,
  McpToolError,
  formatErrorForMcp,
} from '../../lib/errors.js';

/**
 * Registers the 'odoo_test_odoo' tool on the MCP server.
 * Uses extra.authInfo.extra.odooApiKey for per-user Odoo access.
 */
export function registerTestOdooTool(
  server: McpServer,
  clientManager: OdooClientManager,
): void {
  server.tool(
    'odoo_test_odoo',
    'Test Odoo JSON-2 API connectivity. Reads records from a specified model.',
    {
      model: z.string().default('res.users').describe('Odoo model to query'),
      limit: z.number().min(1).max(10).default(5).describe('Number of records to return'),
    },
    async (params, extra) => {
      const authInfo = extra.authInfo;
      if (!authInfo?.extra?.odooApiKey) {
        return formatErrorForMcp(new McpToolError({
          userMessage: 'Not authenticated. Please reconnect to trigger OAuth login.',
          isRetryable: false,
          errorCode: 'AUTH_REQUIRED',
        }));
      }

      const odooApiKey = authInfo.extra.odooApiKey as string;

      try {
        const client = clientManager.getClient(odooApiKey);
        const result = await client.searchRead(
          params.model,
          [['id', '>', 0]],
          ['name', 'display_name'],
          { limit: params.limit }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        if (error instanceof OdooApiError) {
          const mcpError = new McpToolError({
            userMessage: error.message,
            internalDetails: error.odooDebug,
            isRetryable: [429, 503].includes(error.statusCode),
            errorCode: error.odooErrorName,
          });
          return formatErrorForMcp(mcpError);
        }

        const unexpectedError = new McpToolError({
          userMessage: 'Unexpected error: ' + (error instanceof Error ? error.message : String(error)),
          isRetryable: false,
        });
        return formatErrorForMcp(unexpectedError);
      }
    }
  );
}
