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
 * Builds a customer order object for JSON output.
 */
function buildCustomerOrderObject(order: CustomerOrder): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  return {
    id: raw.cust_ord_id ?? raw.id,
    code: raw.code ?? raw.number,
    status: formatCustomerOrderStatus(raw.status),
    statusCode: raw.status,
    customer: {
      id: raw.customer_id,
      code: raw.customer_code,
      name: raw.customer_name ?? 'Unknown',
    },
    reference: raw.reference || null,
    created: formatDate(raw.created),
    deliveryDate: raw.delivery_date ? formatDate(raw.delivery_date) : null,
    actualDeliveryDate: raw.actual_delivery_date ? formatDate(raw.actual_delivery_date) : null,
    total: Number(raw.total_price ?? 0),
    currency: raw.currency ?? 'EUR',
  };
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
 * Formats customer orders response as hybrid JSON for LLM consumption.
 */
function formatCustomerOrdersResponse(
  orders: CustomerOrder[],
  contentRange?: string
): string {
  const pagination = parseContentRange(contentRange);
  const total = pagination?.total ?? orders.length;

  if (orders.length === 0) {
    return JSON.stringify({
      summary: 'No customer orders found matching the criteria.',
      pagination: { showing: 0, total: 0 },
      orders: [],
    });
  }

  // Build summary with key stats
  const statusCounts: Record<string, number> = {};
  let totalValue = 0;
  orders.forEach((o) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = o as any;
    const status = formatCustomerOrderStatus(raw.status);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    totalValue += Number(raw.total_price ?? 0);
  });

  const statusSummary = Object.entries(statusCounts)
    .map(([s, c]) => `${c} ${s.toLowerCase()}`)
    .join(', ');

  const response = {
    summary: `${orders.length} of ${total} customer orders: ${statusSummary}. Total value: €${totalValue.toFixed(2)}`,
    pagination: {
      showing: orders.length,
      total,
      startIdx: pagination?.startIdx ?? 1,
      endIdx: pagination?.endIdx ?? orders.length,
    },
    orders: orders.map(buildCustomerOrderObject),
  };

  return JSON.stringify(response);
}

/**
 * Builds a manufacturing order object for JSON output.
 */
function buildManufacturingOrderObject(order: ManufacturingOrder): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  const quantity = Number(raw.quantity ?? 0);
  const produced = Number(raw.produced_quantity ?? raw.produced_qty ?? 0);
  const progress = quantity > 0 ? Math.round((produced / quantity) * 100) : 0;

  return {
    id: raw.man_ord_id ?? raw.id,
    code: raw.code,
    status: formatManufacturingOrderStatus(raw.status),
    statusCode: raw.status,
    product: {
      id: raw.article_id ?? raw.product_id,
      code: raw.item_code,
      name: raw.item_title ?? 'Unknown',
    },
    quantity: {
      planned: quantity,
      produced,
      remaining: quantity - produced,
      progress,
    },
    startDate: formatDate(raw.start_date),
    dueDate: formatDate(raw.due_date ?? raw.finish_date),
    customerOrder: raw.cust_ord_code || null,
    totalCost: Number(raw.total_cost ?? 0),
  };
}

/**
 * Formats manufacturing orders response as hybrid JSON for LLM consumption.
 */
function formatManufacturingOrdersResponse(
  orders: ManufacturingOrder[],
  contentRange?: string
): string {
  const pagination = parseContentRange(contentRange);
  const total = pagination?.total ?? orders.length;

  if (orders.length === 0) {
    return JSON.stringify({
      summary: 'No manufacturing orders found matching the criteria.',
      pagination: { showing: 0, total: 0 },
      orders: [],
    });
  }

  // Build summary with key stats
  const statusCounts: Record<string, number> = {};
  let totalPlanned = 0;
  let totalProduced = 0;
  orders.forEach((o) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = o as any;
    const status = formatManufacturingOrderStatus(raw.status);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    totalPlanned += Number(raw.quantity ?? 0);
    totalProduced += Number(raw.produced_quantity ?? raw.produced_qty ?? 0);
  });

  const statusSummary = Object.entries(statusCounts)
    .map(([s, c]) => `${c} ${s.toLowerCase()}`)
    .join(', ');

  const overallProgress = totalPlanned > 0 ? Math.round((totalProduced / totalPlanned) * 100) : 0;

  const response = {
    summary: `${orders.length} of ${total} manufacturing orders: ${statusSummary}. Overall progress: ${overallProgress}%`,
    pagination: {
      showing: orders.length,
      total,
      startIdx: pagination?.startIdx ?? 1,
      endIdx: pagination?.endIdx ?? orders.length,
    },
    orders: orders.map(buildManufacturingOrderObject),
  };

  return JSON.stringify(response);
}

