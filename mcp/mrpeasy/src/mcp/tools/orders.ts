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

/**
 * Input schema for get_customer_order_details tool.
 */
const GetCustomerOrderDetailsInputSchema = z.object({
  order_id: z.number().int().positive().optional().describe(
    'The internal customer order ID (cust_ord_id). Use this OR order_code, not both.'
  ),
  order_code: z.string().optional().describe(
    'The customer order code/number (e.g., "CO-01263"). Use this OR order_id, not both.'
  ),
});

/**
 * Input schema for get_manufacturing_order_details tool.
 */
const GetManufacturingOrderDetailsInputSchema = z.object({
  mo_id: z.number().int().positive().optional().describe(
    'The internal manufacturing order ID (man_ord_id). Use this OR mo_code, not both.'
  ),
  mo_code: z.string().optional().describe(
    'The manufacturing order code/number (e.g., "MO-39509" or "WO-09318"). Use this OR mo_id, not both.'
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
 * MRPeasy API field names discovered from /customer-orders endpoint:
 * cust_ord_id, code, reference, customer_id, customer_code, customer_name,
 * status, created, delivery_date, actual_delivery_date, total_price, currency, etc.
 */
function formatCustomerOrder(order: CustomerOrder): string {
  const lines: string[] = [];

  // MRPeasy API field mapping based on actual API response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  // Actual field names from MRPeasy API
  const orderId = raw.cust_ord_id ?? raw.id ?? 'Unknown';
  const orderNumber = raw.code ?? raw.number ?? 'N/A';
  const status = raw.status;
  const customerName = raw.customer_name ?? 'Unknown';
  const orderDate = raw.created;
  const deliveryDate = raw.delivery_date ?? raw.actual_delivery_date;
  const total = raw.total_price ?? 0;
  const currency = raw.currency ?? '€';

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

  orders.forEach((order) => {
    lines.push(formatCustomerOrder(order));
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  lines.push(`Showing ${orders.length} of ${total} orders.`);

  return lines.join('\n');
}

/**
 * Formats a single manufacturing order for LLM-readable output.
 * MRPeasy API field names discovered from /manufacturing-orders endpoint:
 * man_ord_id, code, article_id, product_id, item_code, item_title, unit, unit_id,
 * group_id, group_code, group_title, quantity, status, created, due_date,
 * start_date, finish_date, item_cost, total_cost, assigned_id, etc.
 */
function formatManufacturingOrder(order: ManufacturingOrder): string {
  const lines: string[] = [];

  // MRPeasy API field mapping based on actual API response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  // Actual field names from MRPeasy API
  const moId = raw.man_ord_id ?? raw.id ?? 'Unknown';
  const moNumber = raw.code ?? 'N/A';
  const status = raw.status;
  const productId = raw.article_id ?? raw.product_id ?? 'N/A';
  const productName = raw.item_title ?? 'Unknown';
  const productCode = raw.item_code;
  const quantity = raw.quantity ?? 0;
  const producedQty = raw.produced_quantity ?? raw.produced_qty ?? 0;
  const startDate = raw.start_date;
  const finishDate = raw.due_date ?? raw.finish_date;

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

  orders.forEach((order) => {
    lines.push(formatManufacturingOrder(order));
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  lines.push(`Showing ${orders.length} of ${total} manufacturing orders.`);

  return lines.join('\n');
}

// ============================================================================
// Detail Formatters
// ============================================================================

/**
 * Formats detailed customer order response for LLM consumption.
 * Includes header info and line items with quantities and prices.
 */
function formatCustomerOrderDetails(order: CustomerOrder): string {
  const lines: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  // Header info
  const orderId = raw.cust_ord_id ?? raw.id ?? 'Unknown';
  const orderNumber = raw.code ?? raw.number ?? 'N/A';
  const reference = raw.reference ?? '';
  const status = raw.status;
  const customerName = raw.customer_name ?? 'Unknown';
  const customerCode = raw.customer_code ?? '';
  const orderDate = raw.created;
  const deliveryDate = raw.delivery_date ?? raw.actual_delivery_date;
  const total = raw.total_price ?? 0;
  const currency = raw.currency ?? '€';
  const notes = raw.notes ?? raw.comment ?? '';

  lines.push('=== Customer Order Details ===');
  lines.push('');
  lines.push(`Order #${orderNumber} (ID: ${orderId})`);
  if (reference) lines.push(`Reference: ${reference}`);
  lines.push(`Status: ${formatCustomerOrderStatus(status)}`);
  lines.push('');
  lines.push('--- Customer ---');
  lines.push(`Name: ${customerName}`);
  if (customerCode) lines.push(`Code: ${customerCode}`);
  lines.push('');
  lines.push('--- Dates ---');
  lines.push(`Order Date: ${formatDate(orderDate)}`);
  lines.push(`Delivery Date: ${formatDate(deliveryDate)}`);
  lines.push('');

  // Line items
  const items = raw.items ?? raw.lines ?? raw.order_items ?? [];
  if (items.length > 0) {
    lines.push('--- Line Items ---');
    lines.push('');
    items.forEach((item: Record<string, unknown>, idx: number) => {
      const itemCode = item.item_code ?? item.code ?? item.item_number ?? 'N/A';
      const itemName = item.item_name ?? item.name ?? item.title ?? 'Unknown';
      const qty = item.quantity ?? item.qty ?? 0;
      const deliveredQty = item.delivered_quantity ?? item.delivered_qty ?? item.delivered ?? 0;
      const price = item.price ?? item.unit_price ?? 0;
      const lineTotal = item.total ?? item.line_total ?? (Number(qty) * Number(price));
      const unit = item.unit ?? 'pcs';

      lines.push(`${idx + 1}. ${itemName}`);
      lines.push(`   Code: ${itemCode}`);
      lines.push(`   Quantity: ${qty} ${unit}`);
      lines.push(`   Delivered: ${deliveredQty} ${unit}`);
      lines.push(`   Unit Price: ${currency} ${Number(price).toFixed(2)}`);
      lines.push(`   Line Total: ${currency} ${Number(lineTotal).toFixed(2)}`);
      lines.push('');
    });
  } else {
    lines.push('--- Line Items ---');
    lines.push('No line items found in this order.');
    lines.push('');
  }

  lines.push('--- Total ---');
  lines.push(`Order Total: ${currency} ${Number(total).toFixed(2)}`);

  if (notes) {
    lines.push('');
    lines.push('--- Notes ---');
    lines.push(notes);
  }

  return lines.join('\n');
}

/**
 * Formats detailed manufacturing order response for LLM consumption.
 * Includes header info, operations/routing, and BOM parts/materials.
 */
function formatManufacturingOrderDetails(order: ManufacturingOrder): string {
  const lines: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  // Header info
  const moId = raw.man_ord_id ?? raw.id ?? 'Unknown';
  const moNumber = raw.code ?? raw.number ?? 'N/A';
  const status = raw.status;
  const productId = raw.article_id ?? raw.product_id ?? 'N/A';
  const productName = raw.item_title ?? raw.product_name ?? 'Unknown';
  const productCode = raw.item_code ?? raw.product_number ?? '';
  const quantity = raw.quantity ?? 0;
  const producedQty = raw.produced_quantity ?? raw.produced_qty ?? 0;
  const startDate = raw.start_date;
  const dueDate = raw.due_date ?? raw.finish_date;
  const actualFinish = raw.actual_finish_date ?? raw.finished_date;
  const totalCost = raw.total_cost ?? 0;
  const itemCost = raw.item_cost ?? 0;
  const notes = raw.notes ?? raw.comment ?? '';
  const coNumber = raw.cust_ord_code ?? raw.customer_order_number ?? '';

  lines.push('=== Manufacturing Order Details ===');
  lines.push('');
  lines.push(`MO #${moNumber} (ID: ${moId})`);
  lines.push(`Status: ${formatManufacturingOrderStatus(status)}`);
  lines.push('');
  lines.push('--- Product ---');
  lines.push(`Name: ${productName}`);
  if (productCode) lines.push(`Code: ${productCode}`);
  lines.push(`Product ID: ${productId}`);
  lines.push('');
  lines.push('--- Quantities ---');
  lines.push(`Planned: ${quantity}`);
  lines.push(`Produced: ${producedQty}`);
  const remaining = Number(quantity) - Number(producedQty);
  lines.push(`Remaining: ${remaining}`);
  const progress = Number(quantity) > 0 ? Math.round((Number(producedQty) / Number(quantity)) * 100) : 0;
  lines.push(`Progress: ${progress}%`);
  lines.push('');
  lines.push('--- Schedule ---');
  lines.push(`Start Date: ${formatDate(startDate)}`);
  lines.push(`Due Date: ${formatDate(dueDate)}`);
  if (actualFinish) lines.push(`Actual Finish: ${formatDate(actualFinish)}`);
  if (coNumber) lines.push(`Customer Order: ${coNumber}`);
  lines.push('');

  // Operations/Routing
  const operations = raw.operations ?? raw.routing ?? raw.work_orders ?? [];
  if (operations.length > 0) {
    lines.push('--- Operations/Routing ---');
    lines.push('');
    operations.forEach((op: Record<string, unknown>, idx: number) => {
      const opNumber = op.operation_number ?? op.sequence ?? op.op_number ?? (idx + 1);
      const opName = op.operation_name ?? op.name ?? op.title ?? 'Operation';
      const workstation = op.workstation ?? op.work_center ?? op.machine ?? 'N/A';
      const setupTime = op.setup_time ?? op.setup_minutes ?? 0;
      const runTime = op.run_time ?? op.runtime ?? op.cycle_time ?? 0;
      const opStatus = op.status ?? 'Unknown';

      lines.push(`${opNumber}. ${opName}`);
      lines.push(`   Workstation: ${workstation}`);
      lines.push(`   Setup Time: ${setupTime} min`);
      lines.push(`   Run Time: ${runTime} min`);
      lines.push(`   Status: ${opStatus}`);
      lines.push('');
    });
  } else {
    lines.push('--- Operations/Routing ---');
    lines.push('No operations found for this MO.');
    lines.push('');
  }

  // BOM/Materials
  const materials = raw.materials ?? raw.bom ?? raw.parts ?? raw.components ?? [];
  if (materials.length > 0) {
    lines.push('--- BOM/Materials ---');
    lines.push('');
    materials.forEach((mat: Record<string, unknown>, idx: number) => {
      const matCode = mat.item_code ?? mat.code ?? mat.part_number ?? 'N/A';
      const matName = mat.item_name ?? mat.name ?? mat.title ?? 'Unknown';
      const reqQty = mat.required_quantity ?? mat.quantity ?? mat.qty ?? 0;
      const consumedQty = mat.consumed_quantity ?? mat.consumed ?? mat.used_qty ?? 0;
      const unit = mat.unit ?? mat.uom ?? 'pcs';

      lines.push(`${idx + 1}. ${matName}`);
      lines.push(`   Code: ${matCode}`);
      lines.push(`   Required: ${reqQty} ${unit}`);
      lines.push(`   Consumed: ${consumedQty} ${unit}`);
      const shortfall = Number(reqQty) - Number(consumedQty);
      if (shortfall > 0) {
        lines.push(`   Remaining: ${shortfall} ${unit}`);
      }
      lines.push('');
    });
  } else {
    lines.push('--- BOM/Materials ---');
    lines.push('No materials/BOM found for this MO.');
    lines.push('');
  }

  lines.push('--- Costs ---');
  lines.push(`Item Cost: ${Number(itemCost).toFixed(2)}`);
  lines.push(`Total Cost: ${Number(totalCost).toFixed(2)}`);

  if (notes) {
    lines.push('');
    lines.push('--- Notes ---');
    lines.push(notes);
  }

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

  // -------------------------------------------------------------------------
  // get_customer_order_details
  // -------------------------------------------------------------------------
  server.tool(
    'get_customer_order_details',
    'Get full details of a specific customer order. Can lookup by internal ID (order_id) or by code (order_code like "CO-01263"). Returns header info plus line items with products, quantities, prices.',
    {
      order_id: GetCustomerOrderDetailsInputSchema.shape.order_id,
      order_code: GetCustomerOrderDetailsInputSchema.shape.order_code,
    },
    async (params) => {
      logger.debug('get_customer_order_details called', { params });

      try {
        let resolvedId: number | undefined = params.order_id;

        // If order_code is provided, search for the CO to get its cust_ord_id
        if (params.order_code && !resolvedId) {
          const searchCode = params.order_code.toUpperCase().replace(/^CO-/, '');
          logger.debug('Searching for CO by code', { order_code: params.order_code, searchCode });

          // Search customer orders - paginate through up to 1000 orders to find the match
          const maxPages = 10;
          const perPage = 100;
          let foundOrder = null;

          for (let page = 1; page <= maxPages && !foundOrder; page++) {
            const orders = await client.getCustomerOrders({ per_page: perPage, page });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            foundOrder = orders.find((o: any) => {
              const orderCode = (o.code ?? '').toUpperCase();
              // Match exact code or just the numeric part
              return orderCode === params.order_code?.toUpperCase() ||
                     orderCode === `CO-${searchCode}` ||
                     orderCode.endsWith(searchCode);
            });

            if (foundOrder) break;

            // Check if we've reached the end of results
            const contentRange = (orders as { _contentRange?: string })._contentRange;
            if (contentRange) {
              const match = contentRange.match(/items \d+-(\d+)\/(\d+)/);
              if (match) {
                const endIdx = parseInt(match[1], 10);
                const total = parseInt(match[2], 10);
                if (endIdx >= total - 1) break; // No more pages
              }
            }
            if (orders.length < perPage) break; // Last page
          }

          if (foundOrder) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolvedId = (foundOrder as any).cust_ord_id ?? (foundOrder as any).id;
            logger.debug('Found CO by code', { code: params.order_code, resolvedId });
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `Customer order with code "${params.order_code}" not found in the first 1000 orders.\n\nTip: Try using get_customer_orders with date filters to find the order first, then use the cust_ord_id from the results.`,
                },
              ],
            };
          }
        }

        if (!resolvedId) {
          return {
            content: [
              {
                type: 'text',
                text: 'Please provide either order_id (internal ID) or order_code (e.g., "CO-01263").',
              },
            ],
          };
        }

        const order = await client.getCustomerOrder(resolvedId);
        const formattedResponse = formatCustomerOrderDetails(order);

        logger.debug('get_customer_order_details success', {
          orderId: resolvedId,
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
        return handleToolError(error, 'get_customer_order_details');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_manufacturing_order_details
  // -------------------------------------------------------------------------
  server.tool(
    'get_manufacturing_order_details',
    'Get full details of a specific manufacturing order (MO). Can lookup by internal ID (mo_id) or by code (mo_code like "MO-39509"). Returns header info, operations/routing, and BOM parts/materials.',
    {
      mo_id: GetManufacturingOrderDetailsInputSchema.shape.mo_id,
      mo_code: GetManufacturingOrderDetailsInputSchema.shape.mo_code,
    },
    async (params) => {
      logger.debug('get_manufacturing_order_details called', { params });

      try {
        let resolvedId: number | undefined = params.mo_id;

        // If mo_code is provided, search for the MO to get its man_ord_id
        if (params.mo_code && !resolvedId) {
          const codeUpper = params.mo_code.toUpperCase();
          const numericPart = codeUpper.replace(/^(MO-|WO-)/, '');
          const codeNumber = parseInt(numericPart, 10);
          logger.debug('Searching for MO by code', { mo_code: params.mo_code, codeNumber });

          // First get a small batch to find total count
          const calibrationBatch = await client.getManufacturingOrdersWithRange(0, 10);
          const contentRangeHeader = (calibrationBatch as { _contentRange?: string })._contentRange;
          let totalOrders = 0;

          if (contentRangeHeader) {
            const rangeMatch = contentRangeHeader.match(/items \d+-\d+\/(\d+)/);
            if (rangeMatch) {
              totalOrders = parseInt(rangeMatch[1], 10);
            }
          }

          logger.debug('Total MO count', { totalOrders });

          // Search strategy using Range headers (MRPeasy ignores page param)
          // MRPeasy sorts by code DESCENDING: high codes (39509) first, low codes (00036) last
          // So for high code numbers, search from the BEGINNING (where high codes are)
          let foundOrder = null;
          const batchSize = 100;
          const maxSearches = 15; // Search up to 1500 orders

          for (let i = 0; i < maxSearches && !foundOrder; i++) {
            // Always search from the beginning since high codes are at offset 0
            const offset = i * batchSize;

            if (offset >= totalOrders) break;

            const orders = await client.getManufacturingOrdersWithRange(offset, batchSize);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            foundOrder = orders.find((o: any) => {
              const orderCode = (o.code ?? '').toUpperCase();
              // Match exact code or variations
              return orderCode === codeUpper ||
                     orderCode === `WO-${numericPart}` ||
                     orderCode === `MO-${numericPart}` ||
                     orderCode.endsWith(numericPart);
            });

            if (foundOrder) break;
            if (orders.length < batchSize) break; // No more data
          }

          if (foundOrder) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolvedId = (foundOrder as any).man_ord_id ?? (foundOrder as any).id;
            logger.debug('Found MO by code', { code: params.mo_code, resolvedId });
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `Manufacturing order with code "${params.mo_code}" not found.\n\nTip: Try using get_manufacturing_orders to browse orders, or use the internal man_ord_id directly if you know it.`,
                },
              ],
            };
          }
        }

        if (!resolvedId) {
          return {
            content: [
              {
                type: 'text',
                text: 'Please provide either mo_id (internal ID) or mo_code (e.g., "MO-39509").',
              },
            ],
          };
        }

        const order = await client.getManufacturingOrder(resolvedId);
        const formattedResponse = formatManufacturingOrderDetails(order);

        logger.debug('get_manufacturing_order_details success', {
          moId: resolvedId,
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
        return handleToolError(error, 'get_manufacturing_order_details');
      }
    }
  );

  logger.info('Order tools registered: get_customer_orders, get_manufacturing_orders, get_customer_order_details, get_manufacturing_order_details');
}
