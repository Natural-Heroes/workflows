/**
 * MCP Tools: Key Results
 *
 * Registers key result CRUD tools for the Perdoo MCP server.
 * Provides list, get, create, and update operations with
 * relay pagination flattening for LLM consumption.
 *
 * Validated against real Perdoo API schema:
 * - Uses upsertKeyResult mutation (single endpoint for create/update)
 * - Key result IDs are UUIDs
 * - Status is CommitStatus enum, type is PerdooApiKeyResultTypeChoices
 * - Supports Django-style filter args on list
 * - Singular query is `result(id: UUID!)` not `keyResult(id: ...)`
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PerdooClient } from '../../services/perdoo/client.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers key result-related MCP tools with the server.
 *
 * Tools registered:
 * - list_key_results: List key results with pagination and filters
 * - get_key_result: Get a single key result by UUID
 * - create_key_result: Create a new key result (upsert without id)
 * - update_key_result: Update an existing key result (upsert with id)
 *
 * @param server - The MCP server instance
 * @param client - The Perdoo API client
 */
export function registerKeyResultTools(
  server: McpServer,
  client: PerdooClient
): void {
  // ===========================================================================
  // list_key_results
  // ===========================================================================
  server.tool(
    'list_key_results',
    'List Perdoo key results with pagination and filters. Can filter by parent objective, lead, type, status, timeframe. Returns flattened list.',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Number of key results to return (max 100)'),
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
      type: z
        .enum(['KEY_RESULT', 'INITIATIVE'])
        .optional()
        .describe('Filter by key result type'),
      archived: z
        .boolean()
        .optional()
        .describe('Filter by archived status'),
      status: z
        .enum(['NO_STATUS', 'OFF_TRACK', 'NEEDS_ATTENTION', 'ON_TRACK', 'ACCOMPLISHED'])
        .optional()
        .describe('Filter by commit status'),
      objective_stage: z
        .enum(['DRAFT', 'ACTIVE', 'CLOSED'])
        .optional()
        .describe('Filter by parent objective stage'),
      timeframe_id: z
        .string()
        .optional()
        .describe('Filter by timeframe UUID'),
      order_by: z
        .string()
        .optional()
        .describe('Sort field (e.g., "name", "-createdDate")'),
      parent_id: z
        .string()
        .nullable()
        .optional()
        .describe('Filter by parent key result UUID. Pass a UUID to get direct children, pass null to get only top-level key results (no parent), omit to get all.'),
    },
    async (params) => {
      logger.debug('list_key_results tool called', { params });

      try {
        // Handle parent_id filter: string = children of that parent, null = top-level only
        let parentFilter: string | undefined;
        let parentIsnull: boolean | undefined;
        if (params.parent_id !== undefined) {
          if (params.parent_id === null) {
            parentIsnull = true;
          } else {
            parentFilter = params.parent_id;
          }
        }

        const data = await client.listKeyResults({
          first: params.limit,
          after: params.cursor,
          name_Icontains: params.name_contains,
          objective: params.objective_id,
          lead_Id: params.lead_id,
          type: params.type,
          archived: params.archived,
          status_In: params.status,
          objectiveStage: params.objective_stage,
          timeframe: params.timeframe_id,
          orderBy: params.order_by,
          parent: parentFilter,
          parent_Isnull: parentIsnull,
        });

        const connection = data.keyResults;
        const keyResults = connection.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          description: edge.node.description ?? null,
          status: edge.node.status,
          type: edge.node.type,
          weight: edge.node.weight,
          startValue: edge.node.startValue ?? null,
          endValue: edge.node.endValue ?? null,
          currentValue: edge.node.currentValue ?? null,
          metricUnit: edge.node.metricUnit ?? null,
          archived: edge.node.archived ?? false,
          lead: edge.node.lead ? { id: edge.node.lead.id, name: edge.node.lead.name } : null,
          objective: edge.node.objective ? { id: edge.node.objective.id, name: edge.node.objective.name } : null,
          parent: edge.node.parent ? { id: edge.node.parent.id, name: edge.node.parent.name } : null,
          children_count: edge.node.childrenCount ?? 0,
        }));

        const response = {
          summary: `${keyResults.length} key result${keyResults.length !== 1 ? 's' : ''} returned.${connection.pageInfo.hasNextPage ? ' More available.' : ''}`,
          pagination: {
            hasNextPage: connection.pageInfo.hasNextPage,
            nextCursor: connection.pageInfo.endCursor ?? null,
          },
          keyResults,
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
        return handleToolError(error, 'list_key_results');
      }
    }
  );

  // ===========================================================================
  // get_key_result
  // ===========================================================================
  server.tool(
    'get_key_result',
    'Get a single Perdoo key result by UUID with full details including objective reference, progress, metric values, and status.',
    {
      id: z
        .string()
        .describe('The key result UUID to retrieve'),
    },
    async (params) => {
      logger.debug('get_key_result tool called', { id: params.id });

      try {
        const data = await client.getKeyResult(params.id);
        const kr = data.result;

        const response = {
          id: kr.id,
          name: kr.name,
          description: kr.description ?? null,
          status: kr.status,
          type: kr.type,
          weight: kr.weight,
          startValue: kr.startValue ?? null,
          endValue: kr.endValue ?? null,
          currentValue: kr.currentValue ?? null,
          metricUnit: kr.metricUnit ?? null,
          targetType: kr.targetType ?? null,
          archived: kr.archived ?? false,
          startDate: kr.startDate ?? null,
          dueDate: kr.dueDate ?? null,
          createdDate: kr.createdDate ?? null,
          lastEditedDate: kr.lastEditedDate ?? null,
          lead: kr.lead ? { id: kr.lead.id, name: kr.lead.name } : null,
          objective: kr.objective ? { id: kr.objective.id, name: kr.objective.name } : null,
          contributors: kr.contributors?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          tags: kr.tags?.edges?.map((edge) => ({
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
        return handleToolError(error, 'get_key_result');
      }
    }
  );

  // ===========================================================================
  // create_key_result
  // ===========================================================================
  server.tool(
    'create_key_result',
    'Create a new key result under a Perdoo objective. Name and objective are required.',
    {
      name: z
        .string()
        .min(1)
        .describe('Name/title of the key result'),
      objective: z
        .string()
        .describe('Parent objective UUID (required)'),
      description: z
        .string()
        .optional()
        .describe('Description of the key result'),
      lead: z
        .string()
        .optional()
        .describe('Lead user UUID'),
      type: z
        .enum(['KEY_RESULT', 'INITIATIVE'])
        .optional()
        .describe('Key result type (defaults to KEY_RESULT)'),
      start_value: z
        .number()
        .optional()
        .describe('Starting value for metric tracking'),
      end_value: z
        .number()
        .optional()
        .describe('Target/end value for metric tracking'),
      current_value: z
        .number()
        .optional()
        .describe('Current value for metric tracking'),
      metric_unit: z
        .string()
        .optional()
        .describe('Metric unit (NUMERICAL, PERCENTAGE, or currency code like USD, EUR)'),
      target_type: z
        .enum(['INCREASE_TO', 'DECREASE_TO', 'STAY_AT_OR_ABOVE', 'STAY_AT_OR_BELOW'])
        .optional()
        .describe('Direction of progress toward target'),
      weight: z
        .number()
        .optional()
        .describe('Weight for progress contribution to parent objective'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertKeyResultMutationInput fields (e.g., private, contributors, groups, tags)'),
    },
    async (params) => {
      logger.debug('create_key_result tool called', { name: params.name, objective: params.objective });

      try {
        const input = {
          name: params.name,
          objective: params.objective,
          ...(params.description && { description: params.description }),
          ...(params.lead && { lead: params.lead }),
          ...(params.type && { type: params.type }),
          ...(params.start_value !== undefined && { startValue: params.start_value }),
          ...(params.end_value !== undefined && { endValue: params.end_value }),
          ...(params.current_value !== undefined && { currentValue: params.current_value }),
          ...(params.metric_unit && { metricUnit: params.metric_unit }),
          ...(params.target_type && { targetType: params.target_type }),
          ...(params.weight !== undefined && { weight: params.weight }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.createKeyResult(input);
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
          keyResult: created ? {
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
        return handleToolError(error, 'create_key_result');
      }
    }
  );

  // ===========================================================================
  // update_key_result
  // ===========================================================================
  server.tool(
    'update_key_result',
    'Update an existing Perdoo key result by UUID. Uses the upsertKeyResult mutation with the ID included.',
    {
      id: z
        .string()
        .describe('The key result UUID to update'),
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
      type: z
        .enum(['KEY_RESULT', 'INITIATIVE'])
        .optional()
        .describe('New key result type'),
      start_value: z
        .number()
        .optional()
        .describe('New starting value'),
      end_value: z
        .number()
        .optional()
        .describe('New target/end value'),
      current_value: z
        .number()
        .optional()
        .describe('New current value'),
      metric_unit: z
        .string()
        .optional()
        .describe('New metric unit (NUMERICAL, PERCENTAGE, or currency code)'),
      target_type: z
        .enum(['INCREASE_TO', 'DECREASE_TO', 'STAY_AT_OR_ABOVE', 'STAY_AT_OR_BELOW'])
        .optional()
        .describe('New direction of progress toward target'),
      weight: z
        .number()
        .optional()
        .describe('New weight'),
      archived: z
        .boolean()
        .optional()
        .describe('Archive or unarchive the key result'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertKeyResultMutationInput fields (e.g., private, contributors, groups, tags, objective)'),
    },
    async (params) => {
      logger.debug('update_key_result tool called', { id: params.id });

      try {
        const input = {
          ...(params.name && { name: params.name }),
          ...(params.description !== undefined && { description: params.description }),
          ...(params.lead && { lead: params.lead }),
          ...(params.type && { type: params.type }),
          ...(params.start_value !== undefined && { startValue: params.start_value }),
          ...(params.end_value !== undefined && { endValue: params.end_value }),
          ...(params.current_value !== undefined && { currentValue: params.current_value }),
          ...(params.metric_unit !== undefined && { metricUnit: params.metric_unit }),
          ...(params.target_type && { targetType: params.target_type }),
          ...(params.weight !== undefined && { weight: params.weight }),
          ...(params.archived !== undefined && { archived: params.archived }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.updateKeyResult(params.id, input);
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
          keyResult: updated ? {
            id: updated.id,
            name: updated.name,
            type: updated.type,
            status: updated.status,
            currentValue: updated.currentValue ?? null,
            endValue: updated.endValue ?? null,
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
        return handleToolError(error, 'update_key_result');
      }
    }
  );

  logger.info('Key result tools registered');
}
