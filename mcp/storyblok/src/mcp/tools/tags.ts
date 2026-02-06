/**
 * MCP Tools: Internal Tags
 *
 * 4 tools for managing Storyblok internal tags.
 * Internal tags are used to organize components and assets in the Storyblok UI.
 * These are different from story tags (tag_list), which are plain strings.
 *
 * Uses the SDK's internalTags resource.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers internal tag tools on the MCP server.
 */
export function registerTagTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  // ===========================================================================
  // sb_list_tags
  // ===========================================================================
  server.tool(
    'sb_list_tags',
    `List internal tags. Internal tags organize components and assets in the Storyblok UI.

NOTE: These are different from story tags (tag_list on stories). Story tags are plain strings,
while internal tags have an ID and are typed as "asset" or "component".

Filters:
- search: Search by tag name
- by_object_type: Filter by "asset" or "component"`,
    {
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
      search: z.string().optional().describe('Search by tag name'),
      by_object_type: z.enum(['asset', 'component']).optional().describe('Filter by object type'),
    },
    async (params) => {
      logger.debug('sb_list_tags called', params);

      try {
        const result = await client.sdk.internalTags.list({
          path: { space_id: spaceId },
          query: {
            page: params.page,
            per_page: params.per_page,
            search: params.search,
            by_object_type: params.by_object_type,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              internal_tags: data.internal_tags || [],
              count: (data.internal_tags || []).length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_tags');
      }
    }
  );

  // ===========================================================================
  // sb_create_tag
  // ===========================================================================
  server.tool(
    'sb_create_tag',
    'Create a new internal tag for organizing assets or components.',
    {
      name: z.string().describe('Tag name'),
      object_type: z.enum(['asset', 'component']).describe('What this tag is for: "asset" or "component"'),
    },
    async (params) => {
      logger.debug('sb_create_tag called', { name: params.name });

      try {
        // SDK types require `id` but API ignores it for creation
        const result = await client.sdk.internalTags.create({
          path: { space_id: spaceId },
          body: { name: params.name, object_type: params.object_type } as never,
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.internal_tag),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_tag');
      }
    }
  );

  // ===========================================================================
  // sb_update_tag
  // ===========================================================================
  server.tool(
    'sb_update_tag',
    'Update an internal tag name.',
    {
      tag_id: z.number().int().describe('Internal tag ID'),
      name: z.string().describe('New tag name'),
      object_type: z.enum(['asset', 'component']).describe('Object type (must match existing)'),
    },
    async (params) => {
      logger.debug('sb_update_tag called', { tag_id: params.tag_id });

      try {
        const result = await client.sdk.internalTags.update({
          path: { space_id: spaceId, internal_tag_id: params.tag_id },
          body: { name: params.name, object_type: params.object_type } as never,
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.internal_tag),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_tag');
      }
    }
  );

  // ===========================================================================
  // sb_delete_tag
  // ===========================================================================
  server.tool(
    'sb_delete_tag',
    'Delete an internal tag. This removes the tag from all associated assets or components.',
    {
      tag_id: z.number().int().describe('Internal tag ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_tag called', params);

      try {
        const result = await client.sdk.internalTags.delete({
          path: { space_id: spaceId, internal_tag_id: params.tag_id },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: `Internal tag ${params.tag_id} deleted.` }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_tag');
      }
    }
  );

  // ===========================================================================
  // STORY TAGS (raw fetch - different from internal tags)
  // Story tags are strings applied to stories via tag_list.
  // The /tags/ endpoint manages these independently.
  // ===========================================================================

  server.tool(
    'sb_list_story_tags',
    `List all story tags in the space. Story tags are strings used on stories (tag_list field).
Different from internal tags which organize components/assets.`,
    {
      search: z.string().optional().describe('Search by tag name'),
    },
    async (params) => {
      logger.debug('sb_list_story_tags called', params);

      try {
        const query = params.search ? `?search=${encodeURIComponent(params.search)}` : '';
        const data = await client.fetch<{ tags: unknown[] }>(
          `/v1/spaces/${spaceId}/tags${query}`
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ tags: data.tags || [], count: (data.tags || []).length }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_story_tags');
      }
    }
  );

  server.tool(
    'sb_create_story_tag',
    'Create a new story tag. Optionally associate it with a story immediately.',
    {
      name: z.string().describe('Tag name'),
      story_id: z.number().int().optional().describe('Optionally associate with a story'),
    },
    async (params) => {
      logger.debug('sb_create_story_tag called', { name: params.name });

      try {
        const tag: Record<string, unknown> = { name: params.name };
        if (params.story_id !== undefined) tag.story_id = params.story_id;

        const data = await client.fetch<{ tag: unknown }>(
          `/v1/spaces/${spaceId}/tags`,
          { method: 'POST', body: JSON.stringify({ tag }) }
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.tag),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_story_tag');
      }
    }
  );

  server.tool(
    'sb_update_story_tag',
    'Rename a story tag.',
    {
      tag_id: z.string().describe('Tag ID'),
      name: z.string().describe('New tag name'),
    },
    async (params) => {
      logger.debug('sb_update_story_tag called', { tag_id: params.tag_id });

      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/tags/${params.tag_id}`,
          { method: 'PUT', body: JSON.stringify({ tag: { name: params.name } }) }
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Tag updated.' }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_story_tag');
      }
    }
  );

  server.tool(
    'sb_delete_story_tag',
    'Delete a story tag.',
    {
      tag_id: z.string().describe('Tag ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_story_tag called', params);

      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/tags/${params.tag_id}`,
          { method: 'DELETE' }
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Tag deleted.' }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_story_tag');
      }
    }
  );

  server.tool(
    'sb_bulk_tag_stories',
    `Bulk associate tags with multiple stories at once.

Each item in the stories array should have an id and tag_list.
Example: [{ "id": 123, "tag_list": ["featured", "blog"] }]`,
    {
      stories: z.array(z.object({
        id: z.number().int().describe('Story ID'),
        tag_list: z.array(z.string()).describe('Tags to assign'),
      })).min(1).max(50).describe('Stories with tags (max 50)'),
    },
    async (params) => {
      logger.debug('sb_bulk_tag_stories called', { count: params.stories.length });

      try {
        const data = await client.fetch<unknown>(
          `/v1/spaces/${spaceId}/tags/bulk_association`,
          {
            method: 'POST',
            body: JSON.stringify({ tags: { stories: params.stories } }),
          }
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, result: data }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_bulk_tag_stories');
      }
    }
  );
}
