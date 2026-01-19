/**
 * MCP Tool Registration
 *
 * Creates and configures the McpServer instance with registered tools.
 * Currently includes only a placeholder 'ping' tool for testing.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';

/**
 * Creates and returns a configured McpServer instance.
 *
 * The server is configured with:
 * - Server name and version for identification
 * - Registered tools (currently just 'ping' for testing)
 *
 * @returns Configured McpServer instance ready for connection
 */
export function createMcpServer(): McpServer {
  logger.info('Creating MCP server instance');

  const server = new McpServer({
    name: 'mrpeasy-mcp',
    version: '0.1.0',
  });

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

  logger.info('MCP server created with ping tool registered');
  return server;
}
