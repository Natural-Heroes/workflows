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

        const response = await client.getStockItems(apiParams);
        const { data, pagination } = response;

        // Format response for LLM consumption
        const lines: string[] = [];

        lines.push(
          `Inventory Results (Page ${pagination.page} of ${pagination.total_pages}):`
        );
        lines.push('');

        if (data.length === 0) {
          lines.push('No inventory items found matching the criteria.');
        } else {
          for (const item of data) {
            lines.push(`Item: ${item.item_name} (ID: ${item.item_id})`);
            lines.push(`  - Quantity: ${item.quantity}`);
            lines.push(`  - Reserved: ${item.booked_quantity}`);
            lines.push(`  - Available: ${item.available_quantity}`);
            lines.push(`  - Unit Cost: $${item.cost.toFixed(2)}`);
            lines.push(`  - Total Value: $${item.total_value.toFixed(2)}`);
            lines.push(`  - Warehouse: ${item.warehouse_name}`);
            if (item.lot_number) {
              lines.push(`  - Lot: ${item.lot_number}`);
            }
            lines.push('');
          }

          // Calculate range for display
          const startIdx = (pagination.page - 1) * pagination.per_page + 1;
          const endIdx = startIdx + data.length - 1;
          lines.push(
            `Showing ${startIdx}-${endIdx} of ${pagination.total} total items.`
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
        return handleToolError(error, 'get_inventory');
      }
    }
  );

  logger.info('Inventory tools registered');
}
