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
// Utility Functions
// ============================================================================

/**
 * Formats a Unix timestamp or ISO date string to human-readable format.
 * Handles both Unix timestamps (seconds) and ISO date strings.
 */
function formatDate(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';

  // If it's a number, treat as Unix timestamp
  if (typeof value === 'number') {
    // Distinguish between seconds and milliseconds
    // Unix timestamps in seconds are ~10 digits, in ms ~13 digits
    const ms = value > 9999999999 ? value : value * 1000;
    const date = new Date(ms);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // If it's a string, try to parse it
  if (typeof value === 'string') {
    if (value === '' || value === '0') return 'N/A';
    // Try parsing as ISO string or number string
    const numVal = Number(value);
    if (!isNaN(numVal) && numVal > 0) {
      const ms = numVal > 9999999999 ? numVal : numVal * 1000;
      const date = new Date(ms);
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
    // Try as ISO date string
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    return value; // Return as-is if can't parse
  }

  return 'N/A';
}

/**
 * Maps numeric status code to readable string for customer orders.
 * MRPeasy uses numeric codes: 10=Draft, 20=Pending, 30=Confirmed, etc.
 */
function formatCustomerOrderStatus(status: unknown): string {
  if (status === null || status === undefined) return 'Unknown';

  const statusMap: Record<number, string> = {
    10: 'Draft',
    20: 'Pending',
    30: 'Confirmed',
    40: 'In Production',
    50: 'Ready',
    60: 'Shipped',
    70: 'Completed',
    80: 'Cancelled',
    90: 'On Hold',
  };

  const numStatus = typeof status === 'number' ? status : parseInt(String(status), 10);
  return statusMap[numStatus] ?? String(status);
}

/**
 * Maps numeric status code to readable string for manufacturing orders.
 */
function formatManufacturingOrderStatus(status: unknown): string {
  if (status === null || status === undefined) return 'Unknown';

  const statusMap: Record<number, string> = {
    10: 'Draft',
    20: 'Pending',
    30: 'Scheduled',
    40: 'In Progress',
    50: 'Completed',
    60: 'Cancelled',
    70: 'On Hold',
  };

  const numStatus = typeof status === 'number' ? status : parseInt(String(status), 10);
  return statusMap[numStatus] ?? String(status);
}

// ============================================================================
// Response Formatters
// ============================================================================

/**
 * Formats a single customer order for LLM-readable output.
 * MRPeasy API uses different field names than our types expect.
 */
function formatCustomerOrder(order: CustomerOrder): string {
  const lines: string[] = [];

  // MRPeasy API field mapping - try multiple possible field names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  const orderId = raw.co_id ?? raw.id ?? raw.order_id ?? 'Unknown';
  const orderNumber = raw.co_number ?? raw.number ?? raw.order_number ?? 'N/A';
  const status = raw.co_status ?? raw.status;
  const customerName = raw.customer_name ?? raw.partner_name ?? 'Unknown';
  const orderDate = raw.order_date ?? raw.co_date ?? raw.date ?? raw.created;
  const deliveryDate = raw.delivery_date ?? raw.due_date ?? raw.ship_date;
  const total = raw.total ?? raw.grand_total ?? raw.amount ?? 0;
  const currency = raw.currency ?? raw.currency_code ?? '€';

  lines.push(`Order #${orderNumber} (ID: ${orderId})`);
  lines.push(`Status: ${formatCustomerOrderStatus(status)}`);
  lines.push(`Customer: ${customerName}`);
  lines.push(`Order Date: ${formatDate(orderDate)}`);
  lines.push(`Delivery Date: ${formatDate(deliveryDate)}`);

  if (order.items && order.items.length > 0) {
    lines.push('Items:');
    for (const item of order.items) {
      lines.push(`  - ${item.quantity ?? 0} x ${item.item_name ?? 'Unknown'}`);
    }
  }

  const totalFormatted = typeof total === 'number' ? total.toFixed(2) : '0.00';
  lines.push(`Total: ${currency} ${totalFormatted}`);

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
 * MRPeasy API uses different field names than our types expect.
 */
function formatManufacturingOrder(order: ManufacturingOrder): string {
  const lines: string[] = [];

  // MRPeasy API field mapping - try multiple possible field names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  const moId = raw.mo_id ?? raw.id ?? raw.order_id ?? 'Unknown';
  const moNumber = raw.mo_number ?? raw.number ?? raw.order_number ?? 'N/A';
  const status = raw.mo_status ?? raw.status;
  const productId = raw.product_id ?? raw.article_id ?? raw.item_id ?? 'N/A';
  const productName = raw.product_name ?? raw.article_name ?? raw.item_name ?? raw.product_title ?? raw.name ?? 'Unknown';
  const productCode = raw.product_code ?? raw.article_code ?? raw.item_code ?? raw.code;
  const quantity = raw.quantity ?? raw.qty ?? 0;
  const producedQty = raw.produced_quantity ?? raw.produced_qty ?? raw.completed ?? 0;
  const startDate = raw.start_date ?? raw.start ?? raw.scheduled_start;
  const finishDate = raw.finish_date ?? raw.end_date ?? raw.due_date ?? raw.deadline;

  lines.push(`MO #${moNumber} (ID: ${moId})`);
  lines.push(`Status: ${formatManufacturingOrderStatus(status)}`);

  // Show product name with code if available
  const productDisplay = productCode
    ? `${productName} [${productCode}]`
    : productName;
  lines.push(`Product: ${productDisplay} (ID: ${productId})`);

  lines.push(`Quantity: ${quantity}`);
  lines.push(`Start Date: ${formatDate(startDate)}`);
  lines.push(`Due Date: ${formatDate(finishDate)}`);

  // Calculate progress percentage with null safety
  const qty = typeof quantity === 'number' ? quantity : 0;
  const produced = typeof producedQty === 'number' ? producedQty : 0;
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
