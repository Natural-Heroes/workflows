/**
 * HR tools for the Odoo MCP server.
 *
 * Provides employee search/read, payslip viewing, and time-off reading.
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

export function registerHrTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- search_employees ---
  server.tool(
    'search_employees',
    'Search employees by name, department, or job title.',
    {
      query: z.string().optional().describe('Name search query'),
      department_id: z.number().optional().describe('Department ID filter'),
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
        if (params.department_id) domain.push(['department_id', '=', params.department_id]);
        if (params.company_id) domain.push(['company_id', '=', params.company_id]);

        const employees = await client.searchRead(
          'hr.employee',
          domain,
          ['id', 'name', 'job_title', 'department_id', 'work_email', 'work_phone', 'parent_id', 'company_id'],
          { limit: params.limit, order: 'name asc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(employees, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- read_employee ---
  server.tool(
    'read_employee',
    'Read detailed employee information by ID.',
    {
      employee_id: z.number().describe('Employee ID'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const result = await client.read(
          'hr.employee',
          [params.employee_id],
          ['id', 'name', 'job_title', 'job_id', 'department_id', 'parent_id', 'work_email', 'work_phone', 'company_id', 'resource_calendar_id']
        );
        if (!result.length) {
          return formatErrorForMcp(new McpToolError({ userMessage: 'Employee not found.', isRetryable: false, errorCode: 'NOT_FOUND' }));
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result[0], null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- read_payslips ---
  server.tool(
    'read_payslips',
    'Read payslips with optional employee/date filters.',
    {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      date_from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('End date (YYYY-MM-DD)'),
      company_id: z.number().optional().describe('Filter by company ID (use list_companies to see available companies)'),
      limit: z.number().min(1).max(100).default(20).describe('Max records'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.employee_id) domain.push(['employee_id', '=', params.employee_id]);
        if (params.date_from) domain.push(['date_from', '>=', params.date_from]);
        if (params.date_to) domain.push(['date_to', '<=', params.date_to]);
        if (params.company_id) domain.push(['company_id', '=', params.company_id]);

        const payslips = await client.searchRead(
          'hr.payslip',
          domain,
          ['id', 'name', 'employee_id', 'date_from', 'date_to', 'state', 'net_wage', 'company_id'],
          { limit: params.limit, order: 'date_from desc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(payslips, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- read_time_off ---
  server.tool(
    'read_time_off',
    'Read time-off/leave requests with optional filters.',
    {
      employee_id: z.number().optional().describe('Filter by employee ID'),
      state: z.enum(['draft', 'confirm', 'validate1', 'validate', 'refuse']).optional().describe('Leave state'),
      company_id: z.number().optional().describe('Filter by company ID (use list_companies to see available companies)'),
      limit: z.number().min(1).max(100).default(20).describe('Max records'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.employee_id) domain.push(['employee_id', '=', params.employee_id]);
        if (params.state) domain.push(['state', '=', params.state]);
        if (params.company_id) domain.push(['company_id', '=', params.company_id]);

        const leaves = await client.searchRead(
          'hr.leave',
          domain,
          ['id', 'name', 'employee_id', 'holiday_status_id', 'date_from', 'date_to', 'number_of_days', 'state', 'company_id'],
          { limit: params.limit, order: 'date_from desc' }
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(leaves, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
