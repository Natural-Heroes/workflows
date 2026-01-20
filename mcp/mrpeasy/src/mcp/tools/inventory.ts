/**
 * MCP Tool: get_inventory
 *
 * Retrieves current stock levels and inventory costs from MRPeasy.
 * Provides filtering by item and warehouse, with pagination support.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers inventory-related MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The MRPeasy API client
 */
export function registerInventoryTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  server.tool(
    'get_inventory',
    'Get current stock levels and inventory costs. Filter by item_id or warehouse_id. Returns quantity on hand, reserved, available, and unit costs.',
    {
      item_id: z
        .string()
        .optional()
        .describe('Filter by specific item ID'),
      warehouse_id: z
        .string()
        .optional()
        .describe('Filter by warehouse ID'),
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
      logger.debug('get_inventory tool called', { params });

      try {
        // Convert string IDs to numbers for the API
        const apiParams = {
          item_id: params.item_id ? parseInt(params.item_id, 10) : undefined,
          warehouse_id: params.warehouse_id
            ? parseInt(params.warehouse_id, 10)
            : undefined,
          page: params.page,
          per_page: params.per_page,
        };

        const items = await client.getStockItems(apiParams);

        // Parse pagination from Content-Range header (format: "items 0-99/3633")
        let total = items.length;
        let startIdx = 1;
        let endIdx = items.length;
        const contentRange = (items as { _contentRange?: string })._contentRange;
        if (contentRange) {
          const match = contentRange.match(/items (\d+)-(\d+)\/(\d+)/);
          if (match) {
            startIdx = parseInt(match[1], 10) + 1; // Convert 0-indexed to 1-indexed
            endIdx = parseInt(match[2], 10) + 1;
            total = parseInt(match[3], 10);
          }
        }

        // Format response for LLM consumption
        const lines: string[] = [];

        lines.push(`Inventory Results (${startIdx}-${endIdx} of ${total} items):`);
        lines.push('');

        if (items.length === 0) {
          lines.push('No inventory items found matching the criteria.');
        } else {
          for (const item of items) {
            lines.push(`Item: ${item.title ?? 'Unknown'} (Code: ${item.code ?? 'N/A'}, ID: ${item.article_id})`);
            lines.push(`  - In Stock: ${item.in_stock ?? 0}`);
            lines.push(`  - Reserved: ${item.booked ?? 0}`);
            lines.push(`  - Available: ${item.available ?? 0}`);
            if (item.avg_cost != null && typeof item.avg_cost === 'number') {
              lines.push(`  - Avg Cost: $${item.avg_cost.toFixed(2)}`);
            }
            if (item.selling_price != null && typeof item.selling_price === 'number') {
              lines.push(`  - Selling Price: $${item.selling_price.toFixed(2)}`);
            }
            lines.push(`  - Group: ${item.group_title ?? 'Unknown'}`);
            lines.push(`  - Type: ${item.is_raw ? 'Raw Material' : 'Product'}`);
            lines.push('');
          }

          lines.push(`Showing ${startIdx}-${endIdx} of ${total} total items.`);
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
        return handleToolError(error, 'get_inventory');
      }
    }
  );

  logger.info('Inventory tools registered');
}
