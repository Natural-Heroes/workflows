/**
 * MCP Tools for Purchase Orders.
 *
 * Purchase orders are read-only in the MRPeasy API (POST/PUT explicitly disabled).
 * - get_purchase_orders: List POs with filters
 * - get_purchase_order_details: Get single PO with products, invoices, bills
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { PurchaseOrder } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const GetPurchaseOrdersSchema = z.object({
  code: z.string().optional().describe('Filter by PO code (e.g., "PO-00123")'),
  vendor_id: z.number().int().positive().optional().describe('Filter by vendor/supplier ID'),
  status: z.number().int().optional().describe('Filter by status code'),
  date_from: z.string().optional().describe('Filter by creation date from (ISO format: YYYY-MM-DD, converted to Unix timestamp)'),
  date_to: z.string().optional().describe('Filter by creation date to (ISO format: YYYY-MM-DD, converted to Unix timestamp)'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  per_page: z.number().int().positive().max(100).default(20).describe('Results per page (default: 20, max: 100)'),
});

const GetPurchaseOrderDetailsSchema = z.object({
  po_id: z.number().int().positive().optional().describe('Purchase order ID. Use this OR po_code, not both.'),
  po_code: z.string().optional().describe('Purchase order code (e.g., "PO-00123"). Use this OR po_id, not both.'),
});

// ============================================================================
// Utility Functions
// ============================================================================

function formatDate(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'number') {
    const ms = value > 9999999999 ? value : value * 1000;
    const date = new Date(ms);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    if (value === '' || value === '0') return 'N/A';
    const numVal = Number(value);
    if (!isNaN(numVal) && numVal > 0) {
      const ms = numVal > 9999999999 ? numVal : numVal * 1000;
      const date = new Date(ms);
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    return value;
  }
  return 'N/A';
}

function formatPurchaseOrderStatus(status: unknown): string {
  if (status === null || status === undefined) return 'Unknown';
  const statusMap: Record<number, string> = {
    10: 'Draft',
    20: 'Confirmed',
    30: 'Received',
    40: 'Closed',
    50: 'Cancelled',
  };
  const numStatus = typeof status === 'number' ? status : parseInt(String(status), 10);
  return statusMap[numStatus] ?? String(status);
}

function parseContentRange(contentRange?: string): { startIdx: number; endIdx: number; total: number } | null {
  if (!contentRange) return null;
  const match = contentRange.match(/items (\d+)-(\d+)\/(\d+)/);
  if (!match) return null;
  return {
    startIdx: parseInt(match[1], 10) + 1,
    endIdx: parseInt(match[2], 10) + 1,
    total: parseInt(match[3], 10),
  };
}

function buildPurchaseOrderObject(po: PurchaseOrder): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = po as any;
  return {
    id: raw.id ?? raw.purchase_order_id,
    code: raw.code ?? null,
    status: formatPurchaseOrderStatus(raw.status),
    statusCode: raw.status,
    vendor: {
      id: raw.vendor_id ?? null,
      name: raw.vendor_name ?? null,
    },
    orderDate: formatDate(raw.order_date ?? raw.created),
    expectedDate: formatDate(raw.expected_date),
    total: Number(raw.total_price ?? 0),
    currency: raw.currency ?? 'EUR',
    productCount: raw.products?.length ?? 0,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerPurchaseOrderTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering purchase order tools');

  // -------------------------------------------------------------------------
  // get_purchase_orders
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_purchase_orders',
    'List purchase orders (POs) with optional filtering by code, vendor, status, or date range. POs are read-only.',
    {
      code: GetPurchaseOrdersSchema.shape.code,
      vendor_id: GetPurchaseOrdersSchema.shape.vendor_id,
      status: GetPurchaseOrdersSchema.shape.status,
      date_from: GetPurchaseOrdersSchema.shape.date_from,
      date_to: GetPurchaseOrdersSchema.shape.date_to,
      page: GetPurchaseOrdersSchema.shape.page,
      per_page: GetPurchaseOrdersSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_purchase_orders called', { params });

      try {
        const apiParams: Record<string, unknown> = {};
        if (params.code) apiParams.code = params.code;
        if (params.vendor_id) apiParams.vendor_id = params.vendor_id;
        if (params.status) apiParams.status = params.status;
        if (params.date_from) {
          apiParams.created_min = Math.floor(new Date(params.date_from).getTime() / 1000);
        }
        if (params.date_to) {
          apiParams.created_max = Math.floor(new Date(params.date_to).getTime() / 1000);
        }

        const orders = await client.getPurchaseOrders(apiParams);
        const contentRange = (orders as { _contentRange?: string })._contentRange;
        const pagination = parseContentRange(contentRange);
        const total = pagination?.total ?? orders.length;

        // Build summary
        const statusCounts: Record<string, number> = {};
        let totalValue = 0;
        orders.forEach((o) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = o as any;
          const status = formatPurchaseOrderStatus(raw.status);
          statusCounts[status] = (statusCounts[status] ?? 0) + 1;
          totalValue += Number(raw.total_price ?? 0);
        });

        const statusSummary = Object.entries(statusCounts)
          .map(([s, c]) => `${c} ${s.toLowerCase()}`)
          .join(', ');

        const response = {
          summary: orders.length === 0
            ? 'No purchase orders found matching the criteria.'
            : `${orders.length} of ${total} purchase orders: ${statusSummary}. Total value: €${totalValue.toFixed(2)}`,
          pagination: {
            showing: orders.length,
            total,
          },
          orders: orders.map(buildPurchaseOrderObject),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_get_purchase_orders');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_purchase_order_details
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_purchase_order_details',
    'Get full details of a specific purchase order by ID or code. Returns header info, products/line items, invoices, and payment info.',
    {
      po_id: GetPurchaseOrderDetailsSchema.shape.po_id,
      po_code: GetPurchaseOrderDetailsSchema.shape.po_code,
    },
    async (params) => {
      logger.debug('get_purchase_order_details called', { params });

      try {
        let resolvedId: number | undefined = params.po_id;

        // If po_code is provided, use the API's code filter to find the PO
        if (params.po_code && !resolvedId) {
          const orders = await client.getPurchaseOrders({ code: params.po_code });
          if (orders.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const found = orders[0] as any;
            resolvedId = found.id ?? found.purchase_order_id;
          } else {
            return {
              content: [{
                type: 'text',
                text: `Purchase order with code "${params.po_code}" not found.\n\nTip: Try using get_purchase_orders to browse POs.`,
              }],
            };
          }
        }

        if (!resolvedId) {
          return {
            content: [{
              type: 'text',
              text: 'Please provide either po_id (internal ID) or po_code (e.g., "PO-00123").',
            }],
          };
        }

        const po = await client.getPurchaseOrder(resolvedId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = po as any;

        const products = (raw.products ?? []).map((p: Record<string, unknown>) => ({
          articleId: p.article_id,
          code: p.item_code ?? null,
          name: p.item_title ?? null,
          quantity: Number(p.quantity ?? 0),
          received: Number(p.received_quantity ?? 0),
          unitPrice: Number(p.unit_price ?? 0),
          lineTotal: Number(p.total_price ?? 0),
          unit: p.unit ?? 'pcs',
        }));

        const invoices = (raw.invoices ?? []).map((inv: Record<string, unknown>) => ({
          id: inv.id,
          number: inv.number ?? null,
          date: formatDate(inv.date),
          total: Number(inv.total ?? 0),
          status: inv.status ?? null,
        }));

        const totalQty = products.reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.quantity), 0);
        const totalReceived = products.reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.received), 0);

        const response = {
          summary: `${raw.code ?? 'PO'}: ${products.length} items, ${formatPurchaseOrderStatus(raw.status)}. ${totalReceived}/${totalQty} received. ${invoices.length} invoices.`,
          order: {
            id: raw.id ?? raw.purchase_order_id,
            code: raw.code ?? null,
            status: formatPurchaseOrderStatus(raw.status),
            statusCode: raw.status,
            vendor: {
              id: raw.vendor_id ?? null,
              name: raw.vendor_name ?? null,
            },
            orderDate: formatDate(raw.order_date ?? raw.created),
            expectedDate: formatDate(raw.expected_date),
            total: Number(raw.total_price ?? 0),
            currency: raw.currency ?? 'EUR',
            notes: raw.notes ?? null,
          },
          products,
          invoices,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_get_purchase_order_details');
      }
    }
  );

  logger.info('Purchase order tools registered: get_purchase_orders, get_purchase_order_details');
}
