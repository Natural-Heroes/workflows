/**
 * Project tools for the Odoo MCP server.
 *
 * Provides project/task listing, creation, and template launching.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OdooClientManager } from '../../services/odoo/client-manager.js';
import { OdooApiError, McpToolError, formatErrorForMcp } from '../../lib/errors.js';

function getApiKey(extra: { authInfo?: { extra?: { odooApiKey?: unknown } } }): string | null {
  return (extra.authInfo?.extra?.odooApiKey as string) || null;
}

function handleError(error: unknown) {
  if (error instanceof OdooApiError) {
    return formatErrorForMcp(new McpToolError({
      userMessage: error.message,
      internalDetails: error.odooDebug,
      isRetryable: [429, 503].includes(error.statusCode),
      errorCode: error.odooErrorName,
    }));
  }
  return formatErrorForMcp(new McpToolError({
    userMessage: 'Unexpected error: ' + (error instanceof Error ? error.message : String(error)),
    isRetryable: false,
  }));
}

export function registerProjectTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- list_projects ---
  server.tool(
    'list_projects',
    'List projects with optional name search.',
    {
      query: z.string().optional().describe('Search projects by name'),
      company_id: z.number().optional().describe('Filter by company ID (use list_companies to see available companies)'),
      limit: z.number().min(1).max(100).default(50).describe('Max records'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.query) domain.push(['name', 'ilike', params.query]);
        if (params.company_id) domain.push(['company_id', '=', params.company_id]);

        const projects = await client.searchRead(
          'project.project',
          domain,
          ['id', 'name', 'user_id', 'partner_id', 'task_count', 'date_start', 'date', 'company_id'],
          { limit: params.limit, order: 'name asc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(projects, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- list_tasks ---
  server.tool(
    'list_tasks',
    'List project tasks with optional project/stage/user filters.',
    {
      project_id: z.number().optional().describe('Filter by project ID'),
      stage_id: z.number().optional().describe('Filter by stage ID'),
      user_ids: z.array(z.number()).optional().describe('Filter by assigned user IDs'),
      is_template: z.boolean().optional().describe('Filter template tasks only'),
      company_id: z.number().optional().describe('Filter by company ID (use list_companies to see available companies)'),
      limit: z.number().min(1).max(100).default(50).describe('Max records'),
      offset: z.number().min(0).default(0).describe('Records to skip'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.project_id) domain.push(['project_id', '=', params.project_id]);
        if (params.stage_id) domain.push(['stage_id', '=', params.stage_id]);
        if (params.user_ids?.length) domain.push(['user_ids', 'in', params.user_ids]);
        if (params.is_template !== undefined) domain.push(['is_template', '=', params.is_template]);
        if (params.company_id) domain.push(['company_id', '=', params.company_id]);

        const tasks = await client.searchRead(
          'project.task',
          domain,
          ['id', 'name', 'project_id', 'stage_id', 'user_ids', 'date_deadline', 'priority', 'is_template', 'company_id'],
          { limit: params.limit, offset: params.offset, order: 'priority desc, date_deadline asc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- create_project ---
  server.tool(
    'create_project',
    'Create a new project.',
    {
      name: z.string().describe('Project name'),
      user_id: z.number().optional().describe('Project manager user ID'),
      partner_id: z.number().optional().describe('Customer partner ID'),
      description: z.string().optional().describe('Project description'),
      company_id: z.number().optional().describe('Company ID for the project (use list_companies to see available companies)'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const vals: Record<string, unknown> = { name: params.name };
        if (params.user_id) vals.user_id = params.user_id;
        if (params.partner_id) vals.partner_id = params.partner_id;
        if (params.description) vals.description = `<p>${params.description}</p>`;
        if (params.company_id) vals.company_id = params.company_id;

        const projectId = await client.create('project.project', vals);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: projectId, message: 'Project created.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- create_task ---
  server.tool(
    'create_task',
    'Create a new task in a project.',
    {
      name: z.string().describe('Task name'),
      project_id: z.number().describe('Project ID'),
      user_ids: z.array(z.number()).optional().describe('Assigned user IDs'),
      date_deadline: z.string().optional().describe('Deadline (YYYY-MM-DD)'),
      description: z.string().optional().describe('Task description'),
      priority: z.enum(['0', '1']).optional().describe('Priority (0=normal, 1=high)'),
      company_id: z.number().optional().describe('Company ID for the task (use list_companies to see available companies)'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const vals: Record<string, unknown> = {
          name: params.name,
          project_id: params.project_id,
        };
        if (params.user_ids) vals.user_ids = [[6, 0, params.user_ids]]; // Replace command
        if (params.date_deadline) vals.date_deadline = params.date_deadline;
        if (params.description) vals.description = `<p>${params.description}</p>`;
        if (params.priority) vals.priority = params.priority;
        if (params.company_id) vals.company_id = params.company_id;

        const taskId = await client.create('project.task', vals);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: taskId, message: 'Task created.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- launch_template ---
  server.tool(
    'launch_template',
    'Create a new task from a task template (nh_project_task_template).',
    {
      template_id: z.number().describe('Template task ID (is_template=true)'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const result = await client.call<Record<string, unknown>>(
          'project.task',
          'action_create_from_template',
          { ids: [params.template_id] }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ result, message: 'Task created from template.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
