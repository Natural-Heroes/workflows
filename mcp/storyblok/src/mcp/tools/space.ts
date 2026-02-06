/**
 * MCP Tools: Space
 *
 * 4 tools for managing space settings and access.
 * - get/update space via SDK
 * - list roles and collaborators via raw fetch (not in SDK)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers space tools on the MCP server.
 */
export function registerSpaceTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  // ===========================================================================
  // sb_get_space
  // ===========================================================================
  server.tool(
    'sb_get_space',
    `Get space information including name, plan, limits, languages, story/asset counts, and settings.`,
    {},
    async () => {
      logger.debug('sb_get_space called');

      try {
        const result = await client.sdk.spaces.get({
          path: { space_id: spaceId },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.space),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_space');
      }
    }
  );

  // ===========================================================================
  // sb_update_space
  // ===========================================================================
  server.tool(
    'sb_update_space',
    `Update space settings. Only provided fields are changed.

Common settings: name, domain, default_root (default component for new stories),
story_published_hook (webhook URL), environments.`,
    {
      name: z.string().optional().describe('Space name'),
      domain: z.string().optional().describe('Custom domain'),
      story_published_hook: z.string().optional().describe('Webhook URL for publish events'),
      default_root: z.string().optional().describe('Default root component name for new stories'),
      environments: z.array(z.object({
        name: z.string(),
        location: z.string(),
      })).optional().describe('Preview environments'),
      duplicatable: z.boolean().optional().describe('Allow space duplication'),
    },
    async (params) => {
      logger.debug('sb_update_space called');

      try {
        const space: Record<string, unknown> = {};
        if (params.name !== undefined) space.name = params.name;
        if (params.domain !== undefined) space.domain = params.domain;
        if (params.story_published_hook !== undefined) space.story_published_hook = params.story_published_hook;
        if (params.default_root !== undefined) space.default_root = params.default_root;
        if (params.environments !== undefined) space.environments = params.environments;
        if (params.duplicatable !== undefined) space.duplicatable = params.duplicatable;

        const result = await client.sdk.spaces.update({
          path: { space_id: spaceId },
          body: { space: space as never },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.space),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_space');
      }
    }
  );

  // ===========================================================================
  // sb_list_space_roles
  // ===========================================================================
  server.tool(
    'sb_list_space_roles',
    'List custom roles defined in the space. Uses Management API directly (not in SDK).',
    {},
    async () => {
      logger.debug('sb_list_space_roles called');

      try {
        const data = await client.fetch<{ space_roles: unknown[] }>(
          `/v1/spaces/${spaceId}/space_roles`
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              space_roles: data.space_roles || [],
              count: (data.space_roles || []).length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_space_roles');
      }
    }
  );

  // ===========================================================================
  // sb_list_collaborators
  // ===========================================================================
  server.tool(
    'sb_list_collaborators',
    'List collaborators (users with access) in the space. Uses Management API directly (not in SDK).',
    {},
    async () => {
      logger.debug('sb_list_collaborators called');

      try {
        const data = await client.fetch<{ collaborators: unknown[] }>(
          `/v1/spaces/${spaceId}/collaborators`
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              collaborators: data.collaborators || [],
              count: (data.collaborators || []).length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_collaborators');
      }
    }
  );

  // ===========================================================================
  // SPACE ROLES - CRUD
  // ===========================================================================

  server.tool(
    'sb_get_space_role',
    'Get a single space role by ID.',
    {
      role_id: z.number().int().describe('Space role ID'),
    },
    async (params) => {
      logger.debug('sb_get_space_role called', params);
      try {
        const data = await client.fetch<{ space_role: unknown }>(
          `/v1/spaces/${spaceId}/space_roles/${params.role_id}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.space_role) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_space_role');
      }
    }
  );

  server.tool(
    'sb_create_space_role',
    `Create a custom space role with specific permissions.

Common permissions: "read_stories", "save_stories", "publish_stories",
"unpublish_stories", "delete_stories", "edit_image", "view_composer",
"manage_tags", "edit_datasources", "manage_block_library".`,
    {
      role_name: z.string().describe('Role name'),
      permissions: z.array(z.string()).describe('Permission strings'),
      subtitle: z.string().optional().describe('Role subtitle/description'),
      allowed_paths: z.array(z.number().int()).optional().describe('Allowed story folder IDs'),
      field_permissions: z.array(z.string()).optional().describe('Field-level permissions'),
      datasource_ids: z.array(z.number().int()).optional().describe('Accessible datasource IDs'),
      component_ids: z.array(z.number().int()).optional().describe('Accessible component IDs'),
      allowed_languages: z.array(z.string()).optional().describe('Allowed language codes'),
      asset_folder_ids: z.array(z.number().int()).optional().describe('Accessible asset folder IDs'),
    },
    async (params) => {
      logger.debug('sb_create_space_role called', { role_name: params.role_name });
      try {
        const role: Record<string, unknown> = {
          role: params.role_name,
          permissions: params.permissions,
        };
        if (params.subtitle !== undefined) role.subtitle = params.subtitle;
        if (params.allowed_paths !== undefined) role.allowed_paths = params.allowed_paths;
        if (params.field_permissions !== undefined) role.field_permissions = params.field_permissions;
        if (params.datasource_ids !== undefined) role.datasource_ids = params.datasource_ids;
        if (params.component_ids !== undefined) role.component_ids = params.component_ids;
        if (params.allowed_languages !== undefined) role.allowed_languages = params.allowed_languages;
        if (params.asset_folder_ids !== undefined) role.asset_folder_ids = params.asset_folder_ids;

        const data = await client.fetch<{ space_role: unknown }>(
          `/v1/spaces/${spaceId}/space_roles`,
          { method: 'POST', body: JSON.stringify({ space_role: role }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.space_role) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_space_role');
      }
    }
  );

  server.tool(
    'sb_update_space_role',
    'Update a space role. Only provided fields are changed.',
    {
      role_id: z.number().int().describe('Space role ID'),
      role_name: z.string().optional().describe('New role name'),
      permissions: z.array(z.string()).optional().describe('New permissions'),
      subtitle: z.string().optional().describe('New subtitle'),
      allowed_paths: z.array(z.number().int()).optional().describe('Allowed story paths'),
      field_permissions: z.array(z.string()).optional().describe('Field permissions'),
      datasource_ids: z.array(z.number().int()).optional().describe('Datasource IDs'),
      component_ids: z.array(z.number().int()).optional().describe('Component IDs'),
      allowed_languages: z.array(z.string()).optional().describe('Language codes'),
      asset_folder_ids: z.array(z.number().int()).optional().describe('Asset folder IDs'),
    },
    async (params) => {
      logger.debug('sb_update_space_role called', { role_id: params.role_id });
      try {
        const role: Record<string, unknown> = {};
        if (params.role_name !== undefined) role.role = params.role_name;
        if (params.permissions !== undefined) role.permissions = params.permissions;
        if (params.subtitle !== undefined) role.subtitle = params.subtitle;
        if (params.allowed_paths !== undefined) role.allowed_paths = params.allowed_paths;
        if (params.field_permissions !== undefined) role.field_permissions = params.field_permissions;
        if (params.datasource_ids !== undefined) role.datasource_ids = params.datasource_ids;
        if (params.component_ids !== undefined) role.component_ids = params.component_ids;
        if (params.allowed_languages !== undefined) role.allowed_languages = params.allowed_languages;
        if (params.asset_folder_ids !== undefined) role.asset_folder_ids = params.asset_folder_ids;

        const data = await client.fetch<{ space_role: unknown }>(
          `/v1/spaces/${spaceId}/space_roles/${params.role_id}`,
          { method: 'PUT', body: JSON.stringify({ space_role: role }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.space_role) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_space_role');
      }
    }
  );

  server.tool(
    'sb_delete_space_role',
    'Delete a space role.',
    {
      role_id: z.number().int().describe('Space role ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_space_role called', params);
      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/space_roles/${params.role_id}`,
          { method: 'DELETE' }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: `Space role ${params.role_id} deleted.` }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_space_role');
      }
    }
  );

  // ===========================================================================
  // COLLABORATORS - CRUD
  // ===========================================================================

  server.tool(
    'sb_add_collaborator',
    `Add a collaborator to the space. Invite a user by email with a role.

Use either role (string like "editor") OR space_role_id (custom role ID) OR space_role_ids (multiple roles).`,
    {
      email: z.string().describe('User email to invite'),
      role: z.string().optional().describe('Built-in role (e.g. "editor", "admin")'),
      space_role_id: z.number().int().optional().describe('Custom space role ID'),
      space_role_ids: z.array(z.number().int()).optional().describe('Multiple custom role IDs'),
      permissions: z.array(z.string()).optional().describe('Override permissions'),
    },
    async (params) => {
      logger.debug('sb_add_collaborator called', { email: params.email });
      try {
        const collaborator: Record<string, unknown> = { email: params.email };
        if (params.role !== undefined) collaborator.role = params.role;
        if (params.space_role_id !== undefined) collaborator.space_role_id = params.space_role_id;
        if (params.space_role_ids !== undefined) collaborator.space_role_ids = params.space_role_ids;
        if (params.permissions !== undefined) collaborator.permissions = params.permissions;

        const data = await client.fetch<{ collaborator: unknown }>(
          `/v1/spaces/${spaceId}/collaborators`,
          { method: 'POST', body: JSON.stringify({ collaborator }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.collaborator) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_add_collaborator');
      }
    }
  );

  server.tool(
    'sb_update_collaborator',
    'Update a collaborator\'s role or permissions.',
    {
      collaborator_id: z.number().int().describe('Collaborator ID'),
      role: z.string().optional().describe('New role'),
      permissions: z.array(z.string()).optional().describe('New permissions'),
      space_role_id: z.number().int().optional().describe('New custom role'),
      space_role_ids: z.array(z.number().int()).optional().describe('New custom roles'),
      allowed_paths: z.array(z.number().int()).optional().describe('Allowed story paths'),
      field_permissions: z.array(z.string()).optional().describe('Field permissions'),
    },
    async (params) => {
      logger.debug('sb_update_collaborator called', { collaborator_id: params.collaborator_id });
      try {
        const collaborator: Record<string, unknown> = {};
        if (params.role !== undefined) collaborator.role = params.role;
        if (params.permissions !== undefined) collaborator.permissions = params.permissions;
        if (params.space_role_id !== undefined) collaborator.space_role_id = params.space_role_id;
        if (params.space_role_ids !== undefined) collaborator.space_role_ids = params.space_role_ids;
        if (params.allowed_paths !== undefined) collaborator.allowed_paths = params.allowed_paths;
        if (params.field_permissions !== undefined) collaborator.field_permissions = params.field_permissions;

        const data = await client.fetch<{ collaborator: unknown }>(
          `/v1/spaces/${spaceId}/collaborators/${params.collaborator_id}`,
          { method: 'PUT', body: JSON.stringify({ collaborator }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.collaborator) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_collaborator');
      }
    }
  );

  server.tool(
    'sb_delete_collaborator',
    'Remove a collaborator from the space.',
    {
      collaborator_id: z.number().int().describe('Collaborator ID to remove'),
    },
    async (params) => {
      logger.debug('sb_delete_collaborator called', params);
      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/collaborators/${params.collaborator_id}`,
          { method: 'DELETE' }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: `Collaborator ${params.collaborator_id} removed.` }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_collaborator');
      }
    }
  );
}
