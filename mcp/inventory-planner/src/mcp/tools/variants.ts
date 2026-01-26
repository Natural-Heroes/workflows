/**
 * MCP Tools: Variants (Demand Forecasting & Replenishment)
 *
 * Provides tools for accessing variant data including:
 * - Stock levels and availability
 * - Replenishment recommendations
 * - Demand forecasting metrics
 * - Stockout risk predictions
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InventoryPlannerClient } from '../../services/inventory-planner/index.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers variant-related MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The Inventory Planner API client
 */
export function registerVariantTools(
  server: McpServer,
  client: InventoryPlannerClient
): void {
  // get_variants - List variants with filtering
  server.tool(
    'get_variants',
    'Get variants with demand forecasting and replenishment metrics. Filter by SKU, warehouse, vendor, or stock levels. Returns stock on hand, replenishment recommendations, days until stockout, and forecast data.',
    {
      sku: z
        .string()
        .optional()
        .describe('Filter by SKU (exact match)'),
      warehouse_id: z
        .string()
        .optional()
        .describe('Filter by warehouse/location ID'),
      vendor_id: z
        .string()
        .optional()
        .describe('Filter by vendor ID'),
      stock_on_hand_lt: z
        .number()
        .optional()
        .describe('Filter items with stock on hand less than this value'),
      oos_lt: z
        .number()
        .optional()
        .describe('Filter items with days until stockout less than this value'),
      fields: z
        .string()
        .optional()
        .describe('Comma-separated list of fields to return (e.g., "id,sku,replenishment,oos")'),
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
        .default(100)
        .describe('Items per page (max 1000)'),
    },
    async (params) => {
      logger.debug('get_variants tool called', { params });

      try {
        const response = await client.getVariants({
          sku: params.sku,
          warehouse_id: params.warehouse_id,
          vendor_id: params.vendor_id,
          stock_on_hand_lt: params.stock_on_hand_lt,
          oos_lt: params.oos_lt,
          fields: params.fields,
          page: params.page,
          limit: params.limit,
        });

        const variants = response.data;
        const meta = response.meta;

        if (variants.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'No variants found matching the criteria.',
                  pagination: { showing: 0, total: meta?.total ?? 0 },
                  variants: [],
                }),
              },
            ],
          };
        }

        // Build summary stats
        let needsReorder = 0;
        let lowStock = 0;
        let totalValue = 0;

        const variantItems = variants.map((v) => {
          if ((v.replenishment ?? 0) > 0) needsReorder++;
          if ((v.oos ?? 999) < 14) lowStock++;
          totalValue += v.inventory_value ?? 0;

          return {
            id: v.id,
            sku: v.sku,
            title: v.full_title ?? v.title ?? 'Unknown',
            stockOnHand: v.stock_on_hand ?? 0,
            stockAvailable: v.stock_available ?? 0,
            stockIncoming: v.stock_incoming ?? 0,
            replenishment: v.replenishment ?? 0,
            daysUntilOOS: v.oos ?? null,
            daysOfStock: v.days_of_stock ?? null,
            leadTime: v.lead_time ?? null,
            forecastDaily: v.forecast_daily ?? null,
            velocity: v.velocity_daily ?? null,
            inventoryValue: v.inventory_value ?? null,
            vendor: v.vendor_name ?? null,
            warehouse: v.warehouse_name ?? null,
          };
        });

        const result = {
          summary: `${variants.length} of ${meta?.total ?? variants.length} variants. ${needsReorder} need reorder, ${lowStock} at risk (<14 days stock). Total value: $${totalValue.toLocaleString()}.`,
          pagination: {
            showing: variants.length,
            total: meta?.total ?? variants.length,
            page: params.page,
            limit: meta?.limit ?? params.limit,
          },
          variants: variantItems,
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
        return handleToolError(error, 'get_variants');
      }
    }
  );

  // get_variant - Get single variant by ID
  server.tool(
    'get_variant',
    'Get detailed information for a single variant by ID. Returns full metrics including stock levels, replenishment data, forecasts, vendor information, planning parameters, and stockout history.',
    {
      id: z.string().describe('Variant ID'),
    },
    async (params) => {
      logger.debug('get_variant tool called', { params });

      try {
        const variant = await client.getVariant(params.id);

        // Parse stockout history into human-readable events
        const stockoutEvents: {
          startDate: string;
          endDate: string | null;
          durationDays: number | null;
        }[] = [];

        if (variant.stockouts_hist && Array.isArray(variant.stockouts_hist)) {
          let currentStockoutStart: string | null = null;

          for (const [date, status] of variant.stockouts_hist) {
            if (status === 1) {
              // Stockout started
              currentStockoutStart = date;
            } else if (status === 0 && currentStockoutStart) {
              // Stockout ended - calculate duration
              const startDate = new Date(currentStockoutStart);
              const endDate = new Date(date);
              const durationMs = endDate.getTime() - startDate.getTime();
              const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

              stockoutEvents.push({
                startDate: currentStockoutStart.split('T')[0],
                endDate: date.split('T')[0],
                durationDays,
              });
              currentStockoutStart = null;
            }
          }

          // If still in stockout (no end date yet)
          if (currentStockoutStart) {
            stockoutEvents.push({
              startDate: currentStockoutStart.split('T')[0],
              endDate: null,
              durationDays: null,
            });
          }
        }

        // Calculate stockout summary
        const totalStockoutDays = stockoutEvents
          .filter((e) => e.durationDays !== null)
          .reduce((sum, e) => sum + (e.durationDays ?? 0), 0);
        const currentlyOOS = stockoutEvents.some((e) => e.endDate === null);

        const result = {
          id: variant.id,
          sku: variant.sku,
          title: variant.full_title ?? variant.title,
          productId: variant.product_id,

          // Stock levels
          stock: {
            onHand: variant.stock_on_hand ?? 0,
            available: variant.stock_available ?? 0,
            incoming: variant.stock_incoming ?? 0,
            reserved: variant.stock_reserved ?? 0,
          },

          // Replenishment metrics
          replenishment: {
            quantity: variant.replenishment ?? 0,
            daysUntilOOS: variant.oos ?? null,
            daysOfStock: variant.days_of_stock ?? null,
            reorderPoint: variant.reorder_point ?? null,
            safetyStock: variant.safety_stock ?? null,
          },

          // Planning parameters
          planning: {
            leadTime: variant.lead_time ?? null,
            reviewPeriod: variant.review_period ?? null,
          },

          // Demand forecasting
          forecast: {
            daily: variant.forecast_daily ?? null,
            weekly: variant.forecast_weekly ?? null,
            monthly: variant.forecast_monthly ?? null,
            velocityDaily: variant.velocity_daily ?? null,
            velocityWeekly: variant.velocity_weekly ?? null,
          },

          // Financial
          financial: {
            avgCost: variant.avg_cost ?? null,
            price: variant.price ?? null,
            inventoryValue: variant.inventory_value ?? null,
            underValue: variant.under_value ?? null,
            overValue: variant.over_value ?? null,
          },

          // Stockout history and analysis
          stockoutHistory: {
            summary: {
              totalStockoutEvents: stockoutEvents.length,
              totalDaysOutOfStock: totalStockoutDays,
              oosLast60Days: variant.oos_last_60_days ?? null,
              meanStockoutDuration: variant.cur_mean_oos ?? null,
              currentlyOutOfStock: currentlyOOS,
              forecastedLostSales: variant.forecasted_lost_sales_lead_time ?? null,
              forecastedLostRevenue: variant.forecasted_lost_revenue_lead_time ?? null,
            },
            events: stockoutEvents.slice(-10), // Last 10 stockout events
          },

          // Vendor
          vendor: variant.vendors?.[0] ?? {
            id: variant.vendor_id,
            name: variant.vendor_name,
          },

          // Classification
          classification: {
            warehouse: variant.warehouse_name,
            warehouseId: variant.warehouse_id,
            productType: variant.product_type,
            abcClass: variant.abc_class,
            xyzClass: variant.xyz_class,
            tags: variant.tags,
          },

          // Metadata
          active: variant.active,
          updatedAt: variant.updated_at,
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
        return handleToolError(error, 'get_variant');
      }
    }
  );

  // get_replenishment - Get items needing reorder
  server.tool(
    'get_replenishment',
    'Get variants that need replenishment (reorder quantity > 0). Essential for identifying items that need to be ordered. Returns SKU, current stock, recommended order quantity, and days until stockout.',
    {
      warehouse_id: z
        .string()
        .optional()
        .describe('Filter by warehouse/location ID'),
      vendor_id: z
        .string()
        .optional()
        .describe('Filter by vendor ID for vendor-specific reorders'),
      sort_desc: z
        .string()
        .optional()
        .describe('Sort by field descending (e.g., "replenishment" for highest qty first)'),
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
        .default(100)
        .describe('Items per page (max 1000)'),
    },
    async (params) => {
      logger.debug('get_replenishment tool called', { params });

      try {
        const response = await client.getReplenishment({
          warehouse_id: params.warehouse_id,
          vendor_id: params.vendor_id,
          sort_desc: params.sort_desc,
          page: params.page,
          limit: params.limit,
        });

        const variants = response.data;
        const meta = response.meta;

        if (variants.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'No items currently need replenishment.',
                  pagination: { showing: 0, total: meta?.total ?? 0 },
                  items: [],
                }),
              },
            ],
          };
        }

        // Calculate totals
        let totalQty = 0;
        let urgentCount = 0;

        const items = variants.map((v) => {
          const qty = v.replenishment ?? 0;
          totalQty += qty;
          if ((v.oos ?? 999) < 7) urgentCount++;

          return {
            id: v.id,
            sku: v.sku,
            title: v.full_title ?? v.title ?? 'Unknown',
            stockOnHand: v.stock_on_hand ?? 0,
            stockIncoming: v.stock_incoming ?? 0,
            replenishmentQty: qty,
            daysUntilOOS: v.oos ?? null,
            leadTime: v.lead_time ?? null,
            vendor: v.vendor_name ?? null,
            vendorId: v.vendor_id ?? null,
            warehouse: v.warehouse_name ?? null,
            warehouseId: v.warehouse_id ?? null,
          };
        });

        const result = {
          summary: `${variants.length} of ${meta?.total ?? variants.length} items need reorder. Total qty: ${totalQty.toLocaleString()}. ${urgentCount} urgent (<7 days stock).`,
          pagination: {
            showing: variants.length,
            total: meta?.total ?? variants.length,
            page: params.page,
            limit: meta?.limit ?? params.limit,
          },
          items,
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
        return handleToolError(error, 'get_replenishment');
      }
    }
  );

  logger.info('Variant tools registered');
}
