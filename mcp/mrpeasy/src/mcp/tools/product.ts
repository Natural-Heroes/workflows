/**
 * MCP Tool: get_product
 *
 * Retrieves detailed product information including bill of materials (BOM)
 * from MRPeasy.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient, BomItem } from '../../services/mrpeasy/index.js';
import { logger } from '../../lib/logger.js';

/**
 * Formats BOM items into a hierarchical list.
 *
 * @param bomItems - Array of BOM items
 * @param indent - Indentation level
 * @returns Formatted BOM lines
 */
function formatBom(bomItems: BomItem[], indent: number = 0): string[] {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const item of bomItems) {
    lines.push(
      `${prefix}- ${item.quantity} x ${item.item_name} (ID: ${item.item_id})`
    );
    lines.push(`${prefix}    Part #: ${item.item_number} | Unit: ${item.unit}`);
  }

  return lines;
}

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
    'Get detailed product information including name, description, and bill of materials (BOM). Use this to understand product composition and manufacturing requirements.',
    {
      product_id: z
        .string()
        .describe('The product ID to fetch'),
      include_bom: z
        .boolean()
        .default(true)
        .describe('Include bill of materials (default: true)'),
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

        const product = await client.getProduct(productId);

        // Format response for LLM consumption
        const lines: string[] = [];

        lines.push(`Product: ${product.name} (ID: ${product.id})`);
        lines.push(`Part Number: ${product.number}`);

        if (product.description) {
          lines.push(`Description: ${product.description}`);
        }

        if (product.group) {
          lines.push(`Group: ${product.group}`);
        }

        lines.push(`Unit: ${product.unit}`);
        lines.push(`Standard Cost: $${product.cost.toFixed(2)}`);
        lines.push(`Sales Price: $${product.price.toFixed(2)}`);
        lines.push(`Status: ${product.active ? 'Active' : 'Inactive'}`);

        // Include BOM if requested
        if (params.include_bom) {
          lines.push('');
          lines.push('Bill of Materials:');

          if (product.bom && product.bom.length > 0) {
            lines.push(...formatBom(product.bom));
          } else {
            lines.push('  No BOM defined.');
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
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('get_product tool error', { error: message });

        return {
          content: [
            {
              type: 'text',
              text: `Error fetching product: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Product tools registered');
}