// ============================================================================
// Detail Formatters
// ============================================================================

/**
 * Formats detailed customer order response as hybrid JSON for LLM consumption.
 * Includes header info and line items with quantities and prices.
 */
function formatCustomerOrderDetails(order: CustomerOrder): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  const orderCode = raw.code ?? raw.number ?? 'N/A';
  const status = formatCustomerOrderStatus(raw.status);
  const customerName = raw.customer_name ?? 'Unknown';
  const total = Number(raw.total_price ?? 0);
  const currency = raw.currency ?? 'EUR';

  // Line items - MRPeasy returns these as "products"
  const rawItems = raw.products ?? raw.items ?? raw.lines ?? raw.order_items ?? [];

  // Build line items array
  const items = rawItems.map((item: Record<string, unknown>) => {
    const sourceArray = item.source as Array<Record<string, unknown>> | undefined;
    const moSources = sourceArray?.map(s => s.manufacturing_order_code).filter(Boolean) ?? [];

    return {
      code: item.item_code ?? item.code ?? item.item_number,
      name: item.item_title ?? item.item_name ?? item.name ?? item.title ?? 'Unknown',
      status: item.part_status_txt ?? item.status_txt ?? null,
      source: moSources.length > 0 ? moSources : null,
      quantity: Number(item.quantity ?? item.qty ?? 0),
      shipped: Number(item.shipped ?? item.delivered_quantity ?? 0),
      unit: item.unit ?? 'pcs',
      unitPrice: Number(item.item_price ?? item.item_price_cur ?? item.price ?? 0),
      lineTotal: Number(item.total_price ?? item.total_price_cur ?? item.total ?? 0),
    };
  });

  // Build summary
  const totalQty = items.reduce((sum: number, i: Record<string, unknown>) => sum + Number(i.quantity), 0);
  const totalShipped = items.reduce((sum: number, i: Record<string, unknown>) => sum + Number(i.shipped), 0);
  const statusCounts: Record<string, number> = {};
  items.forEach((i: Record<string, unknown>) => {
    const s = String(i.status ?? 'Unknown');
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });
  const statusSummary = Object.entries(statusCounts)
    .map(([s, c]) => `${c} ${s.toLowerCase()}`)
    .join(', ');

  const response = {
    summary: `${orderCode}: ${items.length} items, ${currency} ${total.toFixed(2)}, ${status}. ${totalShipped}/${totalQty} shipped. ${statusSummary}`,
    order: {
      id: raw.cust_ord_id ?? raw.id,
      code: orderCode,
      reference: raw.reference || null,
      status,
      statusCode: raw.status,
      customer: {
        id: raw.customer_id,
        code: raw.customer_code,
        name: customerName,
      },
      created: formatDate(raw.created),
      deliveryDate: raw.delivery_date ? formatDate(raw.delivery_date) : null,
      actualDeliveryDate: raw.actual_delivery_date ? formatDate(raw.actual_delivery_date) : null,
      total,
      currency,
      notes: raw.notes ?? raw.comment ?? null,
    },
    items,
  };

  return JSON.stringify(response);
}

/**
 * Formats detailed manufacturing order response as hybrid JSON for LLM consumption.
 * Includes header info, operations/routing, and BOM parts/materials.
 */
