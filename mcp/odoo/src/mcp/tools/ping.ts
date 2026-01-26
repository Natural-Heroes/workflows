/**
 * Ping tool - basic MCP connectivity test.
 *
 * Returns "pong" to verify the MCP server is responding.
 * No parameters required, no external dependencies.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Registers the 'odoo_ping' tool on the MCP server.
 *
 * @param server - McpServer instance to register the tool on
 */
export function registerPingTool(server: McpServer): void {
  server.tool('odoo_ping', 'Test MCP connectivity. Returns pong.', {}, async () => {
    return {
      content: [{ type: 'text', text: 'pong' }],
    };
  });
}
