/**
 * MCP Tools: Helper lookups (timeframes, users, groups)
 *
 * Provides lookup tools for reference data needed by other tools:
 * - list_timeframes: Required for create_objective (timeframe UUID)
 * - list_users: Required for lead/contributor assignments
 * - list_groups: Required for team assignments on objectives
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PerdooClient } from '../../services/perdoo/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers helper lookup tools on the MCP server.
 */
export function registerHelperTools(server: McpServer, client: PerdooClient): void {
  // ===========================================================================
  // list_timeframes
  // ===========================================================================
  server.tool(
    'perdoo_list_timeframes',
    `List available timeframes (quarters, years) in Perdoo. Returns timeframe IDs needed for create_objective.

Filters:
- active: true for current timeframes, false for past/future
- status: "active", "past", "future"
- exclude_archived: true to hide archived timeframes

Response includes id, name, startDate, endDate for each timeframe.`,
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max results to return (default: 20)'),
      active: z
        .boolean()
        .optional()
        .describe('Filter by active status (true = current timeframes)'),
      status: z
        .string()
        .optional()
        .describe('Filter by status: "active", "past", "future"'),
      exclude_archived: z
        .boolean()
        .optional()
        .describe('Exclude archived timeframes (default: false)'),
    },
    async (params) => {
      logger.debug('list_timeframes tool called', params);

      try {
        const data = await client.listTimeframes({
          first: params.limit,
          active: params.active,
          status: params.status,
          excludeArchived: params.exclude_archived,
        });

        const timeframes = data.timeframes.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          start_date: edge.node.startDate,
          end_date: edge.node.endDate,
          status: edge.node.status ?? null,
          active: edge.node.active ?? null,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ timeframes, count: timeframes.length }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'perdoo_list_timeframes');
      }
    }
  );

  // ===========================================================================
  // list_users
  // ===========================================================================
  server.tool(
    'perdoo_list_users',
    `List users in the Perdoo workspace. Returns user IDs needed for assigning leads and contributors to objectives, key results, and KPIs.

Filters:
- is_active: true for active users only, false for deactivated
- name: Search by user name (partial match)

Response includes id, name, email, role for each user.`,
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max results to return (default: 50)'),
      is_active: z
        .boolean()
        .optional()
        .describe('Filter by active status (true = only active users)'),
      name: z
        .string()
        .optional()
        .describe('Search by user name (partial match)'),
    },
    async (params) => {
      logger.debug('list_users tool called', params);

      try {
        const data = await client.listUsers({
          first: params.limit,
          isActive: params.is_active,
          name: params.name,
        });

        const users = data.allUsers.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
          email: edge.node.email,
          role: edge.node.role ?? null,
          is_active: edge.node.isActive ?? null,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ users, count: users.length }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'perdoo_list_users');
      }
    }
  );

  // ===========================================================================
  // list_groups
  // ===========================================================================
  server.tool(
    'perdoo_list_groups',
    `List groups/teams in the Perdoo workspace. Returns group IDs needed for assigning objectives to teams.

Filters:
- name: Search by group name (partial match)
- exclude_archived: true to hide archived groups

Response includes id and name for each group.`,
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max results to return (default: 50)'),
      name: z
        .string()
        .optional()
        .describe('Search by group name (partial match)'),
      exclude_archived: z
        .boolean()
        .optional()
        .describe('Exclude archived groups (default: false)'),
    },
    async (params) => {
      logger.debug('list_groups tool called', params);

      try {
        const data = await client.listGroups({
          first: params.limit,
          name: params.name,
          excludeArchived: params.exclude_archived,
        });

        const groups = data.allGroups.edges.map((edge) => ({
          id: edge.node.id,
          name: edge.node.name,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ groups, count: groups.length }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'perdoo_list_groups');
      }
    }
  );
}
