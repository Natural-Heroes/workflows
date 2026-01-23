/**
 * MCP Tools: Strategic Pillars
 *
 * Registers strategic pillar read-only tools for the Perdoo MCP server.
 * Provides list and get operations with relay pagination flattening
 * for LLM consumption.
 *
 * Strategic pillars are Goal entities in the Perdoo API, filtered by
 * type=STRATEGIC_PILLAR. They define long-term organizational focus areas
 * that objectives and KPIs can align to.
 *
 * Note: Strategic pillars are read-only via the API (no mutation exists).
 * Creating or modifying strategic pillars requires the Perdoo web interface.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PerdooClient } from '../../services/perdoo/client.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Registers strategic pillar-related MCP tools with the server.
 *
 * Tools registered:
 * - list_strategic_pillars: List strategic pillars with pagination and filters
 * - get_strategic_pillar: Get a single strategic pillar by UUID
 *
 * @param server - The MCP server instance
 * @param client - The Perdoo API client
 */
export function registerStrategicPillarTools(
  server: McpServer,
  client: PerdooClient
): void {
  // ===========================================================================
  // list_strategic_pillars
  // ===========================================================================
  server.tool(
    'list_strategic_pillars',
    'List Perdoo strategic pillars with pagination and filters. Strategic pillars define long-term focus areas that objectives align to. Can filter by status, lead, archived. Returns flattened list.',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Number of strategic pillars to return (max 100)'),
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response for next page'),
      status: z
        .enum(['NO_STATUS', 'OFF_TRACK', 'NEEDS_ATTENTION', 'ON_TRACK', 'ACCOMPLISHED'])
        .optional()
        .describe('Filter by goal status'),
      lead_id: z
        .string()
        .optional()
        .describe('Filter by lead user UUID'),
      archived: z
        .boolean()
        .optional()
        .describe('Filter by archived status'),
      order_by: z
        .string()
        .optional()
        .describe('Sort field (e.g., "name", "-createdDate")'),
      parent_id: z
        .string()
        .optional()
        .describe('Filter by parent pillar UUID (for sub-pillars)'),
    },
    async (params) => {
      logger.debug('list_strategic_pillars tool called', { params });

      try {
        const data = await client.listStrategicPillars({
          first: params.limit,
          after: params.cursor,
          status: params.status,
          lead_Id: params.lead_id,
          archived: params.archived,
          orderBy: params.order_by,
          parent_Id: params.parent_id,
        });

        const connection = data.goals;
        const strategicPillars = connection.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          description: edge.node.description ?? null,
          status: edge.node.status,
          progress: edge.node.progress ?? null,
          currentValue: edge.node.currentValue ?? null,
          startDate: edge.node.startDate ?? null,
          endDate: edge.node.endDate ?? null,
          archived: edge.node.archived ?? false,
          lead: edge.node.lead ? { id: edge.node.lead.id, name: edge.node.lead.name } : null,
          timeframe: edge.node.timeframe ? { id: edge.node.timeframe.id, name: edge.node.timeframe.name } : null,
          parent: edge.node.parent ? { id: edge.node.parent.id, name: edge.node.parent.name } : null,
        }));

        const response = {
          summary: `${strategicPillars.length} strategic pillar${strategicPillars.length !== 1 ? 's' : ''} returned.${connection.pageInfo.hasNextPage ? ' More available.' : ''}`,
          pagination: {
            hasNextPage: connection.pageInfo.hasNextPage,
            nextCursor: connection.pageInfo.endCursor ?? null,
          },
          strategicPillars,
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
        return handleToolError(error, 'list_strategic_pillars');
      }
    }
  );

  // ===========================================================================
  // get_strategic_pillar
  // ===========================================================================
  server.tool(
    'get_strategic_pillar',
    'Get a single Perdoo strategic pillar by UUID with full details including description, lead, and aligned objectives/KPIs.',
    {
      id: z
        .string()
        .describe('The strategic pillar UUID to retrieve'),
    },
    async (params) => {
      logger.debug('get_strategic_pillar tool called', { id: params.id });

      try {
        const data = await client.getStrategicPillar(params.id);
        const pillar = data.goal;

        const response = {
          id: pillar.id,
          name: pillar.name,
          description: pillar.description ?? null,
          status: pillar.status,
          type: pillar.type,
          progress: pillar.progress ?? null,
          currentValue: pillar.currentValue ?? null,
          startDate: pillar.startDate ?? null,
          endDate: pillar.endDate ?? null,
          archived: pillar.archived ?? false,
          private: pillar.private ?? false,
          isCompanyGoal: pillar.isCompanyGoal ?? false,
          createdDate: pillar.createdDate ?? null,
          lead: pillar.lead ? { id: pillar.lead.id, name: pillar.lead.name } : null,
          timeframe: pillar.timeframe ? { id: pillar.timeframe.id, name: pillar.timeframe.name } : null,
          parent: pillar.parent ? { id: pillar.parent.id, name: pillar.parent.name } : null,
          groups: pillar.groups?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          children: pillar.children?.edges?.map((edge) => ({
            id: edge.node.id,
            name: edge.node.name,
          })) ?? [],
          tags: pillar.tags?.edges?.map((edge) => ({
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
        return handleToolError(error, 'get_strategic_pillar');
      }
    }
  );

  // Note: No Goal mutation found in Perdoo API. Strategic pillars are read-only via this MCP server.

  logger.info('Strategic pillar tools registered');
}
