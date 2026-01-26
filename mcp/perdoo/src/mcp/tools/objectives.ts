/**
 * MCP Tools: Objectives
 *
 * Registers objective CRUD tools for the Perdoo MCP server.
 * Provides list, get, create, and update operations with
 * relay pagination flattening for LLM consumption.
 *
 * Validated against real Perdoo API schema:
 * - Uses upsertObjective mutation (single endpoint for create/update)
 * - Objective IDs are UUIDs
 * - Status is CommitStatus enum, stage is ObjectiveStage enum
 * - Supports Django-style filter args on list
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
 * - list_objectives: List objectives with pagination and filters
 * - get_objective: Get a single objective by UUID
 * - create_objective: Create a new objective (upsert without id)
 * - update_objective: Update an existing objective (upsert with id)
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
    'perdoo_list_objectives',
    `List Perdoo objectives with pagination and optional filters.

Filter examples:
- Top-level objectives only: parent_id=null
- Children of specific objective: parent_id="uuid"
- Your objectives: lead_id="your-uuid" (use list_users to find IDs)
- Active objectives: stage="ACTIVE"
- Objectives needing attention: status="NEEDS_ATTENTION"

Status values: NO_STATUS, OFF_TRACK, NEEDS_ATTENTION, ON_TRACK, ACCOMPLISHED
Stage values: DRAFT, ACTIVE, CLOSED

Hierarchy support:
- Response includes "parent" (id, name) if item has a parent
- Response includes "children_count" showing number of direct children
- parent_id=null returns only top-level items
- parent_id="uuid" returns only direct children of that item
- Omit parent_id to get all items regardless of hierarchy

Returns flattened list with pagination info. Use cursor for subsequent pages.`,
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
      name_contains: z
        .string()
        .optional()
        .describe('Filter by name (case-insensitive contains)'),
      stage: z
        .enum(['DRAFT', 'ACTIVE', 'CLOSED'])
        .optional()
        .describe('Filter by lifecycle stage'),
      status: z
        .enum(['NO_STATUS', 'OFF_TRACK', 'NEEDS_ATTENTION', 'ON_TRACK', 'ACCOMPLISHED'])
        .optional()
        .describe('Filter by commit status'),
      lead_id: z
        .string()
        .optional()
        .describe('Filter by lead user UUID'),
      group_id: z
        .string()
        .optional()
        .describe('Filter by group UUID'),
      parent_id: z
        .string()
        .nullable()
        .optional()
        .describe('Filter by parent objective UUID. Pass a UUID to get direct children, pass null to get only top-level objectives (no parent), omit to get all.'),
    },
    async (params) => {
      logger.debug('list_objectives tool called', { params });

      try {
        // Handle parent_id filter: string = children of that parent, null = top-level only
        const isTopLevelOnly = params.parent_id === null;
        const parentIdFilter = (params.parent_id !== undefined && params.parent_id !== null)
          ? params.parent_id
          : undefined;

        const data = await client.listObjectives({
          first: isTopLevelOnly ? 100 : params.limit,
          after: params.cursor,
          name_Icontains: params.name_contains,
          stage: params.stage,
          status: params.status,
          lead_Id: params.lead_id,
          groups_Id: params.group_id,
          parent_Id: parentIdFilter,
        });

        const connection = data.objectives;
        let objectives = connection.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          description: edge.node.description ?? null,
          progress: edge.node.progress ?? null,
          status: edge.node.status,
          stage: edge.node.stage,
          lead: edge.node.lead ? { id: edge.node.lead.id, name: edge.node.lead.name } : null,
          timeframe: edge.node.timeframe ? { id: edge.node.timeframe.id, name: edge.node.timeframe.name } : null,
          parent: edge.node.parent ? { id: edge.node.parent.id, name: edge.node.parent.name } : null,
          children_count: edge.node.children?.totalCount ?? 0,
          groups: edge.node.groups?.edges?.map((g) => ({ id: g.node.id, name: g.node.name })) ?? [],
        }));

        // Client-side filter for top-level only (API doesn't support parent_Isnull for objectives)
        if (isTopLevelOnly) {
          objectives = objectives.filter(o => o.parent === null).slice(0, params.limit);
        }

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
        return handleToolError(error, 'perdoo_list_objectives');
      }
    }
  );

  // ===========================================================================
  // get_objective
  // ===========================================================================
  server.tool(
    'perdoo_get_objective',
    'Get a single Perdoo objective by UUID with full details including description, lead, groups, key results, children, and contributors.',
    {
      id: z
        .string()
        .describe('The objective UUID to retrieve'),
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
          progress: obj.progress ?? null,
          status: obj.status,
          stage: obj.stage,
          weight: obj.weight,
          private: obj.private,
          isCompanyGoal: obj.isCompanyGoal,
          completed: obj.completed,
          progressDriver: obj.progressDriver,
          goalUpdateCycle: obj.goalUpdateCycle,
          startDate: obj.startDate ?? null,
          dueDate: obj.dueDate ?? null,
          createdDate: obj.createdDate,
          lastEditedDate: obj.lastEditedDate,
          lead: obj.lead ? { id: obj.lead.id, name: obj.lead.name, email: obj.lead.email ?? null } : null,
          timeframe: obj.timeframe ? { id: obj.timeframe.id, name: obj.timeframe.name } : null,
          parent: obj.parent ? { id: obj.parent.id, name: obj.parent.name } : null,
          groups: obj.groups?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          keyResults: obj.keyResults?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          children: obj.children?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          contributors: obj.contributors?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          tags: obj.tags?.edges?.map((edge) => ({
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
        return handleToolError(error, 'perdoo_get_objective');
      }
    }
  );

  // ===========================================================================
  // create_objective
  // ===========================================================================
  server.tool(
    'perdoo_create_objective',
    `Create a new Perdoo objective.

Required fields:
- name (string): The objective title
- timeframe (UUID): Must be a valid timeframe ID - use list_timeframes to find available timeframes

Optional fields:
- description (string): HTML supported
- lead (UUID): User ID for the objective owner - use list_users to find IDs
- stage (enum): DRAFT, ACTIVE, CLOSED (default: DRAFT)
- parent (UUID): Parent objective ID for hierarchy
- groups (array of UUIDs): Team/group IDs - use list_groups to find IDs
- is_company_goal (boolean): Mark as company-level objective

Uses the upsertObjective mutation without an ID.`,
    {
      name: z
        .string()
        .min(1)
        .describe('Name/title of the objective'),
      description: z
        .string()
        .optional()
        .describe('Description of the objective'),
      timeframe: z
        .string()
        .optional()
        .describe('Timeframe UUID (required by Perdoo for new objectives)'),
      lead: z
        .string()
        .optional()
        .describe('Lead user UUID'),
      groups: z
        .array(z.string())
        .optional()
        .describe('Array of group UUIDs'),
      parent: z
        .string()
        .optional()
        .describe('Parent objective UUID for alignment'),
      stage: z
        .enum(['DRAFT', 'ACTIVE', 'CLOSED'])
        .optional()
        .describe('Lifecycle stage (defaults to DRAFT in Perdoo)'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertObjectiveMutationInput fields (e.g., progressDriver, isCompanyGoal, goalUpdateCycle)'),
    },
    async (params) => {
      logger.debug('create_objective tool called', { name: params.name });

      try {
        const input = {
          name: params.name,
          ...(params.description && { description: params.description }),
          ...(params.timeframe && { timeframe: params.timeframe }),
          ...(params.lead && { lead: params.lead }),
          ...(params.groups && { groups: params.groups }),
          ...(params.parent && { parent: params.parent }),
          ...(params.stage && { stage: params.stage }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.createObjective(input);
        const result = data.upsertObjective;

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

        const created = result.objective;
        const response = {
          success: true,
          objective: created ? {
            id: created.id,
            name: created.name,
            status: created.status,
            stage: created.stage,
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
        return handleToolError(error, 'perdoo_create_objective');
      }
    }
  );

  // ===========================================================================
  // update_objective
  // ===========================================================================
  server.tool(
    'perdoo_update_objective',
    'Update an existing Perdoo objective by UUID. Uses the upsertObjective mutation with the ID included.',
    {
      id: z
        .string()
        .describe('The objective UUID to update'),
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
      groups: z
        .array(z.string())
        .optional()
        .describe('New group UUIDs (replaces existing)'),
      timeframe: z
        .string()
        .optional()
        .describe('New timeframe UUID'),
      parent: z
        .string()
        .optional()
        .describe('New parent objective UUID'),
      stage: z
        .enum(['DRAFT', 'ACTIVE', 'CLOSED'])
        .optional()
        .describe('New lifecycle stage'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertObjectiveMutationInput fields (e.g., progressDriver, isCompanyGoal)'),
    },
    async (params) => {
      logger.debug('update_objective tool called', { id: params.id });

      try {
        const input = {
          ...(params.name && { name: params.name }),
          ...(params.description !== undefined && { description: params.description }),
          ...(params.lead && { lead: params.lead }),
          ...(params.groups && { groups: params.groups }),
          ...(params.timeframe && { timeframe: params.timeframe }),
          ...(params.parent && { parent: params.parent }),
          ...(params.stage && { stage: params.stage }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.updateObjective(params.id, input);
        const result = data.upsertObjective;

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

        const updated = result.objective;
        const response = {
          success: true,
          objective: updated ? {
            id: updated.id,
            name: updated.name,
            status: updated.status,
            stage: updated.stage,
            progress: updated.progress ?? null,
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
        return handleToolError(error, 'perdoo_update_objective');
      }
    }
  );

  logger.info('Objective tools registered');
}
