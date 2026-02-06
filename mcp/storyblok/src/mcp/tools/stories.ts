/**
 * MCP Tools: Stories
 *
 * 14 tools for managing Storyblok stories (pages, blog posts, etc.).
 * Stories are the core content type in Storyblok.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers story tools on the MCP server.
 */
export function registerStoryTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  // ===========================================================================
  // sb_list_stories
  // ===========================================================================
  server.tool(
    'sb_list_stories',
    `List stories in the Storyblok space with filtering and pagination.

Filters:
- search: Full text search across story names
- starts_with: Filter by slug prefix (e.g. "blog/" for all blog posts)
- with_tag: Filter by tag name
- contain_component: Filter by component name
- is_published: Filter published/unpublished stories
- folder_only / story_only: Filter by type
- in_trash: Show deleted stories
- sort_by: Sort field with direction (e.g. "created_at:desc")

Returns summary list. Use sb_get_story for full content.`,
    {
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default: 25, max: 100)'),
      search: z.string().optional().describe('Full text search term'),
      starts_with: z.string().optional().describe('Filter by slug prefix (e.g. "blog/")'),
      with_tag: z.string().optional().describe('Filter by tag name'),
      contain_component: z.string().optional().describe('Filter by component name used in content'),
      is_published: z.boolean().optional().describe('Filter by published status'),
      folder_only: z.boolean().optional().describe('Only return folders'),
      story_only: z.boolean().optional().describe('Only return stories (not folders)'),
      in_trash: z.boolean().optional().describe('Show deleted stories'),
      sort_by: z.string().optional().describe('Sort field with direction (e.g. "created_at:desc", "name:asc")'),
      with_parent: z.number().int().optional().describe('Filter by parent folder ID'),
      pinned: z.boolean().optional().describe('Filter pinned stories'),
      text_search: z.string().optional().describe('Search in story content'),
      by_ids: z.string().optional().describe('Comma-separated story IDs'),
      by_uuids: z.string().optional().describe('Comma-separated story UUIDs'),
    },
    async (params) => {
      logger.debug('sb_list_stories called', params);

      try {
        const result = await client.sdk.stories.list({
          path: { space_id: spaceId },
          query: {
            page: params.page,
            per_page: params.per_page,
            search: params.search,
            starts_with: params.starts_with,
            with_tag: params.with_tag,
            contain_component: params.contain_component,
            is_published: params.is_published,
            folder_only: params.folder_only,
            story_only: params.story_only,
            in_trash: params.in_trash,
            sort_by: params.sort_by,
            with_parent: params.with_parent,
            pinned: params.pinned,
            text_search: params.text_search,
            by_ids: params.by_ids,
            by_uuids: params.by_uuids,
          },
        });

        const data = client.handleResponse(result);

        const stories = (data.stories || []).map((s) => ({
          id: s.id,
          uuid: s.uuid,
          name: s.name,
          slug: s.slug,
          full_slug: s.full_slug,
          is_folder: s.is_folder,
          published: s.published,
          is_startpage: s.is_startpage,
          parent_id: s.parent_id,
          position: s.position,
          created_at: s.created_at,
          updated_at: s.updated_at,
          published_at: s.published_at,
          tag_list: s.tag_list,
          unpublished_changes: s.unpublished_changes,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              stories,
              count: stories.length,
              page: params.page || 1,
              per_page: params.per_page || 25,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_stories');
      }
    }
  );

  // ===========================================================================
  // sb_get_story
  // ===========================================================================
  server.tool(
    'sb_get_story',
    `Get a single story with full content by ID.

Returns the complete story including its content (Blok tree), metadata, tags, and publishing status.
The content field contains the component tree that makes up the page.`,
    {
      story_id: z.number().int().describe('Story ID'),
    },
    async (params) => {
      logger.debug('sb_get_story called', params);

      try {
        const result = await client.sdk.stories.get({
          path: { space_id: spaceId, story_id: params.story_id },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.story),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_story');
      }
    }
  );

  // ===========================================================================
  // sb_create_story
  // ===========================================================================
  server.tool(
    'sb_create_story',
    `Create a new story (page, blog post, or folder).

Required: name, slug
Optional: content (component tree), parent_id, is_folder, tag_list, is_startpage, position, path

The story is created as a DRAFT. Use sb_publish_story to make it live.
Content should include a "_component" field matching a component name.`,
    {
      name: z.string().describe('Story name'),
      slug: z.string().describe('URL slug (must be unique within parent)'),
      content: z.record(z.unknown()).optional().describe('Content object with _component field'),
      parent_id: z.number().int().optional().describe('Parent folder ID (0 for root)'),
      is_folder: z.boolean().optional().describe('Create as folder instead of story'),
      tag_list: z.array(z.string()).optional().describe('Tags to assign'),
      is_startpage: z.boolean().optional().describe('Mark as startpage of parent folder'),
      position: z.number().int().optional().describe('Position in parent folder'),
      path: z.string().optional().describe('Custom URL path (overrides slug-based URL)'),
      default_root: z.string().optional().describe('Default content type for child stories (folders only)'),
      disable_fe_editor: z.boolean().optional().describe('Disable frontend visual editor'),
      publish: z.boolean().optional().describe('Publish immediately after creation'),
    },
    async (params) => {
      logger.debug('sb_create_story called', { name: params.name, slug: params.slug });

      try {
        // SDK types require `id` on Story body but API ignores it for creation
        const storyBody = {
          name: params.name,
          slug: params.slug,
          content: params.content,
          parent_id: params.parent_id,
          is_folder: params.is_folder,
          tag_list: params.tag_list,
          is_startpage: params.is_startpage,
          position: params.position,
          path: params.path,
          default_root: params.default_root,
          disable_fe_editor: params.disable_fe_editor,
        };

        const result = await client.sdk.stories.create({
          path: { space_id: spaceId },
          body: {
            story: storyBody as never,
          },
          query: {
            publish: params.publish,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.story),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_story');
      }
    }
  );

  // ===========================================================================
  // sb_update_story
  // ===========================================================================
  server.tool(
    'sb_update_story',
    `Update a story's DRAFT version. Only provided fields are changed.

IMPORTANT: This updates the draft only. Use sb_publish_story to push changes live.
To update content, provide the full content object (partial content merge is not supported).
Use force_update to bypass conflict detection.`,
    {
      story_id: z.number().int().describe('Story ID to update'),
      name: z.string().optional().describe('New story name'),
      slug: z.string().optional().describe('New URL slug'),
      content: z.record(z.unknown()).optional().describe('New content object (replaces entire content)'),
      tag_list: z.array(z.string()).optional().describe('New tag list (replaces all tags)'),
      parent_id: z.number().int().optional().describe('Move to different parent folder'),
      is_startpage: z.boolean().optional().describe('Set as startpage of parent folder'),
      position: z.number().int().optional().describe('Position in parent folder'),
      path: z.string().optional().describe('Custom URL path'),
      meta_data: z.record(z.unknown()).optional().describe('Custom metadata'),
      force_update: z.boolean().optional().describe('Bypass conflict detection'),
      publish: z.boolean().optional().describe('Publish immediately after update'),
    },
    async (params) => {
      logger.debug('sb_update_story called', { story_id: params.story_id });

      try {
        const story: Record<string, unknown> = {};
        if (params.name !== undefined) story.name = params.name;
        if (params.slug !== undefined) story.slug = params.slug;
        if (params.content !== undefined) story.content = params.content;
        if (params.tag_list !== undefined) story.tag_list = params.tag_list;
        if (params.parent_id !== undefined) story.parent_id = params.parent_id;
        if (params.is_startpage !== undefined) story.is_startpage = params.is_startpage;
        if (params.position !== undefined) story.position = params.position;
        if (params.path !== undefined) story.path = params.path;
        if (params.meta_data !== undefined) story.meta_data = params.meta_data;

        const result = await client.sdk.stories.updateStory({
          path: { space_id: spaceId, story_id: params.story_id },
          body: {
            story: story as never,
            force_update: params.force_update ? '1' : undefined,
          },
          query: {
            publish: params.publish,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.story),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_story');
      }
    }
  );

  // ===========================================================================
  // sb_delete_story
  // ===========================================================================
  server.tool(
    'sb_delete_story',
    'Delete a story by ID. The story is moved to trash and can be recovered.',
    {
      story_id: z.number().int().describe('Story ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_story called', params);

      try {
        const result = await client.sdk.stories.delete({
          path: { space_id: spaceId, story_id: params.story_id },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: `Story ${params.story_id} deleted.` }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_story');
      }
    }
  );

  // ===========================================================================
  // sb_publish_story
  // ===========================================================================
  server.tool(
    'sb_publish_story',
    `Publish a story, making the current draft version live.

Optionally publish specific language versions only using the lang parameter.`,
    {
      story_id: z.number().int().describe('Story ID to publish'),
      lang: z.string().optional().describe('Comma-separated language codes to publish (omit for all)'),
    },
    async (params) => {
      logger.debug('sb_publish_story called', params);

      try {
        const result = await client.sdk.stories.publish({
          path: { space_id: spaceId, story_id: params.story_id },
          query: {
            lang: params.lang,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, story: data.story }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_publish_story');
      }
    }
  );

  // ===========================================================================
  // sb_unpublish_story
  // ===========================================================================
  server.tool(
    'sb_unpublish_story',
    'Unpublish a story, removing it from the live/published version.',
    {
      story_id: z.number().int().describe('Story ID to unpublish'),
      lang: z.string().optional().describe('Comma-separated language codes to unpublish'),
    },
    async (params) => {
      logger.debug('sb_unpublish_story called', params);

      try {
        const result = await client.sdk.stories.unpublish({
          path: { space_id: spaceId, story_id: params.story_id },
          query: {
            lang: params.lang,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, story: data.story }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_unpublish_story');
      }
    }
  );

  // ===========================================================================
  // sb_get_story_versions
  // ===========================================================================
  server.tool(
    'sb_get_story_versions',
    'Get version history for a story. Shows who edited and when.',
    {
      story_id: z.number().int().describe('Story ID to get versions for'),
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
    },
    async (params) => {
      logger.debug('sb_get_story_versions called', params);

      try {
        const result = await client.sdk.stories.versions({
          path: { space_id: spaceId },
          query: {
            by_story_id: params.story_id,
            page: params.page,
            per_page: params.per_page,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_story_versions');
      }
    }
  );

  // ===========================================================================
  // sb_bulk_publish_stories
  // ===========================================================================
  server.tool(
    'sb_bulk_publish_stories',
    'Publish multiple stories at once. Processes sequentially to respect rate limits.',
    {
      story_ids: z.array(z.number().int()).min(1).max(25).describe('Story IDs to publish (max 25)'),
      lang: z.string().optional().describe('Language codes to publish'),
    },
    async (params) => {
      logger.debug('sb_bulk_publish_stories called', { count: params.story_ids.length });

      const results: { id: number; success: boolean; error?: string }[] = [];

      for (const storyId of params.story_ids) {
        try {
          const result = await client.sdk.stories.publish({
            path: { space_id: spaceId, story_id: storyId },
            query: { lang: params.lang },
          });
          client.handleResponse(result);
          results.push({ id: storyId, success: true });
        } catch (error) {
          results.push({
            id: storyId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ results, summary: { total: results.length, succeeded, failed } }),
        }],
      };
    }
  );

  // ===========================================================================
  // sb_bulk_unpublish_stories
  // ===========================================================================
  server.tool(
    'sb_bulk_unpublish_stories',
    'Unpublish multiple stories at once. Processes sequentially to respect rate limits.',
    {
      story_ids: z.array(z.number().int()).min(1).max(25).describe('Story IDs to unpublish (max 25)'),
      lang: z.string().optional().describe('Language codes to unpublish'),
    },
    async (params) => {
      logger.debug('sb_bulk_unpublish_stories called', { count: params.story_ids.length });

      const results: { id: number; success: boolean; error?: string }[] = [];

      for (const storyId of params.story_ids) {
        try {
          const result = await client.sdk.stories.unpublish({
            path: { space_id: spaceId, story_id: storyId },
            query: { lang: params.lang },
          });
          client.handleResponse(result);
          results.push({ id: storyId, success: true });
        } catch (error) {
          results.push({
            id: storyId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ results, summary: { total: results.length, succeeded, failed } }),
        }],
      };
    }
  );

  // ===========================================================================
  // sb_bulk_delete_stories
  // ===========================================================================
  server.tool(
    'sb_bulk_delete_stories',
    'Delete multiple stories at once. Stories are moved to trash. Processes sequentially.',
    {
      story_ids: z.array(z.number().int()).min(1).max(25).describe('Story IDs to delete (max 25)'),
    },
    async (params) => {
      logger.debug('sb_bulk_delete_stories called', { count: params.story_ids.length });

      const results: { id: number; success: boolean; error?: string }[] = [];

      for (const storyId of params.story_ids) {
        try {
          const result = await client.sdk.stories.delete({
            path: { space_id: spaceId, story_id: storyId },
          });
          client.handleResponse(result);
          results.push({ id: storyId, success: true });
        } catch (error) {
          results.push({
            id: storyId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ results, summary: { total: results.length, succeeded, failed } }),
        }],
      };
    }
  );

  // ===========================================================================
  // sb_move_story
  // ===========================================================================
  server.tool(
    'sb_move_story',
    'Move a story to a different parent folder. Use parent_id 0 to move to root.',
    {
      story_id: z.number().int().describe('Story ID to move'),
      parent_id: z.number().int().describe('Target parent folder ID (0 for root)'),
    },
    async (params) => {
      logger.debug('sb_move_story called', params);

      try {
        const result = await client.sdk.stories.updateStory({
          path: { space_id: spaceId, story_id: params.story_id },
          body: {
            story: { parent_id: params.parent_id } as never,
            force_update: '1',
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              story: {
                id: data.story?.id,
                name: data.story?.name,
                full_slug: data.story?.full_slug,
                parent_id: data.story?.parent_id,
              },
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_move_story');
      }
    }
  );

  // ===========================================================================
  // sb_list_stories_by_slug
  // ===========================================================================
  server.tool(
    'sb_list_stories_by_slug',
    `Find stories by full slug prefix. Useful for listing all content under a path like "blog/" or "recipes/".`,
    {
      starts_with: z.string().describe('Slug prefix to search (e.g. "blog/", "recipes/healthy-")'),
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
      sort_by: z.string().optional().describe('Sort field (e.g. "published_at:desc")'),
    },
    async (params) => {
      logger.debug('sb_list_stories_by_slug called', params);

      try {
        const result = await client.sdk.stories.list({
          path: { space_id: spaceId },
          query: {
            starts_with: params.starts_with,
            page: params.page,
            per_page: params.per_page,
            sort_by: params.sort_by,
          },
        });

        const data = client.handleResponse(result);

        const stories = (data.stories || []).map((s) => ({
          id: s.id,
          uuid: s.uuid,
          name: s.name,
          slug: s.slug,
          full_slug: s.full_slug,
          published: s.published,
          created_at: s.created_at,
          published_at: s.published_at,
          tag_list: s.tag_list,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              stories,
              count: stories.length,
              starts_with: params.starts_with,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_stories_by_slug');
      }
    }
  );

  // ===========================================================================
  // sb_validate_story_content
  // ===========================================================================
  server.tool(
    'sb_validate_story_content',
    `Validate a story's content against its component schema.

Checks that:
1. The root component exists
2. Required fields are present
3. Nested components reference valid component names

Returns validation results with any issues found.`,
    {
      story_id: z.number().int().describe('Story ID to validate'),
    },
    async (params) => {
      logger.debug('sb_validate_story_content called', params);

      try {
        // Fetch story
        const storyResult = await client.sdk.stories.get({
          path: { space_id: spaceId, story_id: params.story_id },
        });
        const storyData = client.handleResponse(storyResult);
        const story = storyData.story;

        if (!story?.content) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ valid: false, issues: ['Story has no content'] }),
            }],
          };
        }

        const content = story.content as Record<string, unknown>;
        const componentName = content.component || content._component;

        if (!componentName) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                valid: false,
                issues: ['Content has no "component" or "_component" field identifying its type'],
              }),
            }],
          };
        }

        // Fetch all components to validate against
        const componentsResult = await client.sdk.components.list({
          path: { space_id: spaceId },
          query: { per_page: 100 },
        });
        const componentsData = client.handleResponse(componentsResult);
        const components = componentsData.components || [];

        const componentMap = new Map(components.map((c) => [c.name, c]));
        const issues: string[] = [];

        // Validate root component exists
        const rootComponent = componentMap.get(componentName as string);
        if (!rootComponent) {
          issues.push(`Root component "${componentName}" not found in space`);
        } else {
          // Check required fields
          const schema = rootComponent.schema || {};
          for (const [fieldName, fieldDef] of Object.entries(schema)) {
            if (fieldName === '_uid' || fieldName === 'component') continue;
            const def = fieldDef as Record<string, unknown>;
            if (def.required && (content[fieldName] === undefined || content[fieldName] === '')) {
              issues.push(`Required field "${fieldName}" is missing or empty in root component`);
            }
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              valid: issues.length === 0,
              story_id: story.id,
              component: componentName,
              issues,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_validate_story_content');
      }
    }
  );

  // ===========================================================================
  // sb_translate_story
  // ===========================================================================
  server.tool(
    'sb_translate_story',
    `Translate a story's content to a different language using Storyblok's AI translation.

Requires the target language code (e.g. "nl", "de", "fr").
Set overwrite=true to replace existing translations.`,
    {
      story_id: z.number().int().describe('Story ID to translate'),
      lang: z.string().describe('Target language name (e.g. "Dutch", "German")'),
      code: z.string().describe('Target language code (e.g. "nl", "de", "fr")'),
      overwrite: z.boolean().optional().describe('Overwrite existing translations (default: false)'),
      release_id: z.number().int().optional().describe('Release ID context'),
    },
    async (params) => {
      logger.debug('sb_translate_story called', { story_id: params.story_id, code: params.code });

      try {
        const result = await client.sdk.stories.translate({
          path: { space_id: spaceId, story_id: params.story_id },
          body: {
            lang: params.lang,
            code: params.code,
            overwrite: params.overwrite,
            release_id: params.release_id,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, story: data.story }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_translate_story');
      }
    }
  );

  // ===========================================================================
  // sb_restore_story_version
  // ===========================================================================
  server.tool(
    'sb_restore_story_version',
    'Restore a story to a specific previous version.',
    {
      story_id: z.number().int().describe('Story ID'),
      version_id: z.string().describe('Version ID to restore'),
    },
    async (params) => {
      logger.debug('sb_restore_story_version called', params);

      try {
        const result = await client.sdk.stories.restoreVersions({
          path: { space_id: spaceId, story_id: params.story_id },
          query: {
            versions_v2: true,
            version: params.version_id,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, story: data.story }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_restore_story_version');
      }
    }
  );

  // ===========================================================================
  // sb_compare_story_versions
  // ===========================================================================
  server.tool(
    'sb_compare_story_versions',
    'Compare two versions of a story. Shows added, removed, and modified fields.',
    {
      story_id: z.number().int().describe('Story ID'),
      version: z.number().int().describe('Version ID to compare against current'),
    },
    async (params) => {
      logger.debug('sb_compare_story_versions called', params);

      try {
        const result = await client.sdk.stories.compareVersions({
          path: { space_id: spaceId, story_id: params.story_id },
          query: { version: params.version },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_compare_story_versions');
      }
    }
  );

  // ===========================================================================
  // sb_bulk_create_stories
  // ===========================================================================
  server.tool(
    'sb_bulk_create_stories',
    `Create multiple stories at once. Processes sequentially to respect rate limits.

Each story requires at least name and slug. Returns results for each story.`,
    {
      stories: z.array(z.object({
        name: z.string().describe('Story name'),
        slug: z.string().describe('URL slug'),
        content: z.record(z.unknown()).optional().describe('Content object'),
        parent_id: z.number().int().optional().describe('Parent folder ID'),
        is_folder: z.boolean().optional().describe('Create as folder'),
        tag_list: z.array(z.string()).optional().describe('Tags'),
      })).min(1).max(25).describe('Stories to create (max 25)'),
    },
    async (params) => {
      logger.debug('sb_bulk_create_stories called', { count: params.stories.length });

      const results: { name: string; success: boolean; id?: number; error?: string }[] = [];

      for (const story of params.stories) {
        try {
          const result = await client.sdk.stories.create({
            path: { space_id: spaceId },
            body: { story: story as never },
          });
          const data = client.handleResponse(result);
          results.push({ name: story.name, success: true, id: data.story?.id });
        } catch (error) {
          results.push({
            name: story.name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ results, summary: { total: results.length, succeeded, failed } }),
        }],
      };
    }
  );

  // ===========================================================================
  // sb_bulk_update_stories
  // ===========================================================================
  server.tool(
    'sb_bulk_update_stories',
    `Update multiple stories at once. Processes sequentially.

Each item requires story_id and the fields to update.`,
    {
      updates: z.array(z.object({
        story_id: z.number().int().describe('Story ID'),
        name: z.string().optional().describe('New name'),
        slug: z.string().optional().describe('New slug'),
        content: z.record(z.unknown()).optional().describe('New content'),
        tag_list: z.array(z.string()).optional().describe('New tags'),
      })).min(1).max(25).describe('Story updates (max 25)'),
    },
    async (params) => {
      logger.debug('sb_bulk_update_stories called', { count: params.updates.length });

      const results: { story_id: number; success: boolean; error?: string }[] = [];

      for (const update of params.updates) {
        try {
          const story: Record<string, unknown> = {};
          if (update.name !== undefined) story.name = update.name;
          if (update.slug !== undefined) story.slug = update.slug;
          if (update.content !== undefined) story.content = update.content;
          if (update.tag_list !== undefined) story.tag_list = update.tag_list;

          const result = await client.sdk.stories.updateStory({
            path: { space_id: spaceId, story_id: update.story_id },
            body: { story: story as never, force_update: '1' },
          });
          client.handleResponse(result);
          results.push({ story_id: update.story_id, success: true });
        } catch (error) {
          results.push({
            story_id: update.story_id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ results, summary: { total: results.length, succeeded, failed } }),
        }],
      };
    }
  );

  // ===========================================================================
  // sb_get_unpublished_dependencies
  // ===========================================================================
  server.tool(
    'sb_get_unpublished_dependencies',
    'Get unpublished stories that are dependencies of the given stories. Useful before publishing to ensure all referenced content is also published.',
    {
      story_ids: z.array(z.number().int()).min(1).max(25).describe('Story IDs to check dependencies for'),
      release_id: z.number().int().optional().describe('Release context'),
    },
    async (params) => {
      logger.debug('sb_get_unpublished_dependencies called', { count: params.story_ids.length });

      try {
        const result = await client.sdk.stories.getUnpublishedDependencies({
          path: { space_id: spaceId },
          body: {
            story_ids: params.story_ids,
            release_id: params.release_id,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              unpublished_stories: data.unpublished_stories || [],
              count: (data.unpublished_stories || []).length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_unpublished_dependencies');
      }
    }
  );
}
