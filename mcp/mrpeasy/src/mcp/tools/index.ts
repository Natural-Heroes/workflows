/**
 * MCP Tool Registration
 *
 * Creates and configures the McpServer instance with registered tools.
 * Includes inventory, product, search, and order tools for MRPeasy integration.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';
import { createMrpEasyClient } from '../../services/mrpeasy/index.js';
import { registerInventoryTools } from './inventory.js';
import { registerProductTools } from './product.js';
import { registerSearchTools } from './search.js';
import { registerOrderTools } from './orders.js';
import { registerShipmentTools } from './shipments.js';

/**
 * Brief server description shown during initialization.
 */
const SERVER_DESCRIPTION =
  'MRPeasy ERP integration. Query inventory, customer orders, manufacturing orders, and shipments. Read the mrpeasy://instructions resource for usage guide.';

/**
 * Detailed instructions for LLMs, served as a resource.
 */
const INSTRUCTIONS_RESOURCE = `# MRPeasy MCP Server Instructions

This server provides access to MRPeasy ERP data including inventory, orders, and shipments.

## Available Tools

### Inventory & Products
- **get_inventory**: Get stock levels. Use \`code\` for SKU lookup (e.g., "ZPEO-NH-1").
- **get_product**: Get product details by ID or code.
- **search_items**: Search items by name or code (partial match).

### Customer Orders (Sales)
- **get_customer_orders**: List customer orders. Use \`open_only=true\` to exclude delivered/cancelled.
- **get_customer_order_details**: Get full CO details by ID or code (e.g., "CO-01263").

### Manufacturing Orders (Production)
- **get_manufacturing_orders**: List MOs. Use \`open_only=true\` to exclude done/closed/cancelled. Filter by \`item_code\` (SKU) to find MOs for a specific product.
- **get_manufacturing_order_details**: Get full MO details by ID or code (e.g., "MO-39509").

### Shipments
- **get_shipments**: List shipments. Use \`pending_only=true\` for shipments awaiting dispatch (New + Ready). Filter by \`customer_order_id\` to get shipments for a specific CO.
- **get_shipment_details**: Get shipment details by ID or code (e.g., "SH-00123").

## Best Practices

1. **Use code filters for lookups**: When you have an order code like "MO-39509" or "CO-01263", use the \`code\` parameter for efficient single-result queries.

2. **Use open_only/pending_only**: When checking active work, use these filters to exclude completed orders.

3. **Link related data**: Customer orders link to manufacturing orders and shipments. Use the IDs from one query to fetch related records.

## Status Codes

### Customer Order Status
| Code | Status | Open? |
|------|--------|-------|
| 10 | Quotation | Yes |
| 20 | Waiting for confirmation | Yes |
| 30 | Confirmed | Yes |
| 40 | Waiting for production | Yes |
| 50 | In production | Yes |
| 60 | Ready for shipment | Yes |
| 70 | Shipped | Yes |
| 80 | Delivered | No (closed) |
| 85 | Archived | No (closed) |
| 90 | Cancelled | No |

### Manufacturing Order Status
| Code | Status | Open? |
|------|--------|-------|
| 10 | New | Yes |
| 15 | Not Scheduled | Yes |
| 20 | Scheduled | Yes |
| 30 | In Progress | Yes |
| 35 | Paused | Yes |
| 40 | Done | No (closed) |
| 50 | Shipped | No (closed) |
| 60 | Closed | No |
| 70 | Cancelled | No |

### Shipment Status
| Code | Status | Pending? |
|------|--------|----------|
| 10 | New | Yes |
| 15 | Ready for shipment | Yes |
| 20 | Shipped | No (terminal) |
| 30 | Cancelled | No |

## Notes

- All timestamps are Unix format (seconds since epoch).
- Pagination uses Range headers internally; tools handle this automatically.
- Rate limited to 100 requests per 10 seconds.
`;

/**
 * Creates and returns a configured McpServer instance.
 *
 * The server is configured with:
 * - Server name and version for identification
 * - Server description for LLM context
 * - Instructions resource with detailed usage guide
 * - Ping tool for connectivity testing
 * - Inventory tools (get_inventory)
 * - Product tools (get_product)
 * - Search tools (search_items)
 * - Order tools (get_customer_orders, get_manufacturing_orders)
 * - Shipment tools (get_shipments, get_shipment_details)
 *
 * @returns Configured McpServer instance ready for connection
 */
export function createMcpServer(): McpServer {
  logger.info('Creating MCP server instance');

  const server = new McpServer({
    name: 'mrpeasy-mcp',
    version: '0.1.0',
    description: SERVER_DESCRIPTION,
  });

  // Create MRPeasy API client
  const client = createMrpEasyClient();

  // Register instructions resource for LLM guidance
  server.resource(
    'instructions',
    'mrpeasy://instructions',
    {
      description: 'Usage guide for the MRPeasy MCP server. Read this to understand available tools, best practices, and status codes.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'mrpeasy://instructions',
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_RESOURCE,
        },
      ],
    })
  );

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
  registerOrderTools(server, client);
  registerShipmentTools(server, client);

  logger.info('MCP server created with all tools registered');
  return server;
}
