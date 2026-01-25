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
import { registerMutationTools } from './mutations.js';
import { registerBomTools } from './boms.js';
import { registerRoutingTools } from './routings.js';
import { registerPurchaseOrderTools } from './purchase-orders.js';
import { registerStockLotTools } from './stock-lots.js';
import { registerReportTools } from './reports.js';
import { registerLookupTools } from './lookups.js';

/**
 * Brief server description shown during initialization.
 */
const SERVER_DESCRIPTION =
  'MRPeasy ERP integration. Read and write inventory, orders, BOMs, routings, purchase orders, stock lots, and reports. Read the mrpeasy://instructions resource for usage guide.';

/**
 * Detailed instructions for LLMs, served as a resource.
 */
const INSTRUCTIONS_RESOURCE = `# MRPeasy MCP Server Instructions

This server provides read and write access to MRPeasy ERP data including inventory, orders, BOMs, routings, stock lots, purchase orders, and reports.

## Available Tools

### Lookup/Reference Data (Use these first for write operations!)
- **get_units**: List all units of measurement. Use for create_item \`unit_id\`.
- **get_product_groups**: List all product groups. Use for create_item \`group_id\`.
- **get_operation_types**: List all operation types. Use for create_routing \`type_id\`.
- **get_workstations**: List all workstations. Use for create_routing \`workstation_id\`.
- **get_customers**: List all customers. Use for create_customer_order \`customer_id\`.
- **get_sites**: List all manufacturing sites. Use for create_manufacturing_order \`site_id\`.
- **get_users**: List all users. Use for create_manufacturing_order \`assigned_id\`.

### Inventory & Products
- **get_inventory**: Get stock levels. Use \`code\` for SKU lookup (e.g., "ZPEO-NH-1").
- **get_product**: Get product details by ID or code.
- **search_items**: Search items by name or code (partial match).

### Customer Orders (Sales)
- **get_customer_orders**: List customer orders. Use \`open_only=true\` to exclude delivered/cancelled.
- **get_customer_order_details**: Get full CO details by ID or code (e.g., "CO-01263").
- **create_customer_order**: Create a new sales order. Use get_customers first. Requires customer_id and products[].
- **update_customer_order**: Update CO status, delivery_date, reference, or notes.

### Manufacturing Orders (Production)
- **get_manufacturing_orders**: List MOs. Use \`open_only=true\` to exclude done/closed/cancelled.
- **get_manufacturing_order_details**: Get full MO details by ID or code (e.g., "MO-39509").
- **create_manufacturing_order**: Create a new MO. Use get_users and get_sites first. Requires article_id, quantity, assigned_id, site_id.
- **update_manufacturing_order**: Update MO code, quantity, dates, or assignment.

### Items
- **create_item**: Create a new item. Use get_units and get_product_groups first. Requires title, unit_id, group_id, is_raw.
- **update_item**: Update item title, code, selling_price, min_quantity, etc.

### Bills of Materials (BOMs)
- **get_boms**: List BOMs. Filter by product_id or item_code.
- **get_bom_details**: Get full BOM with components and linked routings.
- **create_bom**: Create a new BOM. Requires product_id and components[].
- **update_bom**: Update BOM title, code, or components list.

### Routings
- **get_routings**: List routings. Filter by product_id or item_code.
- **get_routing_details**: Get routing with all operations, times, and workstations.
- **create_routing**: Create a new routing. Use get_operation_types and get_workstations first. Requires product_id and operations[].
- **update_routing**: Update routing title, code, or operations list.

### Stock Lots
- **get_stock_lots**: List stock lots with location data. Filter by article_id, item_code, lot_number, or warehouse_id.
- **get_stock_lot_details**: Get lot details with all storage locations and quantities.

### Purchase Orders (Read-Only)
- **get_purchase_orders**: List POs. Filter by code, vendor_id, status, or date range.
- **get_purchase_order_details**: Get full PO with products, invoices, and payment info.

### Shipments
- **get_shipments**: List shipments. Use \`pending_only=true\` for awaiting dispatch.
- **get_shipment_details**: Get shipment details by ID or code (e.g., "SH-00123").

### Reports
- **get_report**: Fetch reports by type (inventory_summary, inventory_movements, procurement, production). Requires from/to dates.

## Best Practices

1. **Use lookup tools before creating**: Before creating items, orders, or routings, use the lookup tools (get_units, get_product_groups, get_customers, get_sites, get_users, get_operation_types, get_workstations) to find valid IDs.

2. **Use code filters for lookups**: When you have an order code like "MO-39509" or "CO-01263", use the \`code\` parameter for efficient single-result queries.

3. **Use open_only/pending_only**: When checking active work, use these filters to exclude completed orders.

4. **Link related data**: Customer orders link to manufacturing orders and shipments. Use the IDs from one query to fetch related records.

5. **Write tools require confirm=true**: All write tools (create_*, update_*) require \`confirm: true\` to execute. With \`confirm: false\` (default), they return a preview of what would be sent.

6. **Purchase orders are read-only**: The MRPeasy API does not support POST/PUT for purchase orders.

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
- Write operations return 201 (POST) or 202 (PUT) on success.
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

  // Register MRPeasy read tools
  registerInventoryTools(server, client);
  registerProductTools(server, client);
  registerSearchTools(server, client);
  registerOrderTools(server, client);
  registerShipmentTools(server, client);
  registerBomTools(server, client);
  registerRoutingTools(server, client);
  registerPurchaseOrderTools(server, client);
  registerStockLotTools(server, client);
  registerReportTools(server, client);

  // Register lookup/reference data tools
  registerLookupTools(server, client);

  // Register MRPeasy write tools
  registerMutationTools(server, client);

  logger.info('MCP server created with all tools registered');
  return server;
}
