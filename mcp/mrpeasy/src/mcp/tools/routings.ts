/**
 * MCP Tools for Routings.
 *
 * Provides tools for reading and writing routings:
 * - get_routings: List routings with optional product_id filter
 * - get_routing_details: Get single routing with operations
 * - create_routing: Create a new routing
 * - update_routing: Update an existing routing
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { Routing } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const GetRoutingsSchema = z.object({
  product_id: z.number().int().positive().optional().describe('Filter by product ID'),
  item_code: z.string().optional().describe('Filter by item code/SKU'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  per_page: z.number().int().positive().max(100).default(20).describe('Results per page (default: 20, max: 100)'),
});

const GetRoutingDetailsSchema = z.object({
  routing_id: z.number().int().positive().describe('Routing ID to retrieve'),
});

const RoutingOperationSchema = z.object({
  type_id: z.number().int().positive().describe('Operation type ID'),
  ord: z.number().int().min(0).describe('Order/sequence number'),
  variable_time: z.number().min(0).describe('Variable time per unit in minutes'),
  setup_time: z.number().min(0).optional().describe('Setup time in minutes'),
  workstation_id: z.number().int().positive().optional().describe('Workstation ID'),
});

const CreateRoutingSchema = z.object({
  product_id: z.number().int().positive().describe('Product ID this routing belongs to'),
  operations: z.array(RoutingOperationSchema).min(1).describe('Operations list (at least one required)'),
  title: z.string().optional().describe('Routing title'),
  code: z.string().optional().describe('Routing code (auto-generated if not provided)'),
  confirm: z.boolean().default(false).describe('Set to true to execute the creation. When false, returns a preview.'),
});

const UpdateRoutingSchema = z.object({
  routing_id: z.number().int().positive().describe('Routing ID to update'),
  title: z.string().optional().describe('New title'),
  code: z.string().optional().describe('New code'),
  operations: z.array(RoutingOperationSchema).optional().describe('Updated operations list (replaces existing)'),
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

function buildRoutingObject(routing: Routing): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = routing as any;
  return {
    id: raw.id ?? raw.routing_id,
    code: raw.code ?? null,
    title: raw.title ?? null,
    product: {
      id: raw.product_id,
      code: raw.item_code ?? null,
      name: raw.item_title ?? null,
    },
    operationCount: raw.operations?.length ?? 0,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerRoutingTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering routing tools');

  // -------------------------------------------------------------------------
  // get_routings
  // -------------------------------------------------------------------------
  server.tool(
    'get_routings',
    'List routings (manufacturing process steps). Optionally filter by product_id or item_code.',
    {
      product_id: GetRoutingsSchema.shape.product_id,
      item_code: GetRoutingsSchema.shape.item_code,
      page: GetRoutingsSchema.shape.page,
      per_page: GetRoutingsSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_routings called', { params });

      try {
        const apiParams: Record<string, unknown> = {};
        if (params.product_id) apiParams.product_id = params.product_id;
        if (params.item_code) apiParams.item_code = params.item_code;

        const routings = await client.getRoutings(apiParams);
        const contentRange = (routings as { _contentRange?: string })._contentRange;
        const pagination = parseContentRange(contentRange);
        const total = pagination?.total ?? routings.length;

        const response = {
          summary: routings.length === 0
            ? 'No routings found matching the criteria.'
            : `${routings.length} of ${total} routings found.`,
          pagination: {
            showing: routings.length,
            total,
          },
          routings: routings.map(buildRoutingObject),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_routings');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_routing_details
  // -------------------------------------------------------------------------
  server.tool(
    'get_routing_details',
    'Get full details of a specific routing by ID, including all operations with times and workstations.',
    {
      routing_id: GetRoutingDetailsSchema.shape.routing_id,
    },
    async (params) => {
      logger.debug('get_routing_details called', { params });

      try {
        const routing = await client.getRouting(params.routing_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = routing as any;

        const operations = (raw.operations ?? []).map((op: Record<string, unknown>, idx: number) => ({
          id: op.id ?? null,
          sequence: op.ord ?? idx + 1,
          typeId: op.type_id ?? null,
          name: op.name ?? op.title ?? null,
          variableTime: Number(op.variable_time ?? 0),
          setupTime: Number(op.setup_time ?? 0),
          workstation: {
            id: op.workstation_id ?? null,
            name: op.workstation_name ?? null,
          },
        }));

        const totalTime = operations.reduce(
          (sum: number, op: Record<string, unknown>) => sum + Number(op.variableTime) + Number(op.setupTime),
          0
        );

        const response = {
          summary: `Routing ${raw.code ?? raw.id}: ${operations.length} operations, ${totalTime} min total`,
          routing: {
            id: raw.id ?? raw.routing_id,
            code: raw.code ?? null,
            title: raw.title ?? null,
            product: {
              id: raw.product_id,
              code: raw.item_code ?? null,
              name: raw.item_title ?? null,
            },
          },
          operations,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_routing_details');
      }
    }
  );

  // -------------------------------------------------------------------------
  // create_routing
  // -------------------------------------------------------------------------
  server.tool(
    'create_routing',
    'Create a new routing (manufacturing process). Requires product_id and at least one operation with type_id, ord, and variable_time. Set confirm=true to execute.',
    {
      product_id: CreateRoutingSchema.shape.product_id,
      operations: CreateRoutingSchema.shape.operations,
      title: CreateRoutingSchema.shape.title,
      code: CreateRoutingSchema.shape.code,
      confirm: CreateRoutingSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('create_routing called', { params });

      try {
        const payload = {
          product_id: params.product_id,
          operations: params.operations,
          title: params.title,
          code: params.code,
        };

        if (!params.confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: 'This is a preview. Set confirm=true to create the routing.',
                payload,
              }),
            }],
          };
        }

        const result = await client.createRouting(payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Routing created successfully.',
              routing: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'create_routing');
      }
    }
  );

  // -------------------------------------------------------------------------
  // update_routing
  // -------------------------------------------------------------------------
  server.tool(
    'update_routing',
    'Update an existing routing. Can change title, code, or replace operations list. Set confirm=true to execute.',
    {
      routing_id: UpdateRoutingSchema.shape.routing_id,
      title: UpdateRoutingSchema.shape.title,
      code: UpdateRoutingSchema.shape.code,
      operations: UpdateRoutingSchema.shape.operations,
      confirm: UpdateRoutingSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('update_routing called', { params });

      try {
        const { routing_id, confirm, ...fields } = params;

        const payload = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(payload).length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No update fields provided. Specify at least one of: title, code, operations.',
            }],
          };
        }

        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: `This is a preview. Set confirm=true to update routing ${routing_id}.`,
                routing_id,
                payload,
              }),
            }],
          };
        }

        const result = await client.updateRouting(routing_id, payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Routing ${routing_id} updated successfully.`,
              routing: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'update_routing');
      }
    }
  );

  logger.info('Routing tools registered: get_routings, get_routing_details, create_routing, update_routing');
}
