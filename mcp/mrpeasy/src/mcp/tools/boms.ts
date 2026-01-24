/**
 * MCP Tools for Bills of Materials (BOMs).
 *
 * Provides tools for reading and writing BOMs:
 * - get_boms: List BOMs with optional product_id filter
 * - get_bom_details: Get single BOM with components and routings
 * - create_bom: Create a new BOM
 * - update_bom: Update an existing BOM
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { Bom } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const GetBomsSchema = z.object({
  product_id: z.number().int().positive().optional().describe('Filter by product ID'),
  item_code: z.string().optional().describe('Filter by item code/SKU'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  per_page: z.number().int().positive().max(100).default(20).describe('Results per page (default: 20, max: 100)'),
});

const GetBomDetailsSchema = z.object({
  bom_id: z.number().int().positive().describe('BOM ID to retrieve'),
});

const BomComponentSchema = z.object({
  article_id: z.number().int().positive().describe('Component article/item ID'),
  quantity: z.number().positive().describe('Quantity required per unit of finished product'),
});

const CreateBomSchema = z.object({
  product_id: z.number().int().positive().describe('Product ID this BOM belongs to'),
  components: z.array(BomComponentSchema).min(1).describe('Components list (at least one required)'),
  title: z.string().optional().describe('BOM title'),
  code: z.string().optional().describe('BOM code (auto-generated if not provided)'),
  confirm: z.boolean().default(false).describe('Set to true to execute the creation. When false, returns a preview.'),
});

const UpdateBomSchema = z.object({
  bom_id: z.number().int().positive().describe('BOM ID to update'),
  title: z.string().optional().describe('New title'),
  code: z.string().optional().describe('New code'),
  components: z.array(BomComponentSchema).optional().describe('Updated components list (replaces existing)'),
  confirm: z.boolean().default(false).describe('Set to true to execute the update. When false, returns a preview.'),
});

// ============================================================================
// Response Formatters
// ============================================================================

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

function buildBomObject(bom: Bom): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = bom as any;
  return {
    id: raw.id ?? raw.bom_id,
    code: raw.code ?? null,
    title: raw.title ?? null,
    product: {
      id: raw.product_id,
      code: raw.item_code ?? null,
      name: raw.item_title ?? null,
    },
    componentCount: raw.components?.length ?? 0,
    routingCount: raw.routings?.length ?? 0,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerBomTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering BOM tools');

  // -------------------------------------------------------------------------
  // get_boms
  // -------------------------------------------------------------------------
  server.tool(
    'get_boms',
    'List Bills of Materials (BOMs). Optionally filter by product_id or item_code.',
    {
      product_id: GetBomsSchema.shape.product_id,
      item_code: GetBomsSchema.shape.item_code,
      page: GetBomsSchema.shape.page,
      per_page: GetBomsSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_boms called', { params });

      try {
        const apiParams: Record<string, unknown> = {};
        if (params.product_id) apiParams.product_id = params.product_id;
        if (params.item_code) apiParams.item_code = params.item_code;

        const boms = await client.getBoms(apiParams);
        const contentRange = (boms as { _contentRange?: string })._contentRange;
        const pagination = parseContentRange(contentRange);
        const total = pagination?.total ?? boms.length;

        const response = {
          summary: boms.length === 0
            ? 'No BOMs found matching the criteria.'
            : `${boms.length} of ${total} BOMs found.`,
          pagination: {
            showing: boms.length,
            total,
          },
          boms: boms.map(buildBomObject),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_boms');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_bom_details
  // -------------------------------------------------------------------------
  server.tool(
    'get_bom_details',
    'Get full details of a specific BOM by ID, including components and linked routings.',
    {
      bom_id: GetBomDetailsSchema.shape.bom_id,
    },
    async (params) => {
      logger.debug('get_bom_details called', { params });

      try {
        const bom = await client.getBom(params.bom_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = bom as any;

        const components = (raw.components ?? []).map((c: Record<string, unknown>) => ({
          articleId: c.article_id,
          code: c.item_code ?? c.code ?? null,
          name: c.item_title ?? c.name ?? null,
          quantity: Number(c.quantity ?? 0),
          unit: c.unit ?? 'pcs',
        }));

        const routings = (raw.routings ?? []).map((r: Record<string, unknown>) => ({
          id: r.id,
          code: r.code ?? null,
          title: r.title ?? null,
        }));

        const response = {
          summary: `BOM ${raw.code ?? raw.id}: ${components.length} components, ${routings.length} routings`,
          bom: {
            id: raw.id ?? raw.bom_id,
            code: raw.code ?? null,
            title: raw.title ?? null,
            product: {
              id: raw.product_id,
              code: raw.item_code ?? null,
              name: raw.item_title ?? null,
            },
          },
          components,
          routings,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_bom_details');
      }
    }
  );

  // -------------------------------------------------------------------------
  // create_bom
  // -------------------------------------------------------------------------
  server.tool(
    'create_bom',
    'Create a new Bill of Materials (BOM). Requires product_id and at least one component with article_id and quantity. Set confirm=true to execute.',
    {
      product_id: CreateBomSchema.shape.product_id,
      components: CreateBomSchema.shape.components,
      title: CreateBomSchema.shape.title,
      code: CreateBomSchema.shape.code,
      confirm: CreateBomSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('create_bom called', { params });

      try {
        const payload = {
          product_id: params.product_id,
          components: params.components,
          title: params.title,
          code: params.code,
        };

        if (!params.confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: 'This is a preview. Set confirm=true to create the BOM.',
                payload,
              }),
            }],
          };
        }

        const result = await client.createBom(payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'BOM created successfully.',
              bom: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'create_bom');
      }
    }
  );

  // -------------------------------------------------------------------------
  // update_bom
  // -------------------------------------------------------------------------
  server.tool(
    'update_bom',
    'Update an existing BOM. Can change title, code, or replace components list. Set confirm=true to execute.',
    {
      bom_id: UpdateBomSchema.shape.bom_id,
      title: UpdateBomSchema.shape.title,
      code: UpdateBomSchema.shape.code,
      components: UpdateBomSchema.shape.components,
      confirm: UpdateBomSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('update_bom called', { params });

      try {
        const { bom_id, confirm, ...fields } = params;

        const payload = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(payload).length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No update fields provided. Specify at least one of: title, code, components.',
            }],
          };
        }

        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: `This is a preview. Set confirm=true to update BOM ${bom_id}.`,
                bom_id,
                payload,
              }),
            }],
          };
        }

        const result = await client.updateBom(bom_id, payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `BOM ${bom_id} updated successfully.`,
              bom: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'update_bom');
      }
    }
  );

  logger.info('BOM tools registered: get_boms, get_bom_details, create_bom, update_bom');
}
