/**
 * MCP Tool: get_product
 *
 * Retrieves detailed product/item information from MRPeasy.
 * Supports lookup by article_id OR code (part number/SKU).
 * Note: BOM data requires a separate /boms endpoint call (not yet implemented).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/index.js';
import type { StockItem } from '../../services/mrpeasy/types.js';
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
    'Get detailed product/item information by article_id OR code (part number/SKU). Provide either id or code, not both. The code is the Part No. shown in MRPeasy (e.g., "P-APB-NH-3").',
    {
      id: z
        .string()
        .optional()
        .describe('The article_id (numeric ID from URL or inventory results)'),
      code: z
        .string()
        .optional()
        .describe('The part number/SKU code (e.g., "P-APB-NH-3")'),
    },
    async (params) => {
      logger.debug('get_product tool called', { params });

      try {
        // Validate: must provide either id or code
        if (!params.id && !params.code) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Provide either id (article_id) or code (part number/SKU).',
              },
            ],
            isError: true,
          };
        }

        let item: StockItem | undefined;

        if (params.id) {
          // Lookup by article_id
          const articleId = parseInt(params.id, 10);
          if (isNaN(articleId)) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: id must be a valid number.',
                },
              ],
              isError: true,
            };
          }
          item = await client.getProduct(articleId);
        } else if (params.code) {
          // Lookup by code - fetch items and find exact match
          const items = await client.getItems({ per_page: 100 });
          item = items.find(
            (i) => i.code?.toLowerCase() === params.code!.toLowerCase()
          );

          if (!item) {
            // Try fetching more pages if not found
            let page = 2;
            const maxPages = 50; // Limit search to avoid infinite loop
            while (!item && page <= maxPages) {
              const moreItems = await client.getItems({ page, per_page: 100 });
              if (moreItems.length === 0) break;
              item = moreItems.find(
                (i) => i.code?.toLowerCase() === params.code!.toLowerCase()
              );
              page++;
            }
          }

          if (!item) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No item found with code "${params.code}". Check that the part number is correct.`,
                },
              ],
              isError: true,
            };
          }
        }

        if (!item) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Item not found.',
              },
            ],
            isError: true,
          };
        }

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
