/**
 * MCP Tool: search_items
 *
 * Searches for items (products, parts, materials) in MRPeasy by name or SKU.
 * Provides filtering by item type and pagination support.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers search-related MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The MRPeasy API client
 */
export function registerSearchTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  server.tool(
    'search_items',
    'Search for items (products, parts, materials) by name or SKU/part number. Returns matching items with basic info. Use get_product for detailed product information.',
    {
      query: z
        .string()
        .min(2)
        .describe('Search term (minimum 2 characters)'),
      type: z
        .enum(['product', 'part', 'material', 'all'])
        .optional()
        .describe('Filter by item type: product, part, material, or all'),
      page: z
        .number()
        .int()
        .positive()
        .default(1)
        .describe('Page number for pagination'),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Items per page (max 100)'),
    },
    async (params) => {
      logger.debug('search_items tool called', { params });

      try {
        // Build API parameters - MRPeasy uses different param names
        const apiParams: Record<string, string | number | undefined> = {
          search: params.query,
          page: params.page,
          per_page: params.per_page,
        };

        const items = await client.getItems(apiParams);

        // Parse pagination from Content-Range header (format: "items 0-99/3633")
        let total = items.length;
        let startIdx = 1;
        const contentRange = (items as { _contentRange?: string })._contentRange;
        if (contentRange) {
          const match = contentRange.match(/items (\d+)-(\d+)\/(\d+)/);
          if (match) {
            startIdx = parseInt(match[1], 10) + 1;
            total = parseInt(match[3], 10);
          }
        }

        // Format response for LLM consumption
        const lines: string[] = [];

        lines.push(`Search Results for "${params.query}":`);
        lines.push('');

        if (items.length === 0) {
          lines.push(`No items found matching "${params.query}".`);
        } else {
          items.forEach((item, index) => {
            const num = startIdx + index;
            lines.push(`${num}. ${item.title ?? 'Unknown'} (ID: ${item.article_id})`);
            lines.push(`   Code: ${item.code ?? 'N/A'} | Type: ${item.is_raw ? 'Raw Material' : 'Product'}`);
            lines.push(`   Group: ${item.group_title ?? 'Unknown'}`);
            lines.push(`   In Stock: ${item.in_stock ?? 0} | Available: ${item.available ?? 0}`);
            lines.push(`   Status: ${item.deleted ? 'Deleted' : 'Active'}`);
            lines.push('');
          });

          lines.push(`Showing ${items.length} of ${total} matching items.`);
        }

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n'),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'search_items');
      }
    }
  );

  logger.info('Search tools registered');
}
