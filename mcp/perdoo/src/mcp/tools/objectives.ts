/**
 * MCP Tools: Objectives
 *
 * Registers objective CRUD tools for the Perdoo MCP server.
 * Provides list, get, create, and update operations with
 * relay pagination flattening for LLM consumption.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PerdooClient } from '../../services/perdoo/client.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers objective-related MCP tools with the server.
 *
 * Tools registered:
 * - list_objectives: List objectives with pagination
 * - get_objective: Get a single objective by ID
 * - create_objective: Create a new objective
 * - update_objective: Update an existing objective
 *
 * @param server - The MCP server instance
 * @param client - The Perdoo API client
 */
export function registerObjectiveTools(
  server: McpServer,
  client: PerdooClient
): void {
  // ===========================================================================
  // list_objectives
  // ===========================================================================
  server.tool(
    'list_objectives',
    'List Perdoo objectives with pagination. Returns flattened list with pagination info. Use cursor for subsequent pages.',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Number of objectives to return (max 100)'),
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response for next page'),
    },
    async (params) => {
      logger.debug('list_objectives tool called', { params });

      try {
        const data = await client.listObjectives({
          first: params.limit,
          after: params.cursor,
        });

        const connection = data.objectives;
        const objectives = connection.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          status: edge.node.status,
          progress: edge.node.progress,
          timeframe: edge.node.timeframe?.name ?? null,
        }));

        const response = {
          summary: `${objectives.length} objective${objectives.length !== 1 ? 's' : ''} returned.${connection.pageInfo.hasNextPage ? ' More available.' : ''}`,
          pagination: {
            hasNextPage: connection.pageInfo.hasNextPage,
            nextCursor: connection.pageInfo.endCursor ?? null,
          },
          objectives,
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
        return handleToolError(error, 'list_objectives');
      }
    }
  );

  // ===========================================================================
  // get_objective
  // ===========================================================================
  server.tool(
    'get_objective',
    'Get a single Perdoo objective by ID with full details including description, lead, groups, and key results.',
    {
      id: z
        .string()
        .describe('The objective ID to retrieve'),
    },
    async (params) => {
      logger.debug('get_objective tool called', { id: params.id });

      try {
        const data = await client.getObjective(params.id);
        const obj = data.objective;

        const response = {
          id: obj.id,
          name: obj.name,
          description: obj.description ?? null,
          status: obj.status ?? null,
          progress: obj.progress ?? null,
          timeframe: obj.timeframe?.name ?? null,
          lead: obj.owner ? { id: obj.owner.id, name: obj.owner.name } : null,
          groups: (obj.team as unknown as { edges?: Array<{ node: { id: string; name: string } }> })?.edges?.map(
            (edge: { node: { id: string; name: string } }) => ({
              id: edge.node.id,
              name: edge.node.name,
            })
          ) ?? [],
          results: (obj as unknown as { results?: { edges: Array<{ node: { id: string; name: string } }> } }).results?.edges?.map(
            (edge: { node: { id: string; name: string } }) => ({
              id: edge.node.id,
              name: edge.node.name,
            })
          ) ?? [],
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
        return handleToolError(error, 'get_objective');
      }
    }
  );

  // ===========================================================================
  // create_objective
  // ===========================================================================
  server.tool(
    'create_objective',
    'Create a new Perdoo objective. Name is required. Additional fields can be passed for schema-specific parameters.',
    {
      name: z
        .string()
        .min(1)
        .describe('Name/title of the objective'),
      description: z
        .string()
        .optional()
        .describe('Description of the objective'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional input fields (e.g., ownerId, teamId, timeframeId). Schema-dependent.'),
    },
    async (params) => {
      logger.debug('create_objective tool called', { name: params.name });

      try {
        const input = {
          name: params.name,
          ...(params.description && { description: params.description }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.createObjective(input);
        const created = data.createObjective.objective;

        const response = {
          success: true,
          objective: {
            id: created.id,
            name: created.name,
            status: created.status ?? null,
          },
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
        return handleToolError(error, 'create_objective');
      }
    }
  );

  // ===========================================================================
  // update_objective
  // ===========================================================================
  server.tool(
    'update_objective',
    'Update an existing Perdoo objective. Provide the ID and any fields to update.',
    {
      id: z
        .string()
        .describe('The objective ID to update'),
      fields: z
        .record(z.unknown())
        .describe('Fields to update (e.g., { name: "New Name", description: "Updated" })'),
    },
    async (params) => {
      logger.debug('update_objective tool called', { id: params.id });

      try {
        const data = await client.updateObjective(params.id, params.fields as Record<string, unknown>);
        const updated = data.updateObjective.objective;

        const response = {
          success: true,
          objective: {
            id: updated.id,
            name: updated.name,
            status: updated.status ?? null,
            progress: updated.progress ?? null,
          },
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
        return handleToolError(error, 'update_objective');
      }
    }
  );

  logger.info('Objective tools registered');
}
