/**
 * MCP Tools: Releases
 *
 * 5 tools for managing Storyblok releases.
 * All use raw fetch (not in SDK).
 *
 * Releases group content changes for coordinated publishing.
 * Stories can be added to a release, then the release is published as a batch.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers release tools on the MCP server.
 */
export function registerReleaseTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  server.tool(
    'sb_list_releases',
    'List all releases in the space. Optionally filter by branch.',
    {
      branch_id: z.number().int().optional().describe('Filter by branch ID'),
    },
    async (params) => {
      logger.debug('sb_list_releases called', params);
      try {
        const query = params.branch_id ? `?branch_id=${params.branch_id}` : '';
        const data = await client.fetch<{ releases: unknown[] }>(
          `/v1/spaces/${spaceId}/releases${query}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ releases: data.releases || [], count: (data.releases || []).length }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_releases');
      }
    }
  );

  server.tool(
    'sb_get_release',
    'Get a single release by ID.',
    {
      release_id: z.number().int().describe('Release ID'),
    },
    async (params) => {
      logger.debug('sb_get_release called', params);
      try {
        const data = await client.fetch<{ release: unknown }>(
          `/v1/spaces/${spaceId}/releases/${params.release_id}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.release) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_release');
      }
    }
  );

  server.tool(
    'sb_create_release',
    `Create a new release. Releases group content changes for batch publishing.

Optionally schedule with release_at (ISO datetime) and timezone.`,
    {
      name: z.string().describe('Release name'),
      release_at: z.string().optional().describe('Scheduled release datetime (ISO format)'),
      timezone: z.string().optional().describe('Timezone for scheduled release (e.g. "Europe/Amsterdam")'),
      branches_to_deploy: z.array(z.number().int()).optional().describe('Branch IDs to deploy on release'),
      users_to_notify_ids: z.array(z.number().int()).optional().describe('User IDs to notify on release'),
    },
    async (params) => {
      logger.debug('sb_create_release called', { name: params.name });
      try {
        const release: Record<string, unknown> = { name: params.name };
        if (params.release_at !== undefined) release.release_at = params.release_at;
        if (params.timezone !== undefined) release.timezone = params.timezone;
        if (params.branches_to_deploy !== undefined) release.branches_to_deploy = params.branches_to_deploy;
        if (params.users_to_notify_ids !== undefined) release.users_to_notify_ids = params.users_to_notify_ids;

        const data = await client.fetch<{ release: unknown }>(
          `/v1/spaces/${spaceId}/releases`,
          { method: 'POST', body: JSON.stringify({ release }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.release) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_release');
      }
    }
  );

  server.tool(
    'sb_update_release',
    `Update a release. Set do_release=true to publish the release immediately.`,
    {
      release_id: z.number().int().describe('Release ID to update'),
      name: z.string().optional().describe('New name'),
      release_at: z.string().optional().describe('New scheduled datetime'),
      timezone: z.string().optional().describe('Timezone'),
      branches_to_deploy: z.array(z.number().int()).optional().describe('Branch IDs'),
      users_to_notify_ids: z.array(z.number().int()).optional().describe('User IDs to notify'),
      do_release: z.boolean().optional().describe('Set to true to publish the release NOW'),
    },
    async (params) => {
      logger.debug('sb_update_release called', { release_id: params.release_id });
      try {
        const release: Record<string, unknown> = {};
        if (params.name !== undefined) release.name = params.name;
        if (params.release_at !== undefined) release.release_at = params.release_at;
        if (params.timezone !== undefined) release.timezone = params.timezone;
        if (params.branches_to_deploy !== undefined) release.branches_to_deploy = params.branches_to_deploy;
        if (params.users_to_notify_ids !== undefined) release.users_to_notify_ids = params.users_to_notify_ids;

        const payload: Record<string, unknown> = { release };
        if (params.do_release !== undefined) payload.do_release = params.do_release;

        const data = await client.fetch<{ release: unknown }>(
          `/v1/spaces/${spaceId}/releases/${params.release_id}`,
          { method: 'PUT', body: JSON.stringify(payload) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.release) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_release');
      }
    }
  );

  server.tool(
    'sb_delete_release',
    'Delete a release.',
    {
      release_id: z.number().int().describe('Release ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_release called', params);
      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/releases/${params.release_id}`,
          { method: 'DELETE' }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: `Release ${params.release_id} deleted.` }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_release');
      }
    }
  );
}
