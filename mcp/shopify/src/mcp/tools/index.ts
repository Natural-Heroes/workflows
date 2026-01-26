/**
 * MCP Tool Registration
 *
 * Creates and configures the McpServer instance with all Shopify tools.
 * Includes multi-store support and instructions resource for LLM guidance.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';
import { createShopifyClient } from '../../services/shopify/index.js';
import { registerProductTools } from './products.js';
import { registerOrderTools } from './orders.js';
import { registerCustomerTools } from './customers.js';
import { registerCollectionTools } from './collections.js';
import { registerShopTools } from './shop.js';

const SERVER_DESCRIPTION =
  'Shopify Admin API integration with multi-store support. Query products, orders, customers, and collections across multiple NH Shopify stores. Read the shopify://instructions resource for usage guide.';

const INSTRUCTIONS_RESOURCE = `# Shopify MCP Server Instructions

Custom Shopify Admin API server for Natural Heroes with multi-store support.

## Multi-Store Usage

Every tool accepts an optional \`store\` parameter to target a specific store.
Use \`list_stores\` to see available stores. If omitted, the default store is used.

## Available Tools

### Products
- **get_products**: Search/list products. Supports Shopify query syntax.
  - Query examples: \`"status:active"\`, \`"title:hero"\`, \`"vendor:NH"\`
- **get_product**: Get full product details by GID.
- **get_variants**: Get variants by their GIDs. Check inventory/pricing.

### Orders
- **get_orders**: Search/list orders with filtering and sorting.
  - Query examples: \`"fulfillment_status:unfulfilled"\`, \`"financial_status:paid"\`, \`"created_at:>2025-01-01"\`
  - Sort by: PROCESSED_AT, TOTAL_PRICE, CREATED_AT, ORDER_NUMBER
- **get_order**: Get full order details including line items, addresses, fulfillments.

### Customers
- **get_customers**: Search/list customers.
  - Query examples: \`"email:john@example.com"\`, \`"tag:vip"\`, \`"orders_count:>5"\`
- **tag_customer**: Add tags to a customer (additive, preserves existing).

### Collections
- **get_collections**: List/search collections.
- **get_collection_products**: Get products within a collection.

### Shop
- **get_shop**: Get shop info (name, domain, currency, plan, shipping countries).
- **list_stores**: List all configured stores and their identifiers.

## Best Practices

1. **Use list_stores first** if unsure which stores are available.
2. **Use query filters** to narrow results instead of fetching all and filtering client-side.
3. **Paginate with cursors**: Use the \`endCursor\` from responses as the \`after\` parameter.
4. **GID format**: Shopify IDs are GraphQL Global IDs like \`"gid://shopify/Product/123"\`.

## Query Syntax

Shopify uses a search query language:
- Field filters: \`field:value\` (e.g., \`status:active\`)
- Negation: \`-field:value\` (e.g., \`-status:archived\`)
- Ranges: \`field:>value\`, \`field:<value\` (e.g., \`created_at:>2025-01-01\`)
- Multiple: Space-separated combines with AND
- Wildcards: \`field:*value*\`

## Rate Limiting

This server handles Shopify's cost-based rate limiting automatically with retry logic.
If you receive a rate limit error, wait a few seconds and retry.
`;

/**
 * Creates and returns a configured McpServer instance with all Shopify tools.
 */
export function createMcpServer(): McpServer {
  logger.info('Creating Shopify MCP server instance');

  const server = new McpServer({
    name: 'shopify-mcp',
    version: '0.1.0',
    description: SERVER_DESCRIPTION,
  });

  const client = createShopifyClient();

  // Register instructions resource for LLM guidance
  server.resource(
    'instructions',
    'shopify://instructions',
    {
      description: 'Usage guide for the Shopify MCP server. Read this to understand available tools, multi-store usage, and query syntax.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'shopify://instructions',
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_RESOURCE,
        },
      ],
    })
  );

  // Ping tool for connectivity testing
  server.tool(
    'shop_ping',
    'Test tool to verify the Shopify MCP server is working. Returns "pong".',
    {},
    async () => {
      logger.debug('Ping tool called');
      return { content: [{ type: 'text', text: 'pong' }] };
    }
  );

  // Register all tool groups
  registerProductTools(server, client);
  registerOrderTools(server, client);
  registerCustomerTools(server, client);
  registerCollectionTools(server, client);
  registerShopTools(server, client);

  logger.info('Shopify MCP server created with all tools registered');
  return server;
}
