/**
 * MCP Tools: Workflows, Workflow Stages, Workflow Stage Changes
 *
 * 13 tools for managing Storyblok editorial workflows.
 * All use raw fetch (not in SDK).
 *
 * Workflows define editorial processes for content types.
 * Stages are steps within a workflow (e.g. Draft → Review → Approved).
 * Stage changes move a story from one stage to another.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers workflow, workflow stage, and stage change tools.
 */
export function registerWorkflowTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  // ===========================================================================
  // WORKFLOWS
  // ===========================================================================

  server.tool(
    'sb_list_workflows',
    'List all workflows in the space. Optionally filter by content type.',
    {
      content_type: z.string().optional().describe('Filter by content type (e.g. "page", "article")'),
    },
    async (params) => {
      logger.debug('sb_list_workflows called', params);
      try {
        const query = params.content_type ? `?content_type=${encodeURIComponent(params.content_type)}` : '';
        const data = await client.fetch<{ workflows: unknown[] }>(
          `/v1/spaces/${spaceId}/workflows${query}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ workflows: data.workflows || [], count: (data.workflows || []).length }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_workflows');
      }
    }
  );

  server.tool(
    'sb_get_workflow',
    'Get a single workflow by ID.',
    {
      workflow_id: z.number().int().describe('Workflow ID'),
    },
    async (params) => {
      logger.debug('sb_get_workflow called', params);
      try {
        const data = await client.fetch<{ workflow: unknown }>(
          `/v1/spaces/${spaceId}/workflows/${params.workflow_id}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_workflow');
      }
    }
  );

  server.tool(
    'sb_create_workflow',
    'Create a new workflow. Assign content types that use this workflow.',
    {
      name: z.string().describe('Workflow name'),
      content_types: z.array(z.string()).describe('Content types using this workflow (e.g. ["page", "article"])'),
    },
    async (params) => {
      logger.debug('sb_create_workflow called', { name: params.name });
      try {
        const data = await client.fetch<{ workflow: unknown }>(
          `/v1/spaces/${spaceId}/workflows`,
          {
            method: 'POST',
            body: JSON.stringify({
              workflow: { name: params.name, content_types: params.content_types },
            }),
          }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_workflow');
      }
    }
  );

  server.tool(
    'sb_update_workflow',
    'Update an existing workflow.',
    {
      workflow_id: z.number().int().describe('Workflow ID'),
      name: z.string().optional().describe('New name'),
      content_types: z.array(z.string()).optional().describe('New content types'),
    },
    async (params) => {
      logger.debug('sb_update_workflow called', { workflow_id: params.workflow_id });
      try {
        const workflow: Record<string, unknown> = {};
        if (params.name !== undefined) workflow.name = params.name;
        if (params.content_types !== undefined) workflow.content_types = params.content_types;

        const data = await client.fetch<{ workflow: unknown }>(
          `/v1/spaces/${spaceId}/workflows/${params.workflow_id}`,
          { method: 'PUT', body: JSON.stringify({ workflow }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_workflow');
      }
    }
  );

  server.tool(
    'sb_duplicate_workflow',
    'Duplicate an existing workflow with a new name and content types.',
    {
      workflow_id: z.number().int().describe('Workflow ID to duplicate'),
      name: z.string().describe('Name for the duplicate'),
      content_types: z.array(z.string()).describe('Content types for the duplicate'),
    },
    async (params) => {
      logger.debug('sb_duplicate_workflow called', params);
      try {
        const data = await client.fetch<{ workflow: unknown }>(
          `/v1/spaces/${spaceId}/workflows/${params.workflow_id}/duplicate`,
          {
            method: 'POST',
            body: JSON.stringify({
              workflow: { name: params.name, content_types: params.content_types },
            }),
          }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_duplicate_workflow');
      }
    }
  );

  server.tool(
    'sb_delete_workflow',
    'Delete a workflow. The default workflow cannot be deleted.',
    {
      workflow_id: z.number().int().describe('Workflow ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_workflow called', params);
      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/workflows/${params.workflow_id}`,
          { method: 'DELETE' }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: `Workflow ${params.workflow_id} deleted.` }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_workflow');
      }
    }
  );

  // ===========================================================================
  // WORKFLOW STAGES
  // ===========================================================================

  server.tool(
    'sb_list_workflow_stages',
    `List workflow stages. Optionally filter by workflow, search by name, or exclude/include specific IDs.`,
    {
      in_workflow: z.number().int().optional().describe('Filter by workflow ID'),
      search: z.string().optional().describe('Search by stage name'),
      exclude_id: z.number().int().optional().describe('Exclude a specific stage ID'),
      by_ids: z.string().optional().describe('Comma-separated stage IDs to include'),
    },
    async (params) => {
      logger.debug('sb_list_workflow_stages called', params);
      try {
        const queryParts: string[] = [];
        if (params.in_workflow !== undefined) queryParts.push(`in_workflow=${params.in_workflow}`);
        if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
        if (params.exclude_id !== undefined) queryParts.push(`exclude_id=${params.exclude_id}`);
        if (params.by_ids) queryParts.push(`by_ids=${encodeURIComponent(params.by_ids)}`);
        const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

        const data = await client.fetch<{ workflow_stages: unknown[] }>(
          `/v1/spaces/${spaceId}/workflow_stages${query}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ workflow_stages: data.workflow_stages || [], count: (data.workflow_stages || []).length }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_workflow_stages');
      }
    }
  );

  server.tool(
    'sb_get_workflow_stage',
    'Get a single workflow stage by ID.',
    {
      stage_id: z.number().int().describe('Workflow stage ID'),
    },
    async (params) => {
      logger.debug('sb_get_workflow_stage called', params);
      try {
        const data = await client.fetch<{ workflow_stage: unknown }>(
          `/v1/spaces/${spaceId}/workflow_stages/${params.stage_id}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow_stage) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_workflow_stage');
      }
    }
  );

  server.tool(
    'sb_create_workflow_stage',
    `Create a new workflow stage.

Stages control who can edit, publish, or move content. Configure permissions via:
- allow_publish: Allow publishing from this stage
- allow_all_users: All users can move to this stage
- user_ids / space_role_ids: Specific users/roles allowed`,
    {
      name: z.string().describe('Stage name'),
      color: z.string().describe('Stage color (hex, e.g. "#00b3b0")'),
      workflow_id: z.number().int().optional().describe('Workflow ID this stage belongs to'),
      is_default: z.boolean().optional().describe('Set as default stage'),
      position: z.number().int().optional().describe('Stage position in workflow'),
      allow_publish: z.boolean().optional().describe('Allow publishing from this stage'),
      allow_all_stages: z.boolean().optional().describe('Allow transition to all stages'),
      allow_all_users: z.boolean().optional().describe('All users can move to this stage'),
      allow_admin_publish: z.boolean().optional().describe('Only admins can publish'),
      allow_admin_change: z.boolean().optional().describe('Only admins can change stage'),
      allow_editor_change: z.boolean().optional().describe('Editors can change stage'),
      user_ids: z.array(z.number().int()).optional().describe('User IDs allowed for this stage'),
      space_role_ids: z.array(z.number().int()).optional().describe('Space role IDs allowed'),
      workflow_stage_ids: z.array(z.number().int()).optional().describe('Allowed transition stage IDs'),
      after_publish_id: z.number().int().optional().describe('Stage to move to after publish'),
    },
    async (params) => {
      logger.debug('sb_create_workflow_stage called', { name: params.name });
      try {
        const stage: Record<string, unknown> = {
          name: params.name,
          color: params.color,
        };
        if (params.workflow_id !== undefined) stage.workflow_id = params.workflow_id;
        if (params.is_default !== undefined) stage.is_default = params.is_default;
        if (params.position !== undefined) stage.position = params.position;
        if (params.allow_publish !== undefined) stage.allow_publish = params.allow_publish;
        if (params.allow_all_stages !== undefined) stage.allow_all_stages = params.allow_all_stages;
        if (params.allow_all_users !== undefined) stage.allow_all_users = params.allow_all_users;
        if (params.allow_admin_publish !== undefined) stage.allow_admin_publish = params.allow_admin_publish;
        if (params.allow_admin_change !== undefined) stage.allow_admin_change = params.allow_admin_change;
        if (params.allow_editor_change !== undefined) stage.allow_editor_change = params.allow_editor_change;
        if (params.user_ids !== undefined) stage.user_ids = params.user_ids;
        if (params.space_role_ids !== undefined) stage.space_role_ids = params.space_role_ids;
        if (params.workflow_stage_ids !== undefined) stage.workflow_stage_ids = params.workflow_stage_ids;
        if (params.after_publish_id !== undefined) stage.after_publish_id = params.after_publish_id;

        const data = await client.fetch<{ workflow_stage: unknown }>(
          `/v1/spaces/${spaceId}/workflow_stages`,
          { method: 'POST', body: JSON.stringify({ workflow_stage: stage }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow_stage) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_workflow_stage');
      }
    }
  );

  server.tool(
    'sb_update_workflow_stage',
    'Update an existing workflow stage. Only provided fields are changed.',
    {
      stage_id: z.number().int().describe('Workflow stage ID to update'),
      name: z.string().optional().describe('Stage name'),
      color: z.string().optional().describe('Stage color (hex)'),
      is_default: z.boolean().optional().describe('Set as default'),
      position: z.number().int().optional().describe('Position'),
      allow_publish: z.boolean().optional().describe('Allow publishing'),
      allow_all_stages: z.boolean().optional().describe('Allow all stage transitions'),
      allow_all_users: z.boolean().optional().describe('All users allowed'),
      allow_admin_publish: z.boolean().optional().describe('Only admins publish'),
      allow_admin_change: z.boolean().optional().describe('Only admins change'),
      allow_editor_change: z.boolean().optional().describe('Editors can change'),
      user_ids: z.array(z.number().int()).optional().describe('Allowed user IDs'),
      space_role_ids: z.array(z.number().int()).optional().describe('Allowed role IDs'),
      workflow_stage_ids: z.array(z.number().int()).optional().describe('Transition stage IDs'),
      after_publish_id: z.number().int().optional().describe('Stage after publish'),
    },
    async (params) => {
      logger.debug('sb_update_workflow_stage called', { stage_id: params.stage_id });
      try {
        const stage: Record<string, unknown> = {};
        if (params.name !== undefined) stage.name = params.name;
        if (params.color !== undefined) stage.color = params.color;
        if (params.is_default !== undefined) stage.is_default = params.is_default;
        if (params.position !== undefined) stage.position = params.position;
        if (params.allow_publish !== undefined) stage.allow_publish = params.allow_publish;
        if (params.allow_all_stages !== undefined) stage.allow_all_stages = params.allow_all_stages;
        if (params.allow_all_users !== undefined) stage.allow_all_users = params.allow_all_users;
        if (params.allow_admin_publish !== undefined) stage.allow_admin_publish = params.allow_admin_publish;
        if (params.allow_admin_change !== undefined) stage.allow_admin_change = params.allow_admin_change;
        if (params.allow_editor_change !== undefined) stage.allow_editor_change = params.allow_editor_change;
        if (params.user_ids !== undefined) stage.user_ids = params.user_ids;
        if (params.space_role_ids !== undefined) stage.space_role_ids = params.space_role_ids;
        if (params.workflow_stage_ids !== undefined) stage.workflow_stage_ids = params.workflow_stage_ids;
        if (params.after_publish_id !== undefined) stage.after_publish_id = params.after_publish_id;

        const data = await client.fetch<{ workflow_stage: unknown }>(
          `/v1/spaces/${spaceId}/workflow_stages/${params.stage_id}`,
          { method: 'PUT', body: JSON.stringify({ workflow_stage: stage }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow_stage) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_workflow_stage');
      }
    }
  );

  server.tool(
    'sb_delete_workflow_stage',
    'Delete a workflow stage.',
    {
      stage_id: z.number().int().describe('Workflow stage ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_workflow_stage called', params);
      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/workflow_stages/${params.stage_id}`,
          { method: 'DELETE' }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: `Workflow stage ${params.stage_id} deleted.` }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_workflow_stage');
      }
    }
  );

  // ===========================================================================
  // WORKFLOW STAGE CHANGES
  // ===========================================================================

  server.tool(
    'sb_list_workflow_stage_changes',
    'List workflow stage changes (transitions). Optionally filter by story.',
    {
      with_story: z.number().int().optional().describe('Filter by story ID'),
    },
    async (params) => {
      logger.debug('sb_list_workflow_stage_changes called', params);
      try {
        const query = params.with_story ? `?with_story=${params.with_story}` : '';
        const data = await client.fetch<{ workflow_stage_changes: unknown[] }>(
          `/v1/spaces/${spaceId}/workflow_stage_changes${query}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ workflow_stage_changes: data.workflow_stage_changes || [], count: (data.workflow_stage_changes || []).length }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_workflow_stage_changes');
      }
    }
  );

  server.tool(
    'sb_create_workflow_stage_change',
    'Move a story to a different workflow stage. This creates a stage change transition.',
    {
      story_id: z.number().int().describe('Story ID to change stage for'),
      workflow_stage_id: z.number().int().describe('Target workflow stage ID'),
    },
    async (params) => {
      logger.debug('sb_create_workflow_stage_change called', params);
      try {
        const data = await client.fetch<{ workflow_stage_change: unknown }>(
          `/v1/spaces/${spaceId}/workflow_stage_changes`,
          {
            method: 'POST',
            body: JSON.stringify({
              workflow_stage_change: {
                story_id: params.story_id,
                workflow_stage_id: params.workflow_stage_id,
              },
            }),
          }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.workflow_stage_change) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_workflow_stage_change');
      }
    }
  );
}
