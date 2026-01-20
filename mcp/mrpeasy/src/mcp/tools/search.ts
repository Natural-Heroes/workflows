/**
 * MCP Tool: search_items
 *
 * Searches for items (products, parts, materials) in MRPeasy by name or code.
 * Since MRPeasy's server-side search doesn't filter by code reliably,
 * this tool fetches items and filters client-side for accurate results.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/index.js';
import type { StockItem } from '../../services/mrpeasy/types.js';
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
    'Search for items by name or code (part number/SKU). Searches both the item title and the code field. Use get_product with code parameter for exact code lookup.',
    {
      query: z
        .string()
        .min(2)
        .describe('Search term - matches against item name OR code (part number)'),
      include_deleted: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include deleted items in results (default: false)'),
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
        const searchQuery = params.query.toLowerCase();

        // Fetch items - we'll filter client-side for accurate code matching
        // Fetch more items to ensure we have enough after filtering
        const fetchPerPage = 100;
        const allMatchingItems: StockItem[] = [];
        let page = 1;
        const maxPages = 20; // Limit to avoid excessive API calls
        let totalItems = 0;

        // Fetch and filter until we have enough results or exhausted pages
        while (allMatchingItems.length < params.per_page * params.page && page <= maxPages) {
          const items = await client.getItems({ page, per_page: fetchPerPage });

          if (items.length === 0) break;

          // Parse total from Content-Range header
          const contentRange = (items as { _contentRange?: string })._contentRange;
          if (contentRange) {
            const match = contentRange.match(/items \d+-\d+\/(\d+)/);
            if (match) {
              totalItems = parseInt(match[1], 10);
            }
          }

          // Filter items that match query in code OR title
          const filtered = items.filter((item) => {
            // Skip deleted items unless explicitly requested
            if (item.deleted && !params.include_deleted) return false;

            const codeMatch = item.code?.toLowerCase().includes(searchQuery);
            const titleMatch = item.title?.toLowerCase().includes(searchQuery);
            return codeMatch || titleMatch;
          });

          allMatchingItems.push(...filtered);

          // If we've checked all items, stop
          if (page * fetchPerPage >= totalItems) break;
          page++;
        }

        // Apply pagination to filtered results
        const startIdx = (params.page - 1) * params.per_page;
        const endIdx = startIdx + params.per_page;
        const paginatedItems = allMatchingItems.slice(startIdx, endIdx);

        // Format response for LLM consumption
        const lines: string[] = [];

        lines.push(`Search Results for "${params.query}":`);
        lines.push('');

        if (paginatedItems.length === 0) {
          lines.push(`No items found matching "${params.query}".`);
          if (!params.include_deleted) {
            lines.push('Note: Deleted items are hidden. Set include_deleted=true to include them.');
          }
        } else {
          paginatedItems.forEach((item, index) => {
            const num = startIdx + index + 1;
            lines.push(`${num}. ${item.title ?? 'Unknown'} (ID: ${item.article_id})`);
            lines.push(`   Code: ${item.code ?? 'N/A'} | Type: ${item.is_raw ? 'Raw Material' : 'Product'}`);
            lines.push(`   Group: ${item.group_title ?? 'Unknown'}`);
            lines.push(`   In Stock: ${item.in_stock ?? 0} | Available: ${item.available ?? 0}`);
            lines.push(`   Status: ${item.deleted ? 'Deleted' : 'Active'}`);
            lines.push('');
          });

          lines.push(`Showing ${paginatedItems.length} of ${allMatchingItems.length} matching items.`);
          if (allMatchingItems.length > endIdx) {
            lines.push(`Use page=${params.page + 1} to see more results.`);
          }
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
