/**
 * MCP Tools for Customer Orders and Manufacturing Orders.
 *
 * Provides tools for querying order data from MRPeasy:
 * - get_customer_orders: Fetch customer (sales) orders with filtering
 * - get_manufacturing_orders: Fetch manufacturing (production) orders with filtering
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { CustomerOrder, ManufacturingOrder, PaginationMeta } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Customer order status enum for filtering.
 */
const CustomerOrderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'in_production',
  'shipped',
  'completed',
  'cancelled',
]);

/**
 * Manufacturing order status enum for filtering.
 */
const ManufacturingOrderStatusSchema = z.enum([
  'pending',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

/**
 * Input schema for get_customer_orders tool.
 */
const GetCustomerOrdersInputSchema = z.object({
  status: CustomerOrderStatusSchema.optional().describe(
    'Filter by order status: pending, confirmed, in_production, shipped, completed, or cancelled'
  ),
  customer_id: z.string().optional().describe(
    'Filter by customer ID'
  ),
  date_from: z.string().optional().describe(
    'Filter orders created on or after this date (ISO format: YYYY-MM-DD)'
  ),
  date_to: z.string().optional().describe(
    'Filter orders created on or before this date (ISO format: YYYY-MM-DD)'
  ),
  page: z.number().int().positive().default(1).describe(
    'Page number (default: 1)'
  ),
  per_page: z.number().int().positive().max(100).default(20).describe(
    'Number of results per page (default: 20, max: 100)'
  ),
});

/**
 * Input schema for get_manufacturing_orders tool.
 */
const GetManufacturingOrdersInputSchema = z.object({
  status: ManufacturingOrderStatusSchema.optional().describe(
    'Filter by order status: pending, scheduled, in_progress, completed, or cancelled'
  ),
  product_id: z.string().optional().describe(
    'Filter by product ID being manufactured'
  ),
  date_from: z.string().optional().describe(
    'Filter orders with start date on or after this date (ISO format: YYYY-MM-DD)'
  ),
  date_to: z.string().optional().describe(
    'Filter orders with start date on or before this date (ISO format: YYYY-MM-DD)'
  ),
  page: z.number().int().positive().default(1).describe(
    'Page number (default: 1)'
  ),
  per_page: z.number().int().positive().max(100).default(20).describe(
    'Number of results per page (default: 20, max: 100)'
  ),
});

// ============================================================================
// Response Formatters
// ============================================================================

/**
 * Formats a single customer order for LLM-readable output.
 */
function formatCustomerOrder(order: CustomerOrder): string {
  const lines: string[] = [];

  lines.push(`Order #${order.number} (ID: ${order.id})`);
  lines.push(`Status: ${order.status}`);
  lines.push(`Customer: ${order.customer_name}`);
  lines.push(`Order Date: ${order.order_date}`);
  lines.push(`Delivery Date: ${order.delivery_date}`);

  if (order.items && order.items.length > 0) {
    lines.push('Items:');
    for (const item of order.items) {
      lines.push(`  - ${item.quantity} x ${item.item_name}`);
    }
  }

  lines.push(`Total: ${order.currency} ${order.total.toFixed(2)}`);

  return lines.join('\n');
}

/**
 * Formats customer orders response for LLM consumption.
 */
function formatCustomerOrdersResponse(
  orders: CustomerOrder[],
  pagination: PaginationMeta
): string {
  if (orders.length === 0) {
    return 'No customer orders found matching the specified criteria.';
  }

  const lines: string[] = [];

  lines.push(`Customer Orders (Page ${pagination.page} of ${pagination.total_pages}):`);
  lines.push('');

  for (const order of orders) {
    lines.push(formatCustomerOrder(order));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Calculate range for "Showing X-Y of Z"
  const startItem = (pagination.page - 1) * pagination.per_page + 1;
  const endItem = Math.min(pagination.page * pagination.per_page, pagination.total);

  lines.push(`Showing ${startItem}-${endItem} of ${pagination.total} orders.`);

  return lines.join('\n');
}

/**
 * Formats a single manufacturing order for LLM-readable output.
 */
function formatManufacturingOrder(order: ManufacturingOrder): string {
  const lines: string[] = [];

  lines.push(`MO #${order.number} (ID: ${order.id})`);
  lines.push(`Status: ${order.status}`);
  lines.push(`Product: ${order.product_name} (ID: ${order.product_id})`);
  lines.push(`Quantity: ${order.quantity}`);
  lines.push(`Start Date: ${order.start_date}`);
  lines.push(`Due Date: ${order.finish_date}`);

  // Calculate progress percentage
  const percentage = order.quantity > 0
    ? Math.round((order.produced_quantity / order.quantity) * 100)
    : 0;
  lines.push(`Progress: ${order.produced_quantity}/${order.quantity} (${percentage}%)`);

  return lines.join('\n');
}

/**
 * Formats manufacturing orders response for LLM consumption.
 */
function formatManufacturingOrdersResponse(
  orders: ManufacturingOrder[],
  pagination: PaginationMeta
): string {
  if (orders.length === 0) {
    return 'No manufacturing orders found matching the specified criteria.';
  }

  const lines: string[] = [];

  lines.push(`Manufacturing Orders (Page ${pagination.page} of ${pagination.total_pages}):`);
  lines.push('');

  for (const order of orders) {
    lines.push(formatManufacturingOrder(order));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Calculate range for "Showing X-Y of Z"
  const startItem = (pagination.page - 1) * pagination.per_page + 1;
  const endItem = Math.min(pagination.page * pagination.per_page, pagination.total);

  lines.push(`Showing ${startItem}-${endItem} of ${pagination.total} manufacturing orders.`);

  return lines.join('\n');
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Registers order-related MCP tools.
 *
 * Tools registered:
 * - get_customer_orders: Query customer orders with optional filters
 * - get_manufacturing_orders: Query manufacturing orders with optional filters
 *
 * @param server - MCP server instance to register tools on
 * @param client - MRPeasy API client for making requests
 */
export function registerOrderTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering order tools');

  // -------------------------------------------------------------------------
  // get_customer_orders
  // -------------------------------------------------------------------------
  server.tool(
    'get_customer_orders',
    'Get customer orders with optional filtering by status, customer, or date range. Returns order details including items, quantities, and delivery dates.',
    {
      status: GetCustomerOrdersInputSchema.shape.status,
      customer_id: GetCustomerOrdersInputSchema.shape.customer_id,
      date_from: GetCustomerOrdersInputSchema.shape.date_from,
      date_to: GetCustomerOrdersInputSchema.shape.date_to,
      page: GetCustomerOrdersInputSchema.shape.page,
      per_page: GetCustomerOrdersInputSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_customer_orders called', { params });

      try {
        // Build API parameters
        const apiParams: Record<string, unknown> = {
          page: params.page ?? 1,
          per_page: params.per_page ?? 20,
        };

        if (params.status) {
          apiParams.status = params.status;
        }
        if (params.customer_id) {
          apiParams.customer_id = parseInt(params.customer_id, 10);
        }
        if (params.date_from) {
          apiParams.from_date = params.date_from;
        }
        if (params.date_to) {
          apiParams.to_date = params.date_to;
        }

        const response = await client.getCustomerOrders(apiParams);
        const formattedResponse = formatCustomerOrdersResponse(
          response.data,
          response.pagination
        );

        logger.debug('get_customer_orders success', {
          count: response.data.length,
          total: response.pagination.total,
        });

        return {
          content: [
            {
              type: 'text',
              text: formattedResponse,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('get_customer_orders failed', { error: message });

        return {
          content: [
            {
              type: 'text',
              text: `Error fetching customer orders: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_manufacturing_orders
  // -------------------------------------------------------------------------
  server.tool(
    'get_manufacturing_orders',
    'Get manufacturing orders (MOs) showing production status. Filter by status, product, or date range. Shows what is being produced, quantities, and production schedule.',
    {
      status: GetManufacturingOrdersInputSchema.shape.status,
      product_id: GetManufacturingOrdersInputSchema.shape.product_id,
      date_from: GetManufacturingOrdersInputSchema.shape.date_from,
      date_to: GetManufacturingOrdersInputSchema.shape.date_to,
      page: GetManufacturingOrdersInputSchema.shape.page,
      per_page: GetManufacturingOrdersInputSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_manufacturing_orders called', { params });

      try {
        // Build API parameters
        const apiParams: Record<string, unknown> = {
          page: params.page ?? 1,
          per_page: params.per_page ?? 20,
        };

        if (params.status) {
          apiParams.status = params.status;
        }
        if (params.product_id) {
          apiParams.product_id = parseInt(params.product_id, 10);
        }
        if (params.date_from) {
          apiParams.from_date = params.date_from;
        }
        if (params.date_to) {
          apiParams.to_date = params.date_to;
        }

        const response = await client.getManufacturingOrders(apiParams);
        const formattedResponse = formatManufacturingOrdersResponse(
          response.data,
          response.pagination
        );

        logger.debug('get_manufacturing_orders success', {
          count: response.data.length,
          total: response.pagination.total,
        });

        return {
          content: [
            {
              type: 'text',
              text: formattedResponse,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('get_manufacturing_orders failed', { error: message });

        return {
          content: [
            {
              type: 'text',
              text: `Error fetching manufacturing orders: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Order tools registered: get_customer_orders, get_manufacturing_orders');
}
