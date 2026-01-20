/**
 * MCP Tool: get_product
 *
 * Retrieves detailed product/item information from MRPeasy.
 * Note: BOM data requires a separate /boms endpoint call (not yet implemented).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers product-related MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The MRPeasy API client
 */
export function registerProductTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  server.tool(
    'get_product',
    'Get detailed product/item information including name, stock levels, costs, and pricing. Use the article_id from inventory results.',
    {
      product_id: z
        .string()
        .describe('The article ID (from inventory results) to fetch'),
    },
    async (params) => {
      logger.debug('get_product tool called', { params });

      try {
        const productId = parseInt(params.product_id, 10);

        if (isNaN(productId)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: product_id must be a valid number.',
              },
            ],
            isError: true,
          };
        }

        const item = await client.getProduct(productId);

        // Format response for LLM consumption
        const lines: string[] = [];

        lines.push(`Product: ${item.title ?? 'Unknown'} (ID: ${item.article_id})`);
        lines.push(`Code/SKU: ${item.code ?? 'N/A'}`);
        lines.push(`Product ID: ${item.product_id}`);
        lines.push(`Group: ${item.group_title ?? 'Unknown'} (${item.group_code ?? 'N/A'})`);
        lines.push(`Type: ${item.is_raw ? 'Raw Material' : 'Finished Product'}`);
        lines.push('');
        lines.push('Stock Levels:');
        lines.push(`  - In Stock: ${item.in_stock ?? 0}`);
        lines.push(`  - Reserved: ${item.booked ?? 0}`);
        lines.push(`  - Available: ${item.available ?? 0}`);
        lines.push(`  - Expected Total: ${item.expected_total ?? 0}`);
        lines.push(`  - Expected Available: ${item.expected_available ?? 0}`);
        lines.push('');
        lines.push('Pricing:');
        if (item.avg_cost != null && typeof item.avg_cost === 'number') {
          lines.push(`  - Average Cost: $${item.avg_cost.toFixed(2)}`);
        }
        if (item.selling_price != null && typeof item.selling_price === 'number') {
          lines.push(`  - Selling Price: $${item.selling_price.toFixed(2)}`);
        }
        lines.push('');
        lines.push(`Status: ${item.deleted ? 'Deleted' : 'Active'}`);

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n'),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'get_product');
      }
    }
  );

  logger.info('Product tools registered');
}
