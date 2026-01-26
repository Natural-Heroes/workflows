/**
 * MCP Tools: Reference Data
 *
 * Provides tools for accessing reference data (warehouses, vendors).
 * Warehouses come from dedicated /api/v1/warehouses endpoint.
 * Vendors are extracted from variant responses.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InventoryPlannerClient } from '../../services/inventory-planner/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers reference data MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The Inventory Planner API client
 */
export function registerReferenceTools(
  server: McpServer,
  client: InventoryPlannerClient
): void {
  // list_warehouses - Get available warehouses
  server.tool(
    'list_warehouses',
    'Get available warehouses/locations. Use this to understand filtering options for variants and purchase orders.',
    {
      include_disabled: z
        .boolean()
        .default(false)
        .describe('Include disabled warehouses'),
    },
    async (params) => {
      logger.debug('list_warehouses tool called', { params });

      try {
        const response = await client.getWarehouses();

        // Filter and map warehouses
        const warehouses = response.data
          .filter((w) => params.include_disabled || !w.disabled)
          .map((w) => ({
            id: w.name,
            name: w.display_name,
            type: w.type,
            disabled: w.disabled,
            connection: w.connection,
          }));

        const activeCount = warehouses.filter((w) => !w.disabled).length;
        const disabledCount = warehouses.filter((w) => w.disabled).length;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: `${warehouses.length} warehouse(s) found. ${activeCount} active, ${disabledCount} disabled.`,
                warehouses,
              }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'list_warehouses');
      }
    }
  );

  // list_vendors - Get available vendors
  server.tool(
    'list_vendors',
    'Get available vendors/suppliers. Use this to understand options for filtering variants or creating purchase orders. Vendors are extracted from variant data.',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe('Maximum vendors to return'),
    },
    async (params) => {
      logger.debug('list_vendors tool called', { params });

      try {
        // Fetch variants with vendor fields only
        const response = await client.getVariants({
          fields: 'vendor_id,vendor_name,vendors',
          limit: 1000,
        });

        // Extract unique vendors from both vendor_id/vendor_name and vendors array
        const vendorMap = new Map<string, string>();
        for (const v of response.data) {
          // Primary vendor
          if (v.vendor_id && v.vendor_name) {
            vendorMap.set(v.vendor_id, v.vendor_name);
          }
          // Additional vendors from vendors array (if present)
          if (Array.isArray(v.vendors)) {
            for (const vendor of v.vendors) {
              if (vendor.id && vendor.name) {
                vendorMap.set(vendor.id, vendor.name);
              }
            }
          }
        }

        const vendors = Array.from(vendorMap.entries())
          .slice(0, params.limit)
          .map(([id, name]) => ({ id, name }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: `${vendors.length} vendor(s) found.`,
                vendors,
                note:
                  vendors.length >= params.limit
                    ? 'Results limited. Increase limit parameter to see more.'
                    : 'All available vendors shown.',
              }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'list_vendors');
      }
    }
  );

  logger.info('Reference data tools registered');
}
