/**
 * MCP Tools: Variant Mutations
 *
 * Provides write operations for updating variant planning parameters.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InventoryPlannerClient } from '../../services/inventory-planner/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers variant mutation MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The Inventory Planner API client
 */
export function registerMutationTools(
  server: McpServer,
  client: InventoryPlannerClient
): void {
  // update_variant
  server.tool(
    'ip_update_variant',
    'Update a variant\'s planning parameters such as lead time, review period, safety stock, or reorder point. Use confirm=true to execute, otherwise returns preview.',
    {
      id: z.string().describe('Variant ID'),
      lead_time: z
        .number()
        .min(0)
        .optional()
        .describe('Lead time in days'),
      review_period: z
        .number()
        .min(0)
        .optional()
        .describe('Review period (days of stock target)'),
      safety_stock: z
        .number()
        .min(0)
        .optional()
        .describe('Safety stock level'),
      reorder_point: z
        .number()
        .min(0)
        .optional()
        .describe('Reorder point quantity'),
      active: z
        .boolean()
        .optional()
        .describe('Active status'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Set to true to update. False returns a preview.'),
    },
    async (params) => {
      logger.debug('update_variant tool called', { params });

      try {
        // Preview mode
        if (!params.confirm) {
          const preview = {
            preview: true,
            message: 'This is a preview. Set confirm=true to update the variant.',
            updates: {
              id: params.id,
              lead_time: params.lead_time,
              review_period: params.review_period,
              safety_stock: params.safety_stock,
              reorder_point: params.reorder_point,
              active: params.active,
            },
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(preview),
              },
            ],
          };
        }

        // Update the variant
        const variant = await client.updateVariant(params.id, {
          lead_time: params.lead_time,
          review_period: params.review_period,
          safety_stock: params.safety_stock,
          reorder_point: params.reorder_point,
          active: params.active,
        });

        const result = {
          success: true,
          message: `Variant ${variant.sku ?? variant.id} updated successfully.`,
          variant: {
            id: variant.id,
            sku: variant.sku,
            title: variant.full_title ?? variant.title,
            leadTime: variant.lead_time,
            reviewPeriod: variant.review_period,
            safetyStock: variant.safety_stock,
            reorderPoint: variant.reorder_point,
            active: variant.active,
          },
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'ip_update_variant');
      }
    }
  );

  logger.info('Mutation tools registered');
}
