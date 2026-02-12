/**
 * MCP Tools: Approvals
 *
 * 5 tools for managing Storyblok content approvals.
 * All use raw fetch (not in SDK).
 *
 * Approvals are part of the editorial workflow - request someone
 * to review and approve content before publishing.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers approval tools on the MCP server.
 */
export function registerApprovalTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  server.tool(
    'sb_list_approvals',
    'List approvals. Requires an approver user ID to filter.',
    {
      approver: z.number().int().describe('Approver user ID (required)'),
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
    },
    async (params) => {
      logger.debug('sb_list_approvals called', params);
      try {
        const queryParts: string[] = [`approver=${params.approver}`];
        if (params.page !== undefined) queryParts.push(`page=${params.page}`);
        if (params.per_page !== undefined) queryParts.push(`per_page=${params.per_page}`);
        const query = `?${queryParts.join('&')}`;

        const data = await client.fetch<{ approvals: unknown[] }>(
          `/v1/spaces/${spaceId}/approvals${query}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ approvals: data.approvals || [], count: (data.approvals || []).length }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_approvals');
      }
    }
  );

  server.tool(
    'sb_get_approval',
    'Get a single approval by ID.',
    {
      approval_id: z.number().int().describe('Approval ID'),
    },
    async (params) => {
      logger.debug('sb_get_approval called', params);
      try {
        const data = await client.fetch<{ approval: unknown }>(
          `/v1/spaces/${spaceId}/approvals/${params.approval_id}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.approval) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_approval');
      }
    }
  );

  server.tool(
    'sb_create_approval',
    'Request approval for a story from a specific user.',
    {
      story_id: z.number().int().describe('Story ID to request approval for'),
      approver_id: z.number().int().describe('User ID of the approver'),
    },
    async (params) => {
      logger.debug('sb_create_approval called', params);
      try {
        const data = await client.fetch<{ approval: unknown }>(
          `/v1/spaces/${spaceId}/approvals`,
          {
            method: 'POST',
            body: JSON.stringify({
              approval: {
                story_id: params.story_id,
                approver_id: params.approver_id,
              },
            }),
          }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.approval) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_approval');
      }
    }
  );

  server.tool(
    'sb_create_release_approval',
    'Request approval for a story within a specific release.',
    {
      story_id: z.number().int().describe('Story ID'),
      approver_id: z.number().int().describe('Approver user ID'),
      release_id: z.number().int().optional().describe('Release ID'),
    },
    async (params) => {
      logger.debug('sb_create_release_approval called', params);
      try {
        const payload: Record<string, unknown> = {
          approval: {
            story_id: params.story_id,
            approver_id: params.approver_id,
          },
        };
        if (params.release_id !== undefined) payload.release_id = params.release_id;

        const data = await client.fetch<{ approval: unknown }>(
          `/v1/spaces/${spaceId}/approvals`,
          { method: 'POST', body: JSON.stringify(payload) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.approval) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_release_approval');
      }
    }
  );

  server.tool(
    'sb_delete_approval',
    'Delete (cancel) an approval request.',
    {
      approval_id: z.number().int().describe('Approval ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_approval called', params);
      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/approvals/${params.approval_id}`,
          { method: 'DELETE' }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: `Approval ${params.approval_id} deleted.` }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_approval');
      }
    }
  );
}
