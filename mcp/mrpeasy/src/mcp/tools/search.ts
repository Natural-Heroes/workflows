/**
 * MCP Tool: search_items
 *
 * Searches for items (products, parts, materials) in MRPeasy by name or SKU.
 * Provides filtering by item type and pagination support.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient, ItemType } from '../../services/mrpeasy/index.js';
import { logger } from '../../lib/logger.js';

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
        // Build API parameters
        const apiParams: {
          search: string;
          type?: ItemType;
          page: number;
          per_page: number;
        } = {
          search: params.query,
          page: params.page,
          per_page: params.per_page,
        };

        // Only add type filter if not 'all'
        if (params.type && params.type !== 'all') {
          apiParams.type = params.type as ItemType;
        }

        const response = await client.getItems(apiParams);
        const { data, pagination } = response;

        // Format response for LLM consumption
        const lines: string[] = [];

        lines.push(
          `Search Results for "${params.query}" (Page ${pagination.page} of ${pagination.total_pages}):`
        );
        lines.push('');

        if (data.length === 0) {
          lines.push(`No items found matching "${params.query}".`);
        } else {
          data.forEach((item, index) => {
            const num = (pagination.page - 1) * pagination.per_page + index + 1;
            lines.push(`${num}. ${item.name} (ID: ${item.id})`);
            lines.push(`   Type: ${item.type} | Part #: ${item.number}`);
            if (item.group) {
              lines.push(`   Group: ${item.group}`);
            }
            lines.push(`   Status: ${item.active ? 'Active' : 'Inactive'}`);
            lines.push('');
          });

          lines.push(
            `Found ${pagination.total} items matching "${params.query}".`
          );
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
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('search_items tool error', { error: message });

        return {
          content: [
            {
              type: 'text',
              text: `Error searching items: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Search tools registered');
}
