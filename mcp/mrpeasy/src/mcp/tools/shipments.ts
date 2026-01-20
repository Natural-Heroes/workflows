/**
 * MCP Tools for Shipments.
 *
 * Provides tools for querying shipment data from MRPeasy:
 * - get_shipments: Fetch shipments with filtering (by CO, status, etc.)
 * - get_shipment_details: Fetch a single shipment by ID or code
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { Shipment } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Input schema for get_shipments tool.
 */
const GetShipmentsInputSchema = z.object({
  customer_order_id: z.number().int().positive().optional().describe(
    'Filter by customer order ID (cust_ord_id). Get shipments for a specific CO.'
  ),
  status: z.enum(['new', 'ready', 'shipped', 'cancelled']).optional().describe(
    'Filter by shipment status: new, ready, shipped, or cancelled'
  ),
  tracking_number: z.string().optional().describe(
    'Filter by carrier tracking number'
  ),
  page: z.number().int().positive().default(1).describe(
    'Page number (default: 1)'
  ),
  per_page: z.number().int().positive().max(100).default(20).describe(
    'Number of results per page (default: 20, max: 100)'
  ),
});

/**
 * Input schema for get_shipment_details tool.
 */
const GetShipmentDetailsInputSchema = z.object({
  shipment_id: z.number().int().positive().optional().describe(
    'The internal shipment ID. Use this OR shipment_code, not both.'
  ),
  shipment_code: z.string().optional().describe(
    'The shipment code (e.g., "SH-00123"). Use this OR shipment_id, not both.'
  ),
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats a Unix timestamp to human-readable format.
 */
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

/**
 * Maps numeric status code to readable string for shipments.
 */
function formatShipmentStatus(status: unknown): string {
  if (status === null || status === undefined) return 'Unknown';

  const statusMap: Record<number, string> = {
    10: 'New',
    15: 'Ready for shipment',
    20: 'Shipped',
    30: 'Cancelled',
  };

  const numStatus = typeof status === 'number' ? status : parseInt(String(status), 10);
  return statusMap[numStatus] ?? String(status);
}

/**
 * Maps status string to numeric code.
 */
function statusToCode(status: string): number {
  const map: Record<string, number> = {
    new: 10,
    ready: 15,
    shipped: 20,
    cancelled: 30,
  };
  return map[status.toLowerCase()] ?? 10;
}

/**
 * Parses Content-Range header to extract pagination info.
 */
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

// ============================================================================
// Response Formatters
// ============================================================================

/**
 * Builds a shipment object for JSON output.
 */
function buildShipmentObject(shipment: Shipment): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = shipment as any;

  // Build products array
  const rawProducts = raw.products ?? raw.items ?? [];
  const products = rawProducts.map((p: Record<string, unknown>) => ({
    code: p.item_code ?? p.code,
    name: p.item_title ?? p.item_name ?? p.name ?? 'Unknown',
    quantity: Number(p.quantity ?? p.qty ?? 0),
    unit: p.unit ?? 'pcs',
  }));

  return {
    id: raw.shipment_id ?? raw.id,
    code: raw.code,
    status: formatShipmentStatus(raw.status),
    statusCode: raw.status,
    trackingNumber: raw.tracking_number || null,
    created: formatDate(raw.created),
    deliveryDate: raw.delivery_date ? formatDate(raw.delivery_date) : null,
    customerOrder: {
      id: raw.customer_order_id || null,
      code: raw.customer_order_code || raw.cust_ord_code || null,
    },
    shippingAddress: raw.shipping_address || null,
    packingNotes: raw.packing_notes || null,
    products,
  };
}

/**
 * Formats shipments response as hybrid JSON.
 */
function formatShipmentsResponse(
  shipments: Shipment[],
  contentRange?: string
): string {
  const pagination = parseContentRange(contentRange);
  const total = pagination?.total ?? shipments.length;

  if (shipments.length === 0) {
    return JSON.stringify({
      summary: 'No shipments found matching the criteria.',
      pagination: { showing: 0, total: 0 },
      shipments: [],
    });
  }

  // Build summary stats
  const statusCounts: Record<string, number> = {};
  let totalProducts = 0;
  shipments.forEach((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = s as any;
    const status = formatShipmentStatus(raw.status);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    const products = raw.products ?? raw.items ?? [];
    totalProducts += products.length;
  });

  const statusSummary = Object.entries(statusCounts)
    .map(([s, c]) => `${c} ${s.toLowerCase()}`)
    .join(', ');

  const response = {
    summary: `${shipments.length} of ${total} shipments: ${statusSummary}. ${totalProducts} product lines total.`,
    pagination: {
      showing: shipments.length,
      total,
      startIdx: pagination?.startIdx ?? 1,
      endIdx: pagination?.endIdx ?? shipments.length,
    },
    shipments: shipments.map(buildShipmentObject),
  };

  return JSON.stringify(response);
}

/**
 * Formats shipment details as hybrid JSON.
 */
function formatShipmentDetails(shipment: Shipment): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = shipment as any;

  const code = raw.code ?? 'N/A';
  const status = formatShipmentStatus(raw.status);
  const rawProducts = raw.products ?? raw.items ?? [];

  // Build products array
  const products = rawProducts.map((p: Record<string, unknown>) => ({
    code: p.item_code ?? p.code,
    name: p.item_title ?? p.item_name ?? p.name ?? 'Unknown',
    quantity: Number(p.quantity ?? p.qty ?? 0),
    unit: p.unit ?? 'pcs',
  }));

  const totalQty = products.reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.quantity), 0);
  const coCode = raw.customer_order_code ?? raw.cust_ord_code ?? null;

  const summaryParts = [`${code}: ${status}`, `${products.length} products, ${totalQty} units`];
  if (coCode) summaryParts.push(`for ${coCode}`);
  if (raw.tracking_number) summaryParts.push(`tracking: ${raw.tracking_number}`);

  const response = {
    summary: summaryParts.join('. '),
    shipment: {
      id: raw.shipment_id ?? raw.id,
      code,
      status,
      statusCode: raw.status,
      trackingNumber: raw.tracking_number || null,
      created: formatDate(raw.created),
      deliveryDate: raw.delivery_date ? formatDate(raw.delivery_date) : null,
      customerOrder: {
        id: raw.customer_order_id || null,
        code: coCode,
      },
      shippingAddress: raw.shipping_address || null,
      packingNotes: raw.packing_notes || null,
    },
    products,
  };

  return JSON.stringify(response);
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Registers shipment-related MCP tools.
 *
 * @param server - MCP server instance
 * @param client - MRPeasy API client
 */
