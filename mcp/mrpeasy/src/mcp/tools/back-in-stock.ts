/**
 * MCP Tool: get_back_in_stock_date
 *
 * Retrieves the expected back-in-stock date for a product by:
 * 1. Finding customer orders (COs) containing the product
 * 2. Getting the planned ship date of those COs
 * 3. Adding 7 days to calculate the expected back-in-stock date
 * 4. Checking shipments for partial deliveries
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { CustomerOrder, Shipment, StockItem } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Input schema for get_back_in_stock_date tool.
 */
const GetBackInStockDateInputSchema = z.object({
  sku: z.string().optional().describe(
    'The product SKU/part number (e.g., "ZPEO-NH-1"). If provided, searches by exact code first.'
  ),
  search: z.string().optional().describe(
    'Search term to find products by name (e.g., "Shea Nilotica"). Used if SKU not provided or not found.'
  ),
});

// ============================================================================
// Types
// ============================================================================

interface BackInStockResult {
  productCode: string;
  productName: string;
  customerOrderCode: string;
  customerOrderId: number;
  customerName: string;
  plannedShipDate: string;
  expectedBackInStockDate: string;
  orderedQuantity: number;
  shippedQuantity: number;
  remainingQuantity: number;
  isPartialShipment: boolean;
  orderStatus: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats a Unix timestamp or ISO date string to YYYY-MM-DD format.
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
 * Adds days to a date string and returns YYYY-MM-DD format.
 */
function addDays(dateStr: string, days: number): string {
  if (dateStr === 'N/A') return 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'N/A';
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Maps numeric status code to readable string for customer orders.
 */
function formatCustomerOrderStatus(status: unknown): string {
  if (status === null || status === undefined) return 'Unknown';

  const statusMap: Record<number, string> = {
    10: 'Quotation',
    20: 'Waiting for confirmation',
    30: 'Confirmed',
    40: 'Waiting for production',
    50: 'In production',
    60: 'Ready for shipment',
    70: 'Shipped',
    80: 'Delivered',
    85: 'Archived',
    90: 'Cancelled',
  };

  const numStatus = typeof status === 'number' ? status : parseInt(String(status), 10);
  return statusMap[numStatus] ?? String(status);
}

/**
 * Checks if a CO status is "open" (not delivered, archived, or cancelled).
 */
function isOpenStatus(status: unknown): boolean {
  const numStatus = typeof status === 'number' ? status : parseInt(String(status), 10);
  // Open statuses: 10-70 (Quotation through Shipped)
  // Closed: 80 (Delivered), 85 (Archived), 90 (Cancelled)
  return numStatus >= 10 && numStatus <= 70;
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Registers the get_back_in_stock_date tool.
 *
 * @param server - MCP server instance
 * @param client - MRPeasy API client
 */
export function registerBackInStockTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering back-in-stock tools');

  server.tool(
    'get_back_in_stock_date',
    'Get the expected back-in-stock date for a product. Finds customer orders (COs) containing the product, gets the planned ship date, and adds 7 days. Shows partial shipments if applicable. If user provides only a SKU or product title, assume they want to know the back-in-stock date.',
    {
      sku: GetBackInStockDateInputSchema.shape.sku,
      search: GetBackInStockDateInputSchema.shape.search,
    },
    async (params) => {
      logger.debug('get_back_in_stock_date called', { params });

      try {
        // Validate: must provide either sku or search
        if (!params.sku && !params.search) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'Please provide either sku (SKU/part number) or search (product name).',
                  error: 'MISSING_PARAMETER',
                }),
              },
            ],
            isError: true,
          };
        }

        // Step 1: Find the product(s)
        const matchedProducts: Array<{ articleId: number; code: string; title: string }> = [];

        // If SKU provided, try direct lookup first
        if (params.sku) {
          logger.debug('Searching by SKU', { sku: params.sku });
          try {
            const items = await client.getItems({ code: params.sku, per_page: 10 });
            for (const item of items) {
              if (item.code?.toLowerCase() === params.sku.toLowerCase()) {
                matchedProducts.push({
                  articleId: item.article_id,
                  code: item.code,
                  title: item.title ?? 'Unknown',
                });
              }
            }
            logger.debug('SKU search result', { found: matchedProducts.length });
          } catch (err) {
            logger.debug('SKU search failed', { error: err instanceof Error ? err.message : 'Unknown' });
          }
        }

        // If no products found by SKU or search term provided, search by name
        if (matchedProducts.length === 0 && (params.search || params.sku)) {
          const searchTerm = params.search ?? params.sku ?? '';
          logger.debug('Searching by name', { search: searchTerm });
          try {
            const items = await client.getItems({ search: searchTerm, per_page: 100 });
            const lowerSearch = searchTerm.toLowerCase();
            for (const item of items) {
              const codeMatch = item.code?.toLowerCase().includes(lowerSearch);
              const titleMatch = item.title?.toLowerCase().includes(lowerSearch);
              if (codeMatch || titleMatch) {
                // Avoid duplicates
                if (!matchedProducts.some(p => p.articleId === item.article_id)) {
                  matchedProducts.push({
                    articleId: item.article_id,
                    code: item.code ?? 'N/A',
                    title: item.title ?? 'Unknown',
                  });
                }
              }
            }
            logger.debug('Name search result', { found: matchedProducts.length });
          } catch (err) {
            logger.debug('Name search failed', { error: err instanceof Error ? err.message : 'Unknown' });
          }
        }

        if (matchedProducts.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: `No products found matching "${params.sku ?? params.search}".`,
                  error: 'NOT_FOUND',
                  tip: 'Try search_items to find products by partial name or code.',
                }),
              },
            ],
          };
        }

        // Step 2: Get all open customer orders
        logger.debug('Fetching open customer orders');
        // Get COs with open statuses (10-70)
        const openCOs = await client.getCustomerOrders({
          'status[]': [10, 20, 30, 40, 50, 60, 70],
        } as Record<string, unknown>);
        logger.debug('Fetched customer orders', { count: openCOs.length });

        // Step 3: For each product, find COs that contain it
        const results: BackInStockResult[] = [];
        const productArticleIds = new Set(matchedProducts.map(p => p.articleId));

        for (const co of openCOs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawCO = co as any;
          const coId = rawCO.cust_ord_id ?? rawCO.id;
          const coCode = rawCO.code ?? rawCO.number ?? 'N/A';

          // Get full CO details to see line items
          let coDetails: CustomerOrder;
          try {
            coDetails = await client.getCustomerOrder(coId);
          } catch (err) {
            logger.debug('Failed to get CO details', { coId, error: err instanceof Error ? err.message : 'Unknown' });
            continue;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawDetails = coDetails as any;
          const products = rawDetails.products ?? rawDetails.items ?? rawDetails.lines ?? [];

          // Check if any line item matches our products
          for (const lineItem of products) {
            const itemArticleId = lineItem.article_id ?? lineItem.item_id;
            if (!productArticleIds.has(itemArticleId)) continue;

            // Found a matching product in this CO
            const matchedProduct = matchedProducts.find(p => p.articleId === itemArticleId);
            if (!matchedProduct) continue;

            const orderedQty = Number(lineItem.quantity ?? lineItem.qty ?? 0);
            const shippedQty = Number(lineItem.shipped ?? lineItem.delivered_quantity ?? 0);
            const plannedShipDate = formatDate(rawDetails.delivery_date);
            const expectedBackInStock = addDays(plannedShipDate, 7);

            // Step 4: Check shipments for this CO to verify shipped quantities
            let totalShippedFromShipments = 0;
            try {
              const shipments = await client.getShipments({ customer_order_id: coId });
              for (const shipment of shipments) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rawShipment = shipment as any;
                // Only count shipped (status 20) shipments
                if (rawShipment.status === 20) {
                  const shipmentProducts = rawShipment.products ?? rawShipment.items ?? [];
                  for (const sp of shipmentProducts) {
                    const spArticleId = sp.article_id ?? sp.item_id;
                    if (spArticleId === itemArticleId) {
                      totalShippedFromShipments += Number(sp.quantity ?? sp.qty ?? 0);
                    }
                  }
                }
              }
            } catch (err) {
              logger.debug('Failed to get shipments for CO', { coId, error: err instanceof Error ? err.message : 'Unknown' });
            }

            // Use the larger of the two shipped quantities
            const actualShipped = Math.max(shippedQty, totalShippedFromShipments);
            const remainingQty = orderedQty - actualShipped;
            const isPartial = actualShipped > 0 && remainingQty > 0;

            // Only include if there's remaining quantity to be delivered
            if (remainingQty > 0) {
              results.push({
                productCode: matchedProduct.code,
                productName: matchedProduct.title,
                customerOrderCode: coCode,
                customerOrderId: coId,
                customerName: rawDetails.customer_name ?? 'Unknown',
                plannedShipDate,
                expectedBackInStockDate: expectedBackInStock,
                orderedQuantity: orderedQty,
                shippedQuantity: actualShipped,
                remainingQuantity: remainingQty,
                isPartialShipment: isPartial,
                orderStatus: formatCustomerOrderStatus(rawDetails.status),
              });
            }
          }
        }

        // Step 5: Format response
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: `No open customer orders found containing "${params.sku ?? params.search}".`,
                  products: matchedProducts.map(p => ({ code: p.code, name: p.title })),
                  note: 'The product may be in stock or have no pending orders.',
                }),
              },
            ],
          };
        }

        // Sort by expected back-in-stock date (earliest first)
        results.sort((a, b) => {
          if (a.expectedBackInStockDate === 'N/A') return 1;
          if (b.expectedBackInStockDate === 'N/A') return -1;
          return a.expectedBackInStockDate.localeCompare(b.expectedBackInStockDate);
        });

        // Build response
        const uniqueProducts = [...new Set(results.map(r => r.productCode))];
        const summary = results.length === 1
          ? `${results[0].productCode}: Expected back in stock ${results[0].expectedBackInStockDate} (${results[0].remainingQuantity} units from ${results[0].customerOrderCode})${results[0].isPartialShipment ? ' - PARTIAL SHIPMENT' : ''}`
          : `${results.length} pending deliveries for ${uniqueProducts.length} product(s). Earliest back in stock: ${results[0].expectedBackInStockDate}`;

        const response = {
          summary,
          results: results.map(r => ({
            product: {
              code: r.productCode,
              name: r.productName,
            },
            customerOrder: {
              code: r.customerOrderCode,
              id: r.customerOrderId,
              customer: r.customerName,
              status: r.orderStatus,
            },
            dates: {
              plannedShipDate: r.plannedShipDate,
              expectedBackInStock: r.expectedBackInStockDate,
            },
            quantities: {
              ordered: r.orderedQuantity,
              shipped: r.shippedQuantity,
              remaining: r.remainingQuantity,
            },
            isPartialShipment: r.isPartialShipment,
          })),
        };

        logger.debug('get_back_in_stock_date success', { resultCount: results.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'get_back_in_stock_date');
      }
    }
  );

  logger.info('Back-in-stock tools registered: get_back_in_stock_date');
}
