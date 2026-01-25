/**
 * MCP Tools: Purchase Orders
 *
 * Provides tools for managing purchase orders, transfers, and assembly orders.
 * Includes both read operations (Phase 1) and write operations (Phase 2).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InventoryPlannerClient } from '../../services/inventory-planner/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers purchase order MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The Inventory Planner API client
 */
export function registerPurchaseOrderTools(
  server: McpServer,
  client: InventoryPlannerClient
): void {
  // get_purchase_orders - List purchase orders
  server.tool(
    'get_purchase_orders',
    'Get purchase orders, transfers, and assembly orders. Filter by status, vendor, warehouse, or date range. Returns order details including status, vendor, expected date, and totals.',
    {
      status: z
        .enum(['draft', 'open', 'sent', 'partial', 'received', 'closed', 'cancelled'])
        .optional()
        .describe('Filter by order status'),
      type: z
        .enum(['purchase_order', 'transfer', 'assembly'])
        .optional()
        .describe('Filter by order type'),
      vendor_id: z
        .string()
        .optional()
        .describe('Filter by vendor ID'),
      warehouse_id: z
        .string()
        .optional()
        .describe('Filter by destination warehouse ID'),
      expected_date_gt: z
        .string()
        .optional()
        .describe('Filter orders with expected date after this (RFC822 format)'),
      expected_date_lt: z
        .string()
        .optional()
        .describe('Filter orders with expected date before this (RFC822 format)'),
      page: z
        .number()
        .int()
        .positive()
        .default(1)
        .describe('Page number for pagination'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .describe('Items per page (max 1000)'),
    },
    async (params) => {
      logger.debug('get_purchase_orders tool called', { params });

      try {
        const response = await client.getPurchaseOrders({
          status: params.status,
          type: params.type,
          vendor_id: params.vendor_id,
          warehouse_id: params.warehouse_id,
          expected_date_gt: params.expected_date_gt,
          expected_date_lt: params.expected_date_lt,
          page: params.page,
          limit: params.limit,
        });

        const orders = response.data;
        const meta = response.meta;

        if (orders.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'No purchase orders found matching the criteria.',
                  pagination: { showing: 0, total: meta?.total ?? 0 },
                  orders: [],
                }),
              },
            ],
          };
        }

        // Calculate summary stats
        let totalValue = 0;
        const statusCounts: Record<string, number> = {};

        const orderItems = orders.map((po) => {
          totalValue += po.total ?? 0;
          const status = po.status ?? 'unknown';
          statusCounts[status] = (statusCounts[status] ?? 0) + 1;

          return {
            id: po.id,
            number: po.number,
            type: po.type ?? 'purchase_order',
            status: po.status,
            vendor: po.vendor_name,
            vendorId: po.vendor_id,
            warehouse: po.warehouse_name,
            warehouseId: po.warehouse_id,
            orderDate: po.order_date,
            expectedDate: po.expected_date,
            receivedDate: po.received_date,
            total: po.total,
            currency: po.currency,
            itemCount: po.items?.length ?? 0,
          };
        });

        const statusSummary = Object.entries(statusCounts)
          .map(([status, count]) => `${count} ${status}`)
          .join(', ');

        const result = {
          summary: `${orders.length} of ${meta?.total ?? orders.length} orders. ${statusSummary}. Total value: $${totalValue.toLocaleString()}.`,
          pagination: {
            showing: orders.length,
            total: meta?.total ?? orders.length,
            page: params.page,
            limit: meta?.limit ?? params.limit,
          },
          orders: orderItems,
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
        return handleToolError(error, 'get_purchase_orders');
      }
    }
  );

  // get_purchase_order - Get single PO by ID
  server.tool(
    'get_purchase_order',
    'Get detailed information for a single purchase order by ID. Returns full order details including all line items with quantities ordered and received.',
    {
      id: z.string().describe('Purchase order ID'),
    },
    async (params) => {
      logger.debug('get_purchase_order tool called', { params });

      try {
        const po = await client.getPurchaseOrder(params.id);

        const result = {
          id: po.id,
          number: po.number,
          type: po.type ?? 'purchase_order',
          status: po.status,

          // Vendor/warehouse
          vendor: {
            id: po.vendor_id,
            name: po.vendor_name,
          },
          warehouse: {
            id: po.warehouse_id,
            name: po.warehouse_name,
          },
          sourceWarehouseId: po.source_warehouse_id,

          // Dates
          dates: {
            orderDate: po.order_date,
            expectedDate: po.expected_date,
            receivedDate: po.received_date,
            createdAt: po.created_at,
            updatedAt: po.updated_at,
          },

          // Financial
          financial: {
            total: po.total,
            currency: po.currency,
            shippingCost: po.shipping_cost,
          },

          // Line items
          items: po.items?.map((item) => ({
            id: item.id,
            variantId: item.variant_id,
            sku: item.sku,
            title: item.title,
            quantityOrdered: item.quantity ?? 0,
            quantityReceived: item.received_quantity ?? 0,
            cost: item.cost,
            total: item.total,
          })) ?? [],

          // Metadata
          notes: po.notes,
          reference: po.reference,
          externalId: po.external_id,
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
        return handleToolError(error, 'get_purchase_order');
      }
    }
  );

  // ===========================================================================
  // Write Operations (Phase 2)
  // ===========================================================================

  // create_purchase_order
  server.tool(
    'create_purchase_order',
    'Create a new purchase order from replenishment recommendations. Requires vendor_id, warehouse_id, and items with variant_id and quantity. Use confirm=true to execute, otherwise returns preview.',
    {
      vendor_id: z.string().describe('Vendor/supplier ID'),
      warehouse_id: z.string().describe('Destination warehouse ID'),
      items: z
        .array(
          z.object({
            variant_id: z.string().describe('Variant ID'),
            quantity: z.number().positive().describe('Quantity to order'),
            cost: z.number().optional().describe('Unit cost (optional)'),
          })
        )
        .min(1)
        .describe('Line items to order'),
      type: z
        .enum(['purchase_order', 'transfer', 'assembly'])
        .optional()
        .describe('Order type (defaults to purchase_order)'),
      expected_date: z
        .string()
        .optional()
        .describe('Expected delivery date (RFC822 format)'),
      notes: z.string().optional().describe('Order notes'),
      reference: z.string().optional().describe('Reference number'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Set to true to create the order. False returns a preview.'),
    },
    async (params) => {
      logger.debug('create_purchase_order tool called', { params });

      try {
        // Preview mode - show what would be created
        if (!params.confirm) {
          const preview = {
            preview: true,
            message: 'This is a preview. Set confirm=true to create the purchase order.',
            order: {
              vendor_id: params.vendor_id,
              warehouse_id: params.warehouse_id,
              type: params.type ?? 'purchase_order',
              expected_date: params.expected_date,
              notes: params.notes,
              reference: params.reference,
              items: params.items,
              itemCount: params.items.length,
              totalQuantity: params.items.reduce((sum, i) => sum + i.quantity, 0),
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

        // Create the order
        const po = await client.createPurchaseOrder({
          vendor_id: params.vendor_id,
          warehouse_id: params.warehouse_id,
          items: params.items,
          type: params.type,
          expected_date: params.expected_date,
          notes: params.notes,
          reference: params.reference,
        });

        const result = {
          success: true,
          message: `Purchase order ${po.number ?? po.id} created successfully.`,
          order: {
            id: po.id,
            number: po.number,
            status: po.status,
            vendor: po.vendor_name,
            warehouse: po.warehouse_name,
            total: po.total,
            itemCount: po.items?.length ?? params.items.length,
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
        return handleToolError(error, 'create_purchase_order');
      }
    }
  );

  // update_purchase_order
  server.tool(
    'update_purchase_order',
    'Update an existing purchase order status, dates, or notes. Use confirm=true to execute, otherwise returns preview.',
    {
      id: z.string().describe('Purchase order ID'),
      status: z
        .enum(['draft', 'open', 'sent', 'partial', 'received', 'closed', 'cancelled'])
        .optional()
        .describe('New status'),
      expected_date: z
        .string()
        .optional()
        .describe('New expected delivery date'),
      notes: z.string().optional().describe('New notes'),
      reference: z.string().optional().describe('New reference number'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Set to true to update. False returns a preview.'),
    },
    async (params) => {
      logger.debug('update_purchase_order tool called', { params });

      try {
        // Preview mode
        if (!params.confirm) {
          const preview = {
            preview: true,
            message: 'This is a preview. Set confirm=true to update the purchase order.',
            updates: {
              id: params.id,
              status: params.status,
              expected_date: params.expected_date,
              notes: params.notes,
              reference: params.reference,
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

        // Update the order
        const po = await client.updatePurchaseOrder(params.id, {
          status: params.status,
          expected_date: params.expected_date,
          notes: params.notes,
          reference: params.reference,
        });

        const result = {
          success: true,
          message: `Purchase order ${po.number ?? po.id} updated successfully.`,
          order: {
            id: po.id,
            number: po.number,
            status: po.status,
            expectedDate: po.expected_date,
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
        return handleToolError(error, 'update_purchase_order');
      }
    }
  );

  // update_received_qty
  server.tool(
    'update_received_qty',
    'Record received quantities for purchase order line items. Use confirm=true to execute, otherwise returns preview.',
    {
      order_id: z.string().describe('Purchase order ID'),
      items: z
        .array(
          z.object({
            id: z.string().describe('Line item ID'),
            received_quantity: z.number().min(0).describe('Quantity received'),
          })
        )
        .min(1)
        .describe('Items with received quantities'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Set to true to update. False returns a preview.'),
    },
    async (params) => {
      logger.debug('update_received_qty tool called', { params });

      try {
        // Preview mode
        if (!params.confirm) {
          const preview = {
            preview: true,
            message: 'This is a preview. Set confirm=true to record received quantities.',
            updates: {
              order_id: params.order_id,
              items: params.items,
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

        // Update received quantities
        const items = await client.updateReceivedQuantities(params.order_id, params.items);

        const result = {
          success: true,
          message: `Received quantities updated for ${items.length} items.`,
          items: items.map((item) => ({
            id: item.id,
            sku: item.sku,
            quantityOrdered: item.quantity,
            quantityReceived: item.received_quantity,
          })),
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
        return handleToolError(error, 'update_received_qty');
      }
    }
  );

  logger.info('Purchase order tools registered');
}
