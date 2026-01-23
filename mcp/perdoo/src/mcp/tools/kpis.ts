/**
 * MCP Tools: KPIs
 *
 * Registers KPI CRUD tools for the Perdoo MCP server.
 * Provides list, get, create, and update operations with
 * relay pagination flattening for LLM consumption.
 *
 * Validated against real Perdoo API schema:
 * - Uses upsertKpi mutation (UpsertKPIMutationInput - uppercase KPI)
 * - KPI IDs are UUIDs
 * - Status is CommitStatus enum (field: lastCommitStatus)
 * - Uses MetricUnit enum instead of free-text unit
 * - Supports Django-style filter args on list (allKpis query)
 * - Singular query is `kpi(id: UUID!)`
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PerdooClient } from '../../services/perdoo/client.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers KPI-related MCP tools with the server.
 *
 * Tools registered:
 * - list_kpis: List KPIs with pagination and filters
 * - get_kpi: Get a single KPI by UUID
 * - create_kpi: Create a new KPI (upsert without id)
 * - update_kpi: Update an existing KPI (upsert with id)
 *
 * @param server - The MCP server instance
 * @param client - The Perdoo API client
 */
export function registerKpiTools(
  server: McpServer,
  client: PerdooClient
): void {
  // ===========================================================================
  // list_kpis
  // ===========================================================================
  server.tool(
    'list_kpis',
    'List Perdoo KPIs with pagination and filters. Can filter by name, lead, group, status, company goal flag. Returns flattened list.',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Number of KPIs to return (max 100)'),
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response for next page'),
      name_contains: z
        .string()
        .optional()
        .describe('Filter by name (case-insensitive contains)'),
      lead_id: z
        .string()
        .optional()
        .describe('Filter by lead user UUID'),
      group_id: z
        .string()
        .optional()
        .describe('Filter by group UUID'),
      archived: z
        .boolean()
        .optional()
        .describe('Filter by archived status'),
      status: z
        .enum(['NO_STATUS', 'OFF_TRACK', 'NEEDS_ATTENTION', 'ON_TRACK', 'ACCOMPLISHED'])
        .optional()
        .describe('Filter by commit status'),
      is_company_goal: z
        .boolean()
        .optional()
        .describe('Filter by company goal flag'),
      goal_id: z
        .string()
        .optional()
        .describe('Filter by strategic goal UUID'),
      parent_id: z
        .string()
        .optional()
        .describe('Filter by parent KPI UUID'),
      order_by: z
        .string()
        .optional()
        .describe('Sort field (e.g., "name", "-createdDate")'),
    },
    async (params) => {
      logger.debug('list_kpis tool called', { params });

      try {
        const data = await client.listKpis({
          first: params.limit,
          after: params.cursor,
          name_Icontains: params.name_contains,
          lead_Id: params.lead_id,
          group: params.group_id,
          archived: params.archived,
          status_In: params.status,
          isCompanyGoal: params.is_company_goal,
          goal_Id: params.goal_id,
          parent: params.parent_id,
          orderBy: params.order_by,
        });

        const connection = data.allKpis;
        const kpis = connection.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          description: edge.node.description ?? null,
          lastCommitStatus: edge.node.lastCommitStatus,
          metricUnit: edge.node.metricUnit,
          startValue: edge.node.startValue ?? null,
          currentValue: edge.node.currentValue ?? null,
          targetType: edge.node.targetType,
          weight: edge.node.weight,
          isCompanyGoal: edge.node.isCompanyGoal,
          archived: edge.node.archived,
          progressDriver: edge.node.progressDriver,
          lead: edge.node.lead ? { id: edge.node.lead.id, name: edge.node.lead.name } : null,
          parent: edge.node.parent ? { id: edge.node.parent.id, name: edge.node.parent.name } : null,
          goal: edge.node.goal ? { id: edge.node.goal.id, name: edge.node.goal.name } : null,
        }));

        const response = {
          summary: `${kpis.length} KPI${kpis.length !== 1 ? 's' : ''} returned.${connection.pageInfo.hasNextPage ? ' More available.' : ''}`,
          pagination: {
            hasNextPage: connection.pageInfo.hasNextPage,
            nextCursor: connection.pageInfo.endCursor ?? null,
          },
          kpis,
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
        return handleToolError(error, 'list_kpis');
      }
    }
  );

  // ===========================================================================
  // get_kpi
  // ===========================================================================
  server.tool(
    'get_kpi',
    'Get a single Perdoo KPI by UUID with full details including value, target, and status.',
    {
      id: z
        .string()
        .describe('The KPI UUID to retrieve'),
    },
    async (params) => {
      logger.debug('get_kpi tool called', { id: params.id });

      try {
        const data = await client.getKpi(params.id);
        const kpi = data.kpi;

        const response = {
          id: kpi.id,
          name: kpi.name,
          description: kpi.description ?? null,
          lastCommitStatus: kpi.lastCommitStatus,
          metricUnit: kpi.metricUnit,
          startValue: kpi.startValue ?? null,
          currentValue: kpi.currentValue ?? null,
          targetType: kpi.targetType,
          goalOperator: kpi.goalOperator ?? null,
          weight: kpi.weight,
          isCompanyGoal: kpi.isCompanyGoal,
          archived: kpi.archived,
          private: kpi.private,
          progressDriver: kpi.progressDriver,
          goalUpdateCycle: kpi.goalUpdateCycle,
          targetFrequency: kpi.targetFrequency,
          resetTargetEveryCycle: kpi.resetTargetEveryCycle,
          aggregationMethod: kpi.aggregationMethod,
          goalThreshold: kpi.goalThreshold ?? null,
          isOutdated: kpi.isOutdated,
          progress: kpi.progress ?? null,
          createdDate: kpi.createdDate,
          archivedDate: kpi.archivedDate ?? null,
          lead: kpi.lead ? { id: kpi.lead.id, name: kpi.lead.name } : null,
          parent: kpi.parent ? { id: kpi.parent.id, name: kpi.parent.name } : null,
          goal: kpi.goal ? { id: kpi.goal.id, name: kpi.goal.name } : null,
          groups: kpi.groups?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          tags: kpi.tags?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          children: kpi.children?.edges?.map((edge) => ({
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
        return handleToolError(error, 'get_kpi');
      }
    }
  );

  // ===========================================================================
  // create_kpi
  // ===========================================================================
  server.tool(
    'create_kpi',
    'Create a new KPI in Perdoo. Name is required.',
    {
      name: z
        .string()
        .min(1)
        .describe('Name/title of the KPI'),
      description: z
        .string()
        .optional()
        .describe('Description of the KPI'),
      lead: z
        .string()
        .optional()
        .describe('Lead user UUID'),
      metric_unit: z
        .string()
        .optional()
        .describe('Metric unit (NUMERICAL, PERCENTAGE, or currency code like USD, EUR)'),
      current_value: z
        .number()
        .optional()
        .describe('Current metric value'),
      target_type: z
        .enum(['STAY_AT_OR_ABOVE', 'STAY_AT_OR_BELOW', 'INCREASE_TO', 'DECREASE_TO'])
        .optional()
        .describe('Target type direction'),
      goal_operator: z
        .enum(['GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL'])
        .optional()
        .describe('Goal operator (comparison direction)'),
      weight: z
        .number()
        .optional()
        .describe('Weight for aggregation contribution'),
      is_company_goal: z
        .boolean()
        .optional()
        .describe('Whether this is a company-level KPI'),
      goal: z
        .string()
        .optional()
        .describe('Strategic goal UUID to align to'),
      parent: z
        .string()
        .optional()
        .describe('Parent KPI UUID'),
      goal_update_cycle: z
        .enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'EVERY_4_MONTHS'])
        .optional()
        .describe('Update cadence'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertKPIMutationInput fields (e.g., private, groups, tags, targetFrequency, aggregationMethod)'),
    },
    async (params) => {
      logger.debug('create_kpi tool called', { name: params.name });

      try {
        const input = {
          name: params.name,
          ...(params.description && { description: params.description }),
          ...(params.lead && { lead: params.lead }),
          ...(params.metric_unit && { metricUnit: params.metric_unit }),
          ...(params.current_value !== undefined && { currentValue: params.current_value }),
          ...(params.target_type && { targetType: params.target_type }),
          ...(params.goal_operator && { goalOperator: params.goal_operator }),
          ...(params.weight !== undefined && { weight: params.weight }),
          ...(params.is_company_goal !== undefined && { isCompanyGoal: params.is_company_goal }),
          ...(params.goal && { goal: params.goal }),
          ...(params.parent && { parent: params.parent }),
          ...(params.goal_update_cycle && { goalUpdateCycle: params.goal_update_cycle }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.createKpi(input);
        const result = data.upsertKpi;

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

        const created = result.kpi;
        const response = {
          success: true,
          kpi: created ? {
            id: created.id,
            name: created.name,
            lastCommitStatus: created.lastCommitStatus,
            metricUnit: created.metricUnit,
            isCompanyGoal: created.isCompanyGoal,
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
        return handleToolError(error, 'create_kpi');
      }
    }
  );

  // ===========================================================================
  // update_kpi
  // ===========================================================================
  server.tool(
    'update_kpi',
    'Update an existing Perdoo KPI by UUID.',
    {
      id: z
        .string()
        .describe('The KPI UUID to update'),
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
      metric_unit: z
        .string()
        .optional()
        .describe('New metric unit (NUMERICAL, PERCENTAGE, or currency code)'),
      current_value: z
        .number()
        .optional()
        .describe('New current metric value'),
      target_type: z
        .enum(['STAY_AT_OR_ABOVE', 'STAY_AT_OR_BELOW', 'INCREASE_TO', 'DECREASE_TO'])
        .optional()
        .describe('New target type direction'),
      goal_operator: z
        .enum(['GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL'])
        .optional()
        .describe('New goal operator'),
      weight: z
        .number()
        .optional()
        .describe('New weight'),
      is_company_goal: z
        .boolean()
        .optional()
        .describe('Toggle company goal flag'),
      goal: z
        .string()
        .optional()
        .describe('New strategic goal UUID'),
      parent: z
        .string()
        .optional()
        .describe('New parent KPI UUID'),
      goal_update_cycle: z
        .enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'EVERY_4_MONTHS'])
        .optional()
        .describe('New update cadence'),
      archived: z
        .boolean()
        .optional()
        .describe('Archive or unarchive the KPI'),
      additional_fields: z
        .record(z.unknown())
        .optional()
        .describe('Additional UpsertKPIMutationInput fields (e.g., private, groups, tags, targetFrequency, aggregationMethod, goalThreshold)'),
    },
    async (params) => {
      logger.debug('update_kpi tool called', { id: params.id });

      try {
        const input = {
          ...(params.name && { name: params.name }),
          ...(params.description !== undefined && { description: params.description }),
          ...(params.lead && { lead: params.lead }),
          ...(params.metric_unit && { metricUnit: params.metric_unit }),
          ...(params.current_value !== undefined && { currentValue: params.current_value }),
          ...(params.target_type && { targetType: params.target_type }),
          ...(params.goal_operator && { goalOperator: params.goal_operator }),
          ...(params.weight !== undefined && { weight: params.weight }),
          ...(params.is_company_goal !== undefined && { isCompanyGoal: params.is_company_goal }),
          ...(params.goal && { goal: params.goal }),
          ...(params.parent && { parent: params.parent }),
          ...(params.goal_update_cycle && { goalUpdateCycle: params.goal_update_cycle }),
          ...(params.archived !== undefined && { archived: params.archived }),
          ...(params.additional_fields ?? {}),
        };

        const data = await client.updateKpi(params.id, input);
        const result = data.upsertKpi;

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

        const updated = result.kpi;
        const response = {
          success: true,
          kpi: updated ? {
            id: updated.id,
            name: updated.name,
            lastCommitStatus: updated.lastCommitStatus,
            metricUnit: updated.metricUnit,
            currentValue: updated.currentValue ?? null,
            isCompanyGoal: updated.isCompanyGoal,
            progressDriver: updated.progressDriver,
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
        return handleToolError(error, 'update_kpi');
      }
    }
  );

  logger.info('KPI tools registered');
}
