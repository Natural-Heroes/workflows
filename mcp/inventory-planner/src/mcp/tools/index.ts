/**
 * MCP Tool Registration
 *
 * Creates and configures the McpServer instance with registered tools.
 * Includes variant and purchase order tools for Inventory Planner integration.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';
import { createInventoryPlannerClient } from '../../services/inventory-planner/index.js';
import { registerVariantTools } from './variants.js';
import { registerPurchaseOrderTools } from './purchase-orders.js';
import { registerMutationTools } from './mutations.js';
import { registerReferenceTools } from './reference.js';

/**
 * Brief server description shown during initialization.
 */
const SERVER_DESCRIPTION =
  'Inventory Planner integration for demand forecasting and replenishment. Read variants with stock levels, replenishment recommendations, and stockout forecasts. Manage purchase orders. Read the inventory-planner://instructions resource for usage guide.';

/**
 * Detailed instructions for LLMs, served as a resource.
 */
const INSTRUCTIONS_RESOURCE = `# Inventory Planner MCP Server Instructions

This server provides access to Inventory Planner for demand forecasting, replenishment recommendations, and purchase order management.

## Available Tools

### Variants (Demand Forecasting)
- **get_variants**: List variants with stock levels and forecasting metrics. Filter by SKU, warehouse, vendor, or stock levels.
- **get_variant**: Get detailed metrics for a single variant including forecasts and planning parameters.
- **get_replenishment**: Get items that need reorder (replenishment > 0). Essential for procurement planning.
- **update_variant**: Update planning parameters (lead time, review period, safety stock).

### Purchase Orders
- **get_purchase_orders**: List POs, transfers, and assembly orders. Filter by status, vendor, or date.
- **get_purchase_order**: Get full PO details with line items.
- **create_purchase_order**: Create new PO from replenishment recommendations.
- **update_purchase_order**: Update PO status, dates, or notes.
- **update_received_qty**: Record received quantities on PO items.

### Reference Data
- **list_warehouses**: Get available warehouses/locations for filtering context.
- **list_vendors**: Get available vendors/suppliers for PO creation and filtering.

## Key Metrics

| Metric | Description |
|--------|-------------|
| replenishment | Recommended reorder quantity |
| oos | Days until out of stock (stockout forecast) |
| days_of_stock | Current days of stock on hand |
| lead_time | Supplier lead time in days |
| review_period | Target days of stock to maintain |
| safety_stock | Buffer stock level |
| forecast_daily | Predicted daily demand |
| velocity_daily | Average daily sales rate |
| under_value | Forecasted lost revenue from stockouts |

## Best Practices

1. **Use get_replenishment for reorders**: Filter by vendor_id to create vendor-specific POs.

2. **Check oos for urgency**: Items with oos < 7 are urgent and should be prioritized.

3. **Write tools require confirm=true**: All create/update operations require \`confirm: true\` to execute. Default is preview mode.

4. **Pagination**: Use page and limit params. Max 1000 items per request.

5. **Sorting**: Use sort_desc="replenishment" to see highest reorder quantities first.

## Workflow Example: Create Reorder PO

1. Get items needing reorder for a specific vendor:
   \`get_replenishment(vendor_id="123", sort_desc="replenishment")\`

2. Review the items and quantities

3. Create the purchase order:
   \`create_purchase_order(vendor_id="123", warehouse_id="456", items=[...], confirm=true)\`

## Notes

- Stock data updates periodically from your connected sales channels
- Forecasts are calculated using Inventory Planner's demand algorithms
- Lead times affect replenishment calculations
- All timestamps use RFC822 format
`;

/**
 * Creates and returns a configured McpServer instance.
 *
 * The server is configured with:
 * - Server name and version for identification
 * - Server description for LLM context
 * - Instructions resource with detailed usage guide
 * - Ping tool for connectivity testing
 * - Variant tools (get_variants, get_variant, get_replenishment)
 * - Purchase order tools (get/create/update)
 * - Mutation tools (update_variant)
 * - Reference tools (list_warehouses, list_vendors)
 *
 * @returns Configured McpServer instance ready for connection
 */
export function createMcpServer(): McpServer {
  logger.info('Creating MCP server instance');

  const server = new McpServer({
    name: 'inventory-planner-mcp',
    version: '0.1.0',
    description: SERVER_DESCRIPTION,
  });

  // Create Inventory Planner API client
  const client = createInventoryPlannerClient();

  // Register instructions resource for LLM guidance
  server.resource(
    'instructions',
    'inventory-planner://instructions',
    {
      description: 'Usage guide for the Inventory Planner MCP server. Read this to understand available tools, best practices, and metrics.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'inventory-planner://instructions',
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_RESOURCE,
        },
      ],
    })
  );

  // Register placeholder ping tool for testing
  server.tool(
    'ip_ping',
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

  // Register Inventory Planner tools
  registerVariantTools(server, client);
  registerPurchaseOrderTools(server, client);
  registerMutationTools(server, client);
  registerReferenceTools(server, client);

  logger.info('MCP server created with all tools registered');
  return server;
}
