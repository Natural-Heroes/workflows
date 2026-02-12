/**
 * MCP Tool Registration
 *
 * Creates and configures the McpServer instance with registered tools.
 * Includes all Storyblok content management tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';
import { createStoryblokClient } from '../../services/storyblok/index.js';
import { registerStoryTools } from './stories.js';
import { registerComponentTools } from './components.js';
import { registerAssetTools } from './assets.js';
import { registerDatasourceTools } from './datasources.js';
import { registerTagTools } from './tags.js';
import { registerSpaceTools } from './space.js';
import { registerWorkflowTools } from './workflows.js';
import { registerReleaseTools } from './releases.js';
import { registerWebhookTools } from './webhooks.js';
import { registerApprovalTools } from './approvals.js';

/**
 * Brief server description shown during initialization.
 */
const SERVER_DESCRIPTION =
  'Storyblok CMS integration. Manage stories, components, assets, datasources, tags, workflows, releases, webhooks, approvals, and space settings. Read the storyblok://instructions resource for usage guide.';

/**
 * Detailed instructions for LLMs, served as a resource.
 */
const INSTRUCTIONS_RESOURCE = `# Storyblok MCP Server Instructions

This server provides full access to the Storyblok Management API for a single space. Manage stories, components, assets, datasources, tags, workflows, releases, webhooks, approvals, and space settings.

## Available Tools

### Stories (20 tools)
sb_list_stories, sb_get_story, sb_create_story, sb_update_story, sb_delete_story, sb_publish_story, sb_unpublish_story, sb_get_story_versions, sb_bulk_publish_stories, sb_bulk_unpublish_stories, sb_bulk_delete_stories, sb_bulk_create_stories, sb_bulk_update_stories, sb_move_story, sb_list_stories_by_slug, sb_validate_story_content, sb_translate_story, sb_restore_story_version, sb_compare_story_versions, sb_get_unpublished_dependencies

- **Draft vs Published**: Updates modify the DRAFT only. Call sb_publish_story to make changes live.
- **AI Translation**: Use sb_translate_story to translate content to other languages.
- **Versioning**: Get history, compare versions, restore previous versions.

### Components (9 tools)
sb_list_components, sb_get_component, sb_create_component, sb_update_component, sb_delete_component, sb_get_component_versions, sb_get_component_usage, sb_get_single_component_version, sb_restore_component_version

Components define content schemas. Each has a name, schema (field definitions), and can be root or nestable.

### Assets (10 tools)
sb_list_assets, sb_get_asset, sb_upload_asset, sb_finalize_asset_upload, sb_update_asset, sb_delete_asset, sb_bulk_delete_assets, sb_bulk_move_assets, sb_bulk_restore_assets, sb_list_asset_folders

Upload is 2-step: sb_upload_asset (get signed URL) then sb_finalize_asset_upload. Supports bulk delete, move, and restore.

### Datasources (9 tools)
sb_list_datasources, sb_get_datasource, sb_create_datasource, sb_update_datasource, sb_delete_datasource, sb_list_datasource_entries, sb_create_datasource_entry, sb_update_datasource_entry, sb_delete_datasource_entry

Key-value stores for dropdowns and configuration. Full CRUD on both datasources and their entries.

### Tags (9 tools)
**Internal tags** (component/asset organization): sb_list_tags, sb_create_tag, sb_update_tag, sb_delete_tag
**Story tags** (content tagging): sb_list_story_tags, sb_create_story_tag, sb_update_story_tag, sb_delete_story_tag, sb_bulk_tag_stories

### Workflows (13 tools)
**Workflows**: sb_list_workflows, sb_get_workflow, sb_create_workflow, sb_update_workflow, sb_duplicate_workflow, sb_delete_workflow
**Stages**: sb_list_workflow_stages, sb_get_workflow_stage, sb_create_workflow_stage, sb_update_workflow_stage, sb_delete_workflow_stage
**Stage Changes**: sb_list_workflow_stage_changes, sb_create_workflow_stage_change

Workflows define editorial processes. Stages are steps (e.g. Draft -> Review -> Approved). Stage changes move stories between stages.

### Releases (5 tools)
sb_list_releases, sb_get_release, sb_create_release, sb_update_release, sb_delete_release

Releases group content changes for coordinated batch publishing. Set do_release=true on update to publish immediately.

### Webhooks (5 tools)
sb_list_webhooks, sb_get_webhook, sb_create_webhook, sb_update_webhook, sb_delete_webhook

Webhooks notify external services on content events (story.published, asset.created, etc.).

### Approvals (5 tools)
sb_list_approvals, sb_get_approval, sb_create_approval, sb_create_release_approval, sb_delete_approval

Request and manage content approvals as part of editorial workflows.

### Space (11 tools)
sb_get_space, sb_update_space, sb_list_space_roles, sb_get_space_role, sb_create_space_role, sb_update_space_role, sb_delete_space_role, sb_list_collaborators, sb_add_collaborator, sb_update_collaborator, sb_delete_collaborator

Full space management including settings, custom roles with permissions, and collaborator access control.

## Key Concepts

### Content Structure
Stories form a tree: folders contain stories. Content is a JSON object with a \`component\` field referencing a component schema.

### Pagination
Page-based: \`page\` (starting at 1) + \`per_page\` (default: 25, max: 100).

### Rate Limits
3 requests/second for Management API. Bulk operations process sequentially.

### Editorial Workflow
1. Create/update story (draft) -> 2. Move through workflow stages -> 3. Get approval -> 4. Publish -> 5. Optionally group in releases for batch publish.

## Best Practices

1. **Use sb_list_stories first** to discover content before changes
2. **Check component schema** before creating content
3. **Always include component field** in content: \`{ "component": "page", ... }\`
4. **Use starts_with** for slug-based filtering
5. **Validate before publishing** with sb_validate_story_content
6. **Check unpublished dependencies** before publishing
7. **Use workflows** for editorial review processes
8. **Use releases** for coordinated multi-story publishing
`;

