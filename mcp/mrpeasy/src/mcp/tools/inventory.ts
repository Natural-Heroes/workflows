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

        // Build hybrid JSON response
        if (items.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'No inventory items found matching the criteria.',
                  pagination: { showing: 0, total: 0 },
                  items: [],
                }),
              },
            ],
          };
        }

        // Build summary stats
        let totalInStock = 0;
        let totalAvailable = 0;
        let rawCount = 0;
        let productCount = 0;
        items.forEach((item) => {
          totalInStock += Number(item.in_stock ?? 0);
          totalAvailable += Number(item.available ?? 0);
          if (item.is_raw) rawCount++;
          else productCount++;
        });

        const inventoryItems = items.map((item) => ({
          id: item.article_id,
          code: item.code,
          name: item.title ?? 'Unknown',
          inStock: Number(item.in_stock ?? 0),
          reserved: Number(item.booked ?? 0),
          available: Number(item.available ?? 0),
          avgCost: item.avg_cost != null ? Number(item.avg_cost) : null,
          sellingPrice: item.selling_price != null ? Number(item.selling_price) : null,
          group: item.group_title ?? null,
          type: item.is_raw ? 'raw_material' : 'product',
        }));

        const response = {
          summary: `${items.length} of ${total} items: ${totalInStock} in stock, ${totalAvailable} available. ${productCount} products, ${rawCount} raw materials.`,
          pagination: {
            showing: items.length,
            total,
            startIdx,
            endIdx,
          },
          items: inventoryItems,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response),
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
