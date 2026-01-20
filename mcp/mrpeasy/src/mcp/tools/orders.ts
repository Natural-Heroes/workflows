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
import type { CustomerOrder, ManufacturingOrder } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

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

  lines.push(`Order #${order.number ?? 'N/A'} (ID: ${order.id ?? 'Unknown'})`);
  lines.push(`Status: ${order.status ?? 'Unknown'}`);
  lines.push(`Customer: ${order.customer_name ?? 'Unknown'}`);
  lines.push(`Order Date: ${order.order_date ?? 'N/A'}`);
  lines.push(`Delivery Date: ${order.delivery_date ?? 'N/A'}`);

  if (order.items && order.items.length > 0) {
    lines.push('Items:');
    for (const item of order.items) {
      lines.push(`  - ${item.quantity ?? 0} x ${item.item_name ?? 'Unknown'}`);
    }
  }

  const total = order.total != null ? order.total.toFixed(2) : '0.00';
  const currency = order.currency ?? 'USD';
  lines.push(`Total: ${currency} ${total}`);

  return lines.join('\n');
}

/**
 * Parses Content-Range header to extract pagination info.
 * Format: "items 0-99/3633"
 */
function parseContentRange(contentRange?: string): { startIdx: number; endIdx: number; total: number } | null {
  if (!contentRange) return null;
  const match = contentRange.match(/items (\d+)-(\d+)\/(\d+)/);
  if (!match) return null;
  return {
    startIdx: parseInt(match[1], 10) + 1, // Convert 0-indexed to 1-indexed
    endIdx: parseInt(match[2], 10) + 1,
    total: parseInt(match[3], 10),
  };
}

/**
 * Formats customer orders response for LLM consumption.
 */
function formatCustomerOrdersResponse(
  orders: CustomerOrder[],
  contentRange?: string
): string {
  if (orders.length === 0) {
    return 'No customer orders found matching the specified criteria.';
  }

  const lines: string[] = [];
  const pagination = parseContentRange(contentRange);
  const startIdx = pagination?.startIdx ?? 1;
  const endIdx = pagination?.endIdx ?? orders.length;
  const total = pagination?.total ?? orders.length;

  lines.push(`Customer Orders (${startIdx}-${endIdx} of ${total}):`);
  lines.push('');

  for (const order of orders) {
    lines.push(formatCustomerOrder(order));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`Showing ${orders.length} of ${total} orders.`);

  return lines.join('\n');
}

/**
 * Formats a single manufacturing order for LLM-readable output.
 */
function formatManufacturingOrder(order: ManufacturingOrder): string {
  const lines: string[] = [];

  lines.push(`MO #${order.number ?? 'N/A'} (ID: ${order.id ?? 'Unknown'})`);
  lines.push(`Status: ${order.status ?? 'Unknown'}`);
  lines.push(`Product: ${order.product_name ?? 'Unknown'} (ID: ${order.product_id ?? 'N/A'})`);
  lines.push(`Quantity: ${order.quantity ?? 0}`);
  lines.push(`Start Date: ${order.start_date ?? 'N/A'}`);
  lines.push(`Due Date: ${order.finish_date ?? 'N/A'}`);

  // Calculate progress percentage with null safety
  const qty = order.quantity ?? 0;
  const produced = order.produced_quantity ?? 0;
  const percentage = qty > 0 ? Math.round((produced / qty) * 100) : 0;
  lines.push(`Progress: ${produced}/${qty} (${percentage}%)`);

  return lines.join('\n');
}

/**
 * Formats manufacturing orders response for LLM consumption.
 */
function formatManufacturingOrdersResponse(
  orders: ManufacturingOrder[],
  contentRange?: string
): string {
  if (orders.length === 0) {
    return 'No manufacturing orders found matching the specified criteria.';
  }

  const lines: string[] = [];
  const pagination = parseContentRange(contentRange);
  const startIdx = pagination?.startIdx ?? 1;
  const endIdx = pagination?.endIdx ?? orders.length;
  const total = pagination?.total ?? orders.length;

  lines.push(`Manufacturing Orders (${startIdx}-${endIdx} of ${total}):`);
  lines.push('');

  for (const order of orders) {
    lines.push(formatManufacturingOrder(order));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`Showing ${orders.length} of ${total} manufacturing orders.`);

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

        const orders = await client.getCustomerOrders(apiParams);
        const contentRange = (orders as { _contentRange?: string })._contentRange;
        const formattedResponse = formatCustomerOrdersResponse(orders, contentRange);

        logger.debug('get_customer_orders success', {
          count: orders.length,
          contentRange,
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
        return handleToolError(error, 'get_customer_orders');
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

        const orders = await client.getManufacturingOrders(apiParams);
        const contentRange = (orders as { _contentRange?: string })._contentRange;
        const formattedResponse = formatManufacturingOrdersResponse(orders, contentRange);

        logger.debug('get_manufacturing_orders success', {
          count: orders.length,
          contentRange,
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
        return handleToolError(error, 'get_manufacturing_orders');
      }
    }
  );

  logger.info('Order tools registered: get_customer_orders, get_manufacturing_orders');
}
