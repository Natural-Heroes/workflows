/**
 * MCP Tool: get_back_in_stock_date
 *
 * Retrieves the expected back-in-stock date for products by SKU:
 * 1. Looking up products by exact SKU match
 * 2. Finding customer orders (COs) containing those products
 * 3. Getting the planned ship date and adding 7 days
 * 4. Checking shipments for partial deliveries
 *
 * Use search_items first to find SKUs if unknown.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { CustomerOrder } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

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
    'Get expected back-in-stock dates for products by SKU. Finds open customer orders containing the products, gets planned ship dates, and adds 7 days. Use search_items first to find SKUs if you only have a product name.',
    {
      skus: z
        .array(z.string())
        .min(1)
        .describe('Array of product SKUs/part numbers (e.g., ["ZPEO-NH-1", "ZSHO-NH-1"])'),
    },
    async (params) => {
      logger.debug('get_back_in_stock_date called', { skus: params.skus });

      try {
        // Step 1: Look up each SKU
        const matchedProducts: Array<{ articleId: number; code: string; title: string }> = [];
        const notFoundSkus: string[] = [];

        for (const sku of params.skus) {
          logger.debug('Looking up SKU', { sku });
          try {
            const items = await client.getItems({ code: sku, per_page: 10 });
            const exactMatch = items.find(
              (item) => item.code?.toLowerCase() === sku.toLowerCase()
            );
            if (exactMatch) {
              matchedProducts.push({
                articleId: exactMatch.article_id,
                code: exactMatch.code ?? sku,
                title: exactMatch.title ?? 'Unknown',
              });
            } else {
              notFoundSkus.push(sku);
            }
          } catch (err) {
            logger.debug('SKU lookup failed', { sku, error: err instanceof Error ? err.message : 'Unknown' });
            notFoundSkus.push(sku);
          }
        }

        if (matchedProducts.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: `No products found for SKUs: ${params.skus.join(', ')}`,
                  error: 'NOT_FOUND',
                  tip: 'Use search_items to find products by name and get their SKUs.',
                }),
              },
            ],
          };
        }

        // Step 2: Get all open customer orders (status 10-70)
        logger.debug('Fetching open customer orders');
        const openCOs = await client.getCustomerOrders({
          'status[]': [10, 20, 30, 40, 50, 60, 70],
        } as Record<string, unknown>);
        logger.debug('Fetched customer orders', { count: openCOs.length });

        // Step 3: For each product, find COs that contain it
        const results: BackInStockResult[] = [];
        const productArticleIds = new Set(matchedProducts.map((p) => p.articleId));

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
            logger.debug('Failed to get CO details', {
              coId,
              error: err instanceof Error ? err.message : 'Unknown',
            });
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
            const matchedProduct = matchedProducts.find((p) => p.articleId === itemArticleId);
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
              logger.debug('Failed to get shipments for CO', {
                coId,
                error: err instanceof Error ? err.message : 'Unknown',
              });
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
          const response: Record<string, unknown> = {
            summary: `No open customer orders found for: ${matchedProducts.map((p) => p.code).join(', ')}`,
            products: matchedProducts.map((p) => ({ code: p.code, name: p.title })),
            note: 'Products may be in stock or have no pending orders.',
          };
          if (notFoundSkus.length > 0) {
            response.notFoundSkus = notFoundSkus;
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response),
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
        const uniqueProducts = [...new Set(results.map((r) => r.productCode))];
        const summary =
          results.length === 1
            ? `${results[0].productCode}: Back in stock ${results[0].expectedBackInStockDate} (${results[0].remainingQuantity} units from ${results[0].customerOrderCode})${results[0].isPartialShipment ? ' - PARTIAL' : ''}`
            : `${results.length} pending deliveries for ${uniqueProducts.length} product(s). Earliest: ${results[0].expectedBackInStockDate}`;

        const response: Record<string, unknown> = {
          summary,
          results: results.map((r) => ({
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

        if (notFoundSkus.length > 0) {
          response.notFoundSkus = notFoundSkus;
        }

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
