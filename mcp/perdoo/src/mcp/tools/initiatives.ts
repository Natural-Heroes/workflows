/**
 * MCP Tools: Initiatives
 *
 * Registers initiative CRUD tools for the Perdoo MCP server.
 * Provides list, get, create, and update operations with
 * relay pagination flattening for LLM consumption.
 *
 * Initiatives are key results with type=INITIATIVE under the hood.
 * Dedicated tools with initiative-focused names and descriptions
 * make the API natural for LLMs to use as a separate domain concept.
 *
 * Key differences from key result tools:
 * - Uses dedicated `initiatives(...)` root query (pre-filtered)
 * - Does NOT expose a `type` parameter (always INITIATIVE)
 * - Descriptions emphasize initiative semantics (projects/tasks)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PerdooClient } from '../../services/perdoo/client.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers initiative-related MCP tools with the server.
 *
 * Tools registered:
 * - list_initiatives: List initiatives with pagination and filters
 * - get_initiative: Get a single initiative by UUID
 * - create_initiative: Create a new initiative (upsert without id, type=INITIATIVE)
 * - update_initiative: Update an existing initiative (upsert with id)
 *
 * @param server - The MCP server instance
 * @param client - The Perdoo API client
 */
export function registerInitiativeTools(
  server: McpServer,
  client: PerdooClient
): void {
  // ===========================================================================
  // list_initiatives
  // ===========================================================================
  server.tool(
    'list_initiatives',
    'List Perdoo initiatives (projects/tasks that support key results). Can filter by parent objective, lead, status, timeframe. Initiatives do NOT contribute to objective progress. Returns flattened list.',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Number of initiatives to return (max 100)'),
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response for next page'),
      objective_id: z
        .string()
        .optional()
        .describe('Filter by parent objective UUID'),
      name_contains: z
        .string()
        .optional()
        .describe('Filter by name (case-insensitive contains)'),
      lead_id: z
        .string()
        .optional()
        .describe('Filter by lead user UUID'),
      archived: z
        .boolean()
        .optional()
        .describe('Filter by archived status'),
      status: z
        .enum(['NO_STATUS', 'OFF_TRACK', 'NEEDS_ATTENTION', 'ON_TRACK', 'ACCOMPLISHED'])
        .optional()
        .describe('Filter by commit status'),
      timeframe_id: z
        .string()
        .optional()
        .describe('Filter by timeframe UUID'),
      order_by: z
        .string()
        .optional()
        .describe('Sort field (e.g., "name", "-createdDate")'),
    },
    async (params) => {
      logger.debug('list_initiatives tool called', { params });

      try {
        const data = await client.listInitiatives({
          first: params.limit,
          after: params.cursor,
          name_Icontains: params.name_contains,
          objective: params.objective_id,
          lead_Id: params.lead_id,
          archived: params.archived,
          status_In: params.status,
          timeframe: params.timeframe_id,
          orderBy: params.order_by,
        });

        const connection = data.initiatives;
        const initiatives = connection.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          description: edge.node.description ?? null,
          progress: edge.node.progress ?? null,
          status: edge.node.status,
          type: edge.node.type,
          weight: edge.node.weight,
          startValue: edge.node.startValue ?? null,
          targetValue: edge.node.targetValue ?? null,
          currentValue: edge.node.currentValue ?? null,
          unit: edge.node.unit ?? null,
          archived: edge.node.archived ?? false,
          lead: edge.node.lead ? { id: edge.node.lead.id, name: edge.node.lead.name } : null,
          objective: edge.node.objective ? { id: edge.node.objective.id, name: edge.node.objective.name } : null,
          timeframe: edge.node.timeframe ? { id: edge.node.timeframe.id, name: edge.node.timeframe.name } : null,
        }));

        const response = {
          summary: `${initiatives.length} initiative${initiatives.length !== 1 ? 's' : ''} returned.${connection.pageInfo.hasNextPage ? ' More available.' : ''}`,
          pagination: {
            hasNextPage: connection.pageInfo.hasNextPage,
            nextCursor: connection.pageInfo.endCursor ?? null,
          },
          initiatives,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'list_initiatives');
      }
    }
  );

  // ===========================================================================
  // get_initiative
  // ===========================================================================
  server.tool(
    'get_initiative',
    'Get a single Perdoo initiative by UUID with full details including objective reference, progress, and status.',
    {
      id: z
        .string()
        .describe('The initiative UUID to retrieve'),
    },
    async (params) => {
      logger.debug('get_initiative tool called', { id: params.id });

      try {
        const data = await client.getInitiative(params.id);
        const initiative = data.result;

        const response = {
          id: initiative.id,
          name: initiative.name,
          description: initiative.description ?? null,
          progress: initiative.progress ?? null,
          status: initiative.status,
          type: initiative.type,
          weight: initiative.weight,
          startValue: initiative.startValue ?? null,
          targetValue: initiative.targetValue ?? null,
          currentValue: initiative.currentValue ?? null,
          unit: initiative.unit ?? null,
          private: initiative.private ?? false,
          archived: initiative.archived ?? false,
          startDate: initiative.startDate ?? null,
          dueDate: initiative.dueDate ?? null,
          createdDate: initiative.createdDate ?? null,
          lastEditedDate: initiative.lastEditedDate ?? null,
          lead: initiative.lead ? { id: initiative.lead.id, name: initiative.lead.name, email: initiative.lead.email ?? null } : null,
          objective: initiative.objective ? { id: initiative.objective.id, name: initiative.objective.name } : null,
          timeframe: initiative.timeframe ? { id: initiative.timeframe.id, name: initiative.timeframe.name } : null,
          groups: initiative.groups?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          contributors: initiative.contributors?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          tags: initiative.tags?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'get_initiative');
      }
    }
  );

  // ===========================================================================
  // create_initiative
  // ===========================================================================
  server.tool(
    'create_initiative',
    'Create a new initiative (project/task) under a Perdoo objective. Name and objective are required. Initiatives track work that supports key results but do NOT contribute to objective progress directly.',
    {
      name: z
        .string()
        .min(1)
        .describe('Name/title of the initiative'),
      objective: z
        .string()
        .describe('Parent objective UUID (required)'),
      description: z
        .string()
        .optional()
        .describe('Description of the initiative'),
      lead: z
        .string()
        .optional()
        .describe('Lead user UUID'),
      start_value: z
        .number()
        .optional()
        .describe('Starting value for metric tracking'),
      target_value: z
        .number()
        .optional()
        .describe('Target value for metric tracking'),
      current_value: z
        .number()
        .optional()
        .describe('Current value for metric tracking'),
      unit: z
        .string()
        .optional()
        .describe('Unit label for metric values (e.g., "%", "tasks")'),
      weight: z
        .number()
        .optional()
        .describe('Weight for progress contribution'),
      timeframe: z
        .string()
        .optional()
        .describe('Timeframe UUID'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertKeyResultMutationInput fields (e.g., private, contributors, groups, tags)'),
    },
    async (params) => {
      logger.debug('create_initiative tool called', { name: params.name, objective: params.objective });

      try {
        const input = {
          name: params.name,
          objective: params.objective,
          ...(params.description && { description: params.description }),
          ...(params.lead && { lead: params.lead }),
          ...(params.start_value !== undefined && { startValue: params.start_value }),
          ...(params.target_value !== undefined && { targetValue: params.target_value }),
          ...(params.current_value !== undefined && { currentValue: params.current_value }),
          ...(params.unit && { unit: params.unit }),
          ...(params.weight !== undefined && { weight: params.weight }),
          ...(params.timeframe && { timeframe: params.timeframe }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.createInitiative(input);
        const result = data.upsertKeyResult;

        // Check for validation errors
        if (result.errors && result.errors.length > 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  errors: result.errors,
                }),
              },
            ],
            isError: true,
          };
        }

        const created = result.keyResult;
        const response = {
          success: true,
          initiative: created ? {
            id: created.id,
            name: created.name,
            type: created.type,
            status: created.status,
            objective: created.objective ? { id: created.objective.id, name: created.objective.name } : null,
          } : null,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'create_initiative');
      }
    }
  );

  // ===========================================================================
  // update_initiative
  // ===========================================================================
  server.tool(
    'update_initiative',
    'Update an existing Perdoo initiative by UUID.',
    {
      id: z
        .string()
        .describe('The initiative UUID to update'),
      name: z
        .string()
        .optional()
        .describe('New name/title'),
      description: z
        .string()
        .optional()
        .describe('New description'),
      lead: z
        .string()
        .optional()
        .describe('New lead user UUID'),
      start_value: z
        .number()
        .optional()
        .describe('New starting value'),
      target_value: z
        .number()
        .optional()
        .describe('New target value'),
      current_value: z
        .number()
        .optional()
        .describe('New current value'),
      unit: z
        .string()
        .optional()
        .describe('New unit label'),
      weight: z
        .number()
        .optional()
        .describe('New weight'),
      timeframe: z
        .string()
        .optional()
        .describe('New timeframe UUID'),
      archived: z
        .boolean()
        .optional()
        .describe('Archive or unarchive the initiative'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertKeyResultMutationInput fields (e.g., private, contributors, groups, tags, objective)'),
    },
    async (params) => {
      logger.debug('update_initiative tool called', { id: params.id });

      try {
        const input = {
          ...(params.name && { name: params.name }),
          ...(params.description !== undefined && { description: params.description }),
          ...(params.lead && { lead: params.lead }),
          ...(params.start_value !== undefined && { startValue: params.start_value }),
          ...(params.target_value !== undefined && { targetValue: params.target_value }),
          ...(params.current_value !== undefined && { currentValue: params.current_value }),
          ...(params.unit !== undefined && { unit: params.unit }),
          ...(params.weight !== undefined && { weight: params.weight }),
          ...(params.timeframe && { timeframe: params.timeframe }),
          ...(params.archived !== undefined && { archived: params.archived }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.updateInitiative(params.id, input);
        const result = data.upsertKeyResult;

        // Check for validation errors
        if (result.errors && result.errors.length > 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  errors: result.errors,
                }),
              },
            ],
            isError: true,
          };
        }

        const updated = result.keyResult;
        const response = {
          success: true,
          initiative: updated ? {
            id: updated.id,
            name: updated.name,
            type: updated.type,
            status: updated.status,
            progress: updated.progress ?? null,
            currentValue: updated.currentValue ?? null,
            targetValue: updated.targetValue ?? null,
          } : null,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'update_initiative');
      }
    }
  );

  logger.info('Initiative tools registered');
}