/**
 * Creates and returns a configured McpServer instance.
 */
export function createMcpServer(): McpServer {
  logger.info('Creating MCP server instance');

  const server = new McpServer({
    name: 'storyblok-mcp',
    version: '0.1.0',
    description: SERVER_DESCRIPTION,
  });

  // Create Storyblok API client
  const client = createStoryblokClient();

  // Register instructions resource for LLM guidance
  server.resource(
    'instructions',
    'storyblok://instructions',
    {
      description: 'Usage guide for the Storyblok MCP server. Read this to understand available tools, content structure, pagination, and best practices.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'storyblok://instructions',
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_RESOURCE,
        },
      ],
    })
  );

  // Register ping tool
  server.tool(
    'sb_ping',
    'Verify the Storyblok MCP server is running and can reach the API. Returns space info.',
    {},
    async () => {
      logger.debug('sb_ping called');

      try {
        const result = await client.sdk.spaces.get({
          path: { space_id: client.spaceId },
        });

        const data = client.handleResponse(result);
        const space = data.space;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'ok',
              space: {
                id: space?.id,
                name: space?.name,
                plan: space?.plan,
                stories_count: space?.stories_count,
                assets_count: space?.assets_count,
              },
            }),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            }),
          }],
          isError: true as const,
        };
      }
    }
  );

  // Register all tool modules
  registerStoryTools(server, client);
  registerComponentTools(server, client);
  registerAssetTools(server, client);
  registerDatasourceTools(server, client);
  registerTagTools(server, client);
  registerSpaceTools(server, client);
  registerWorkflowTools(server, client);
  registerReleaseTools(server, client);
  registerWebhookTools(server, client);
  registerApprovalTools(server, client);

  logger.info('MCP server created with all tools registered');
  return server;
}
