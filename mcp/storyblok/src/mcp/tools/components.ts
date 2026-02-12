/**
 * MCP Tools: Components
 *
 * 7 tools for managing Storyblok components (content type schemas).
 * Components define the structure and fields available for stories.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers component tools on the MCP server.
 */
export function registerComponentTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  // ===========================================================================
  // sb_list_components
  // ===========================================================================
  server.tool(
    'sb_list_components',
    `List all components (content type schemas) in the space.

Filters:
- search: Search by name or display_name
- is_root: Filter root-level components (usable as story content types)
- in_group: Filter by component group UUID

Returns component definitions with their schema fields.`,
    {
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
      search: z.string().optional().describe('Search by component name or display_name'),
      is_root: z.boolean().optional().describe('Filter root components only'),
      in_group: z.string().optional().describe('Filter by component group UUID'),
      by_ids: z.string().optional().describe('Comma-separated component IDs'),
    },
    async (params) => {
      logger.debug('sb_list_components called', params);

      try {
        const result = await client.sdk.components.list({
          path: { space_id: spaceId },
          query: {
            page: params.page,
            per_page: params.per_page,
            search: params.search,
            is_root: params.is_root,
            in_group: params.in_group,
            by_ids: params.by_ids,
          },
        });

        const data = client.handleResponse(result);

        const components = (data.components || []).map((c) => ({
          id: c.id,
          name: c.name,
          display_name: c.display_name,
          is_root: c.is_root,
          is_nestable: c.is_nestable,
          schema_field_count: Object.keys(c.schema || {}).length,
          component_group_uuid: c.component_group_uuid,
          created_at: c.created_at,
          updated_at: c.updated_at,
          color: c.color,
          icon: c.icon,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ components, count: components.length }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_components');
      }
    }
  );

  // ===========================================================================
  // sb_get_component
  // ===========================================================================
  server.tool(
    'sb_get_component',
    `Get a single component with its full schema definition.

Returns the component including all field definitions (schema), presets, and metadata.
The schema object maps field names to their type definitions.`,
    {
      component_id: z.number().int().describe('Component ID'),
    },
    async (params) => {
      logger.debug('sb_get_component called', params);

      try {
        const result = await client.sdk.components.get({
          path: { space_id: spaceId, component_id: params.component_id },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.component),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_component');
      }
    }
  );

  // ===========================================================================
  // sb_create_component
  // ===========================================================================
  server.tool(
    'sb_create_component',
    `Create a new component (content type schema).

The schema defines the fields available when using this component in stories.
Each schema field is an object with at least a "type" property.

Common field types: "text", "textarea", "richtext", "markdown", "number",
"datetime", "boolean", "image", "asset", "multiasset", "multilink",
"bloks" (nested components), "option" (single select), "options" (multi select),
"section_group" (visual grouping), "tab" (tab grouping).

Example schema:
{
  "title": { "type": "text", "pos": 0, "required": true },
  "body": { "type": "richtext", "pos": 1 },
  "image": { "type": "asset", "pos": 2, "filetypes": ["images"] }
}`,
    {
      name: z.string().describe('Technical name (lowercase, no spaces, used in content.component)'),
      display_name: z.string().optional().describe('Human-readable display name'),
      schema: z.record(z.unknown()).describe('Field definitions object'),
      is_root: z.boolean().optional().describe('Can be used as root component for stories'),
      is_nestable: z.boolean().optional().describe('Can be nested inside other components'),
      image: z.string().optional().describe('Preview image URL'),
      color: z.string().optional().describe('Color in the UI (hex)'),
      icon: z.string().optional().describe('Icon name'),
      component_group_uuid: z.string().optional().describe('Group UUID to organize components'),
    },
    async (params) => {
      logger.debug('sb_create_component called', { name: params.name });

      try {
        // SDK types require `id` and timestamps but API ignores them for creation
        const componentBody = {
          name: params.name,
          display_name: params.display_name,
          schema: params.schema,
          is_root: params.is_root,
          is_nestable: params.is_nestable,
          image: params.image,
          color: params.color,
          icon: params.icon,
          component_group_uuid: params.component_group_uuid,
        };

        const result = await client.sdk.components.create({
          path: { space_id: spaceId },
          body: {
            component: componentBody as never,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.component),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_component');
      }
    }
  );

  // ===========================================================================
  // sb_update_component
  // ===========================================================================
  server.tool(
    'sb_update_component',
    `Update a component's schema or settings. Only provided fields are changed.

WARNING: Updating schema may affect existing stories using this component.
When updating schema, provide the complete schema object (it replaces the existing one).`,
    {
      component_id: z.number().int().describe('Component ID to update'),
      display_name: z.string().optional().describe('New display name'),
      schema: z.record(z.unknown()).optional().describe('New schema (replaces existing)'),
      is_root: z.boolean().optional().describe('Root component flag'),
      is_nestable: z.boolean().optional().describe('Nestable flag'),
      image: z.string().optional().describe('Preview image URL'),
      color: z.string().optional().describe('UI color (hex)'),
      icon: z.string().optional().describe('Icon name'),
      component_group_uuid: z.string().optional().describe('Component group UUID'),
    },
    async (params) => {
      logger.debug('sb_update_component called', { component_id: params.component_id });

      try {
        const component: Record<string, unknown> = {};
        if (params.display_name !== undefined) component.display_name = params.display_name;
        if (params.schema !== undefined) component.schema = params.schema;
        if (params.is_root !== undefined) component.is_root = params.is_root;
        if (params.is_nestable !== undefined) component.is_nestable = params.is_nestable;
        if (params.image !== undefined) component.image = params.image;
        if (params.color !== undefined) component.color = params.color;
        if (params.icon !== undefined) component.icon = params.icon;
        if (params.component_group_uuid !== undefined) component.component_group_uuid = params.component_group_uuid;

        const result = await client.sdk.components.update({
          path: { space_id: spaceId, component_id: params.component_id },
          body: {
            component: component as never,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.component),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_component');
      }
    }
  );

  // ===========================================================================
  // sb_delete_component
  // ===========================================================================
  server.tool(
    'sb_delete_component',
    'Delete a component. WARNING: This affects all stories using this component.',
    {
      component_id: z.number().int().describe('Component ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_component called', params);

      try {
        const result = await client.sdk.components.deleteComponent({
          path: { space_id: spaceId, component_id: params.component_id },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: `Component ${params.component_id} deleted.` }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_component');
      }
    }
  );

  // ===========================================================================
  // sb_get_component_versions
  // ===========================================================================
  server.tool(
    'sb_get_component_versions',
    'Get version history for components. Shows schema changes over time.',
    {
      component_id: z.string().optional().describe('Specific component ID to filter versions for'),
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
    },
    async (params) => {
      logger.debug('sb_get_component_versions called', params);

      try {
        const result = await client.sdk.components.versions({
          path: { space_id: spaceId },
          query: {
            model: 'components',
            model_id: params.component_id,
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
        return handleToolError(error, 'sb_get_component_versions');
      }
    }
  );

  // ===========================================================================
  // sb_get_component_usage
  // ===========================================================================
  server.tool(
    'sb_get_component_usage',
    'Find stories using a specific component. Useful before deleting or modifying a component.',
    {
      component_name: z.string().describe('Component technical name'),
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
    },
    async (params) => {
      logger.debug('sb_get_component_usage called', params);

      try {
        const result = await client.sdk.stories.list({
          path: { space_id: spaceId },
          query: {
            contain_component: params.component_name,
            page: params.page,
            per_page: params.per_page,
          },
        });

        const data = client.handleResponse(result);

        const stories = (data.stories || []).map((s) => ({
          id: s.id,
          name: s.name,
          full_slug: s.full_slug,
          published: s.published,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              component: params.component_name,
              stories,
              count: stories.length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_component_usage');
      }
    }
  );

  // ===========================================================================
  // sb_get_single_component_version
  // ===========================================================================
  server.tool(
    'sb_get_single_component_version',
    'Get the schema of a specific component version.',
    {
      component_id: z.number().int().describe('Component ID'),
      version_id: z.number().int().describe('Version ID'),
    },
    async (params) => {
      logger.debug('sb_get_single_component_version called', params);

      try {
        const result = await client.sdk.components.version({
          path: { space_id: spaceId, component_id: params.component_id, version_id: params.version_id },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_single_component_version');
      }
    }
  );

  // ===========================================================================
  // sb_restore_component_version
  // ===========================================================================
  server.tool(
    'sb_restore_component_version',
    'Restore a component to a previous version.',
    {
      version_id: z.number().int().describe('Version ID to restore'),
      component_id: z.string().describe('Component ID (as model_id)'),
    },
    async (params) => {
      logger.debug('sb_restore_component_version called', params);

      try {
        const result = await client.sdk.components.restoreVersion({
          path: { space_id: spaceId, version_id: params.version_id },
          body: {
            model: 'components',
            model_id: params.component_id,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.component),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_restore_component_version');
      }
    }
  );
}