export function registerShipmentTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering shipment tools');

  // -------------------------------------------------------------------------
  // get_shipments
  // -------------------------------------------------------------------------
  server.tool(
    'get_shipments',
    'Get shipments with optional filtering. Filter by customer_order_id to get all shipments for a specific CO. Shows tracking numbers, status, and products shipped.',
    {
      customer_order_id: GetShipmentsInputSchema.shape.customer_order_id,
      status: GetShipmentsInputSchema.shape.status,
      tracking_number: GetShipmentsInputSchema.shape.tracking_number,
      page: GetShipmentsInputSchema.shape.page,
      per_page: GetShipmentsInputSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_shipments called', { params });

      try {
        const apiParams: Record<string, unknown> = {};

        if (params.customer_order_id) {
          apiParams.customer_order_id = params.customer_order_id;
        }
        if (params.status) {
          apiParams.status = statusToCode(params.status);
        }
        if (params.tracking_number) {
          apiParams.tracking_number = params.tracking_number;
        }

        const shipments = await client.getShipments(apiParams);
        const contentRange = (shipments as { _contentRange?: string })._contentRange;
        const formattedResponse = formatShipmentsResponse(shipments, contentRange);

        logger.debug('get_shipments success', {
          count: shipments.length,
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
        return handleToolError(error, 'get_shipments');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_shipment_details
  // -------------------------------------------------------------------------
  server.tool(
    'get_shipment_details',
    'Get full details of a specific shipment. Can lookup by internal ID (shipment_id) or by code (shipment_code like "SH-00123"). Returns tracking info, products shipped, and shipping address.',
    {
      shipment_id: GetShipmentDetailsInputSchema.shape.shipment_id,
      shipment_code: GetShipmentDetailsInputSchema.shape.shipment_code,
    },
    async (params) => {
      logger.debug('get_shipment_details called', { params });

      try {
        let resolvedId: number | undefined = params.shipment_id;

        // If shipment_code is provided, use the API's code filter to find it
        if (params.shipment_code && !resolvedId) {
          logger.debug('Searching for shipment by code filter', { shipment_code: params.shipment_code });

          const shipments = await client.getShipments({ code: params.shipment_code });

          if (shipments.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const foundShipment = shipments[0] as any;
            resolvedId = foundShipment.shipment_id ?? foundShipment.id;
            logger.debug('Found shipment by code filter', { code: params.shipment_code, resolvedId });
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    summary: `Shipment with code "${params.shipment_code}" not found.`,
                    error: 'NOT_FOUND',
                  }),
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
                text: JSON.stringify({
                  summary: 'Please provide either shipment_id or shipment_code.',
                  error: 'MISSING_PARAMETER',
                }),
              },
            ],
          };
        }

        const shipment = await client.getShipment(resolvedId);
        const formattedResponse = formatShipmentDetails(shipment);

        logger.debug('get_shipment_details success', {
          shipmentId: resolvedId,
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
        return handleToolError(error, 'get_shipment_details');
      }
    }
  );

  logger.info('Shipment tools registered: get_shipments, get_shipment_details');
}
