/**
 * MCP Tool Registration
 *
 * Creates and configures the McpServer instance with registered tools.
 * Includes inventory, product, and search tools for MRPeasy integration.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';
import { createMrpEasyClient } from '../../services/mrpeasy/index.js';
import { registerInventoryTools } from './inventory.js';
import { registerProductTools } from './product.js';
import { registerSearchTools } from './search.js';

/**
 * Creates and returns a configured McpServer instance.
 *
 * The server is configured with:
 * - Server name and version for identification
 * - Ping tool for connectivity testing
 * - Inventory tools (get_inventory)
 * - Product tools (get_product)
 * - Search tools (search_items)
 *
 * @returns Configured McpServer instance ready for connection
 */
export function createMcpServer(): McpServer {
  logger.info('Creating MCP server instance');

  const server = new McpServer({
    name: 'mrpeasy-mcp',
    version: '0.1.0',
  });

  // Create MRPeasy API client
  const client = createMrpEasyClient();

  // Register placeholder ping tool for testing
  server.tool(
    'ping',
    'Test tool to verify MCP server is working. Returns "pong" to confirm connectivity.',
    {},
    async () => {
      logger.debug('Ping tool called');
      return {
        content: [
          {
            type: 'text',
            text: 'pong',
          },
        ],
      };
    }
  );

  // Register MRPeasy tools
  registerInventoryTools(server, client);
  registerProductTools(server, client);
  registerSearchTools(server, client);

  logger.info('MCP server created with all tools registered');
  return server;
}
