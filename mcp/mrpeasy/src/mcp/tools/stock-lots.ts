/**
 * MCP Tools for Stock Lots.
 *
 * Provides tools for reading stock lot data including location information:
 * - get_stock_lots: List stock lots with filters
 * - get_stock_lot_details: Get single lot with locations
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { StockLot } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const GetStockLotsSchema = z.object({
  article_id: z.number().int().positive().optional().describe('Filter by article/item ID'),
  item_code: z.string().optional().describe('Filter by item code/SKU'),
  lot_number: z.string().optional().describe('Filter by lot number'),
  warehouse_id: z.number().int().positive().optional().describe('Filter by warehouse ID'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  per_page: z.number().int().positive().max(100).default(20).describe('Results per page (default: 20, max: 100)'),
});

const GetStockLotDetailsSchema = z.object({
  lot_id: z.number().int().positive().describe('Stock lot ID to retrieve'),
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

function buildStockLotObject(lot: StockLot): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = lot as any;
  return {
    id: raw.id ?? raw.lot_id,
    lotNumber: raw.lot_number ?? null,
    item: {
      articleId: raw.article_id ?? null,
      code: raw.item_code ?? null,
      name: raw.item_title ?? null,
    },
    quantity: Number(raw.quantity ?? 0),
    available: Number(raw.available ?? 0),
    expiryDate: formatDate(raw.expiry_date),
    locationCount: raw.locations?.length ?? 0,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerStockLotTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering stock lot tools');

  // -------------------------------------------------------------------------
  // get_stock_lots
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_stock_lots',
    'List stock lots with location data from MRPeasy. Filter by article_id, item_code, lot_number, or warehouse_id. Includes stock location information.',
    {
      article_id: GetStockLotsSchema.shape.article_id,
      item_code: GetStockLotsSchema.shape.item_code,
      lot_number: GetStockLotsSchema.shape.lot_number,
      warehouse_id: GetStockLotsSchema.shape.warehouse_id,
      page: GetStockLotsSchema.shape.page,
      per_page: GetStockLotsSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_stock_lots called', { params });

      try {
        const apiParams: Record<string, unknown> = {};
        if (params.article_id) apiParams.article_id = params.article_id;
        if (params.item_code) apiParams.item_code = params.item_code;
        if (params.lot_number) apiParams.lot_number = params.lot_number;
        if (params.warehouse_id) apiParams.warehouse_id = params.warehouse_id;

        const lots = await client.getStockLots(apiParams);
        const contentRange = (lots as { _contentRange?: string })._contentRange;
        const pagination = parseContentRange(contentRange);
        const total = pagination?.total ?? lots.length;

        const totalQuantity = lots.reduce((sum, l) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return sum + Number((l as any).quantity ?? 0);
        }, 0);

        const response = {
          summary: lots.length === 0
            ? 'No stock lots found matching the criteria.'
            : `${lots.length} of ${total} stock lots. Total quantity: ${totalQuantity}`,
          pagination: {
            showing: lots.length,
            total,
          },
          lots: lots.map(buildStockLotObject),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_get_stock_lots');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_stock_lot_details
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_stock_lot_details',
    'Get full details of a specific stock lot by ID from MRPeasy, including all storage locations and quantities.',
    {
      lot_id: GetStockLotDetailsSchema.shape.lot_id,
    },
    async (params) => {
      logger.debug('get_stock_lot_details called', { params });

      try {
        const lot = await client.getStockLot(params.lot_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = lot as any;

        const locations = (raw.locations ?? []).map((loc: Record<string, unknown>) => ({
          id: loc.id ?? null,
          name: loc.name ?? null,
          warehouse: {
            id: loc.warehouse_id ?? null,
            name: loc.warehouse_name ?? null,
          },
          quantity: Number(loc.quantity ?? 0),
        }));

        const totalQty = Number(raw.quantity ?? 0);
        const available = Number(raw.available ?? 0);

        const response = {
          summary: `Lot ${raw.lot_number ?? raw.id}: ${totalQty} total, ${available} available, ${locations.length} locations`,
          lot: {
            id: raw.id ?? raw.lot_id,
            lotNumber: raw.lot_number ?? null,
            item: {
              articleId: raw.article_id ?? null,
              code: raw.item_code ?? null,
              name: raw.item_title ?? null,
            },
            quantity: totalQty,
            available,
            expiryDate: formatDate(raw.expiry_date),
          },
          locations,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_get_stock_lot_details');
      }
    }
  );

  logger.info('Stock lot tools registered: mrp_get_stock_lots, mrp_get_stock_lot_details');
}