function formatManufacturingOrderDetails(order: ManufacturingOrder): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = order as any;

  const moCode = raw.code ?? raw.number ?? 'N/A';
  const status = formatManufacturingOrderStatus(raw.status);
  const productName = raw.item_title ?? raw.product_name ?? 'Unknown';
  const quantity = Number(raw.quantity ?? 0);
  const produced = Number(raw.produced_quantity ?? raw.produced_qty ?? 0);
  const progress = quantity > 0 ? Math.round((produced / quantity) * 100) : 0;

  // Operations
  const rawOperations = raw.operations ?? raw.routing ?? raw.work_orders ?? [];
  const operations = rawOperations.map((op: Record<string, unknown>, idx: number) => ({
    number: op.operation_number ?? op.sequence ?? op.op_number ?? (idx + 1),
    name: op.operation_name ?? op.name ?? op.title ?? 'Operation',
    workstation: op.workstation ?? op.work_center ?? op.machine ?? null,
    setupTime: Number(op.setup_time ?? op.setup_minutes ?? 0),
    runTime: Number(op.run_time ?? op.runtime ?? op.cycle_time ?? 0),
    status: op.status ?? null,
  }));

  // Materials/BOM
  const rawMaterials = raw.materials ?? raw.bom ?? raw.parts ?? raw.components ?? [];
  const materials = rawMaterials.map((mat: Record<string, unknown>) => ({
    code: mat.item_code ?? mat.code ?? mat.part_number,
    name: mat.item_name ?? mat.name ?? mat.title ?? 'Unknown',
    required: Number(mat.required_quantity ?? mat.quantity ?? mat.qty ?? 0),
    consumed: Number(mat.consumed_quantity ?? mat.consumed ?? mat.used_qty ?? 0),
    unit: mat.unit ?? mat.uom ?? 'pcs',
  }));

  // Build summary
  const coNumber = raw.cust_ord_code ?? raw.customer_order_number ?? null;
  const summaryParts = [
    `${moCode}: ${productName}, ${status}`,
    `${produced}/${quantity} (${progress}%)`,
  ];
  if (coNumber) summaryParts.push(`for ${coNumber}`);
  if (operations.length > 0) summaryParts.push(`${operations.length} ops`);
  if (materials.length > 0) summaryParts.push(`${materials.length} materials`);

  const response = {
    summary: summaryParts.join('. '),
    order: {
      id: raw.man_ord_id ?? raw.id,
      code: moCode,
      status,
      statusCode: raw.status,
      product: {
        id: raw.article_id ?? raw.product_id,
        code: raw.item_code ?? raw.product_number,
        name: productName,
      },
      quantity: {
        planned: quantity,
        produced,
        remaining: quantity - produced,
        progress,
      },
      schedule: {
        startDate: formatDate(raw.start_date),
        dueDate: formatDate(raw.due_date ?? raw.finish_date),
        actualFinish: raw.actual_finish_date ? formatDate(raw.actual_finish_date) : null,
      },
      customerOrder: coNumber,
      costs: {
        itemCost: Number(raw.item_cost ?? 0),
        totalCost: Number(raw.total_cost ?? 0),
      },
      notes: raw.notes ?? raw.comment ?? null,
    },
    operations,
    materials,
  };

  return JSON.stringify(response);
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

        // If order_code is provided, use the API's code filter to find the CO
        if (params.order_code && !resolvedId) {
          logger.debug('Searching for CO by code filter', { order_code: params.order_code });

          // MRPeasy API supports direct filtering by code - single API call
          const orders = await client.getCustomerOrders({ code: params.order_code });

          if (orders.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const foundOrder = orders[0] as any;
            resolvedId = foundOrder.cust_ord_id ?? foundOrder.id;
            logger.debug('Found CO by code filter', { code: params.order_code, resolvedId });
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `Customer order with code "${params.order_code}" not found.\n\nTip: Try using get_customer_orders to browse orders, or use the internal cust_ord_id directly if you know it.`,
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

        // If mo_code is provided, use the API's code filter to find the MO
        if (params.mo_code && !resolvedId) {
          logger.debug('Searching for MO by code filter', { mo_code: params.mo_code });

          // MRPeasy API supports direct filtering by code - single API call
          const orders = await client.getManufacturingOrders({ code: params.mo_code });

          if (orders.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const foundOrder = orders[0] as any;
            resolvedId = foundOrder.man_ord_id ?? foundOrder.id;
            logger.debug('Found MO by code filter', { code: params.mo_code, resolvedId });
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
