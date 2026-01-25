/**
 * MCP Lookup Tools for Reference Data.
 *
 * Provides tools for querying reference/master data from MRPeasy:
 * - get_units: Units of measurement
 * - get_product_groups: Product/item groups
 * - get_operation_types: Operation types for routings
 * - get_workstations: Workstations for routings
 * - get_customers: Customer list for orders
 * - get_sites: Manufacturing sites
 * - get_users: User list for assignments
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { Unit, ProductGroup, WorkCenterType, WorkCenter, Customer, Site, User } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const GetCustomersInputSchema = z.object({
  code: z.string().optional().describe('Filter by customer code'),
  title: z.string().optional().describe('Filter by customer name/title'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  per_page: z.number().int().positive().max(100).default(50).describe('Results per page (default: 50, max: 100)'),
});

const GetProductGroupsInputSchema = z.object({
  code: z.string().optional().describe('Filter by group code'),
  title: z.string().optional().describe('Filter by group title'),
});

// ============================================================================
// Response Formatters
// ============================================================================

/**
 * Formats units response as JSON for LLM consumption.
 */
function formatUnitsResponse(units: Unit[]): string {
  if (units.length === 0) {
    return JSON.stringify({
      summary: 'No units found.',
      units: [],
    });
  }

  const response = {
    summary: `${units.length} unit(s) of measurement available.`,
    units: units.map((u) => ({
      id: u.id,
      code: u.code ?? u.name ?? u.title,
      name: u.title ?? u.name ?? u.code,
    })),
  };

  return JSON.stringify(response);
}

/**
 * Formats product groups response as JSON for LLM consumption.
 */
function formatProductGroupsResponse(groups: ProductGroup[]): string {
  if (groups.length === 0) {
    return JSON.stringify({
      summary: 'No product groups found.',
      groups: [],
    });
  }

  const response = {
    summary: `${groups.length} product group(s) available.`,
    groups: groups.map((g) => ({
      id: g.group_id,
      code: g.code,
      name: g.title,
    })),
  };

  return JSON.stringify(response);
}

/**
 * Formats operation types response as JSON for LLM consumption.
 */
function formatOperationTypesResponse(types: WorkCenterType[]): string {
  if (types.length === 0) {
    return JSON.stringify({
      summary: 'No operation types found.',
      operationTypes: [],
    });
  }

  const response = {
    summary: `${types.length} operation type(s) available for routing operations.`,
    operationTypes: types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.title ?? t.name,
    })),
  };

  return JSON.stringify(response);
}

/**
 * Formats workstations response as JSON for LLM consumption.
 */
function formatWorkstationsResponse(workstations: WorkCenter[]): string {
  if (workstations.length === 0) {
    return JSON.stringify({
      summary: 'No workstations found.',
      workstations: [],
    });
  }

  const response = {
    summary: `${workstations.length} workstation(s) available for routing operations.`,
    workstations: workstations.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.title ?? w.name,
      typeId: w.type_id,
      siteId: w.site_id,
    })),
  };

  return JSON.stringify(response);
}

/**
 * Parses Content-Range header to extract pagination info.
 */
function parseContentRange(contentRange?: string): { total: number } | null {
  if (!contentRange) return null;
  const match = contentRange.match(/items \d+-\d+\/(\d+)/);
  if (!match) return null;
  return { total: parseInt(match[1], 10) };
}

/**
 * Formats customers response as JSON for LLM consumption.
 */
function formatCustomersResponse(customers: Customer[], contentRange?: string): string {
  const pagination = parseContentRange(contentRange);
  const total = pagination?.total ?? customers.length;

  if (customers.length === 0) {
    return JSON.stringify({
      summary: 'No customers found matching the criteria.',
      pagination: { showing: 0, total: 0 },
      customers: [],
    });
  }

  const response = {
    summary: `${customers.length} of ${total} customer(s) found.`,
    pagination: { showing: customers.length, total },
    customers: customers.map((c) => ({
      id: c.customer_id,
      code: c.code,
      name: c.title ?? c.name,
      email: c.email,
      phone: c.phone,
    })),
  };

  return JSON.stringify(response);
}

/**
 * Formats sites response as JSON for LLM consumption.
 */
function formatSitesResponse(sites: Site[]): string {
  if (sites.length === 0) {
    return JSON.stringify({
      summary: 'No manufacturing sites found.',
      sites: [],
    });
  }

  const response = {
    summary: `${sites.length} manufacturing site(s) available.`,
    sites: sites.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.title ?? s.name,
      address: s.address,
    })),
  };

  return JSON.stringify(response);
}

/**
 * Formats users response as JSON for LLM consumption.
 */
function formatUsersResponse(users: User[]): string {
  if (users.length === 0) {
    return JSON.stringify({
      summary: 'No users found.',
      users: [],
    });
  }

  const activeUsers = users.filter((u) => u.active !== false);

  const response = {
    summary: `${users.length} user(s) found (${activeUsers.length} active).`,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name ?? (`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.username),
      email: u.email,
      role: u.role,
      active: u.active,
    })),
  };

  return JSON.stringify(response);
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Registers lookup tools for reference data.
 *
 * Tools registered:
 * - get_units: List units of measurement
 * - get_product_groups: List product groups
 * - get_operation_types: List operation types for routings
 * - get_workstations: List workstations
 * - get_customers: List customers
 * - get_sites: List manufacturing sites
 * - get_users: List users
 *
 * @param server - MCP server instance to register tools on
 * @param client - MRPeasy API client for making requests
 */
export function registerLookupTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering lookup tools');

  // -------------------------------------------------------------------------
  // get_units
  // -------------------------------------------------------------------------
  server.tool(
    'get_units',
    'Get all units of measurement. Use this to find valid unit_id values for create_item.',
    {},
    async () => {
      logger.debug('get_units called');

      try {
        const units = await client.getUnits();
        const formattedResponse = formatUnitsResponse(units);

        logger.debug('get_units success', { count: units.length });

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        return handleToolError(error, 'get_units');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_product_groups
  // -------------------------------------------------------------------------
  server.tool(
    'get_product_groups',
    'Get all product/item groups. Use this to find valid group_id values for create_item.',
    {
      code: GetProductGroupsInputSchema.shape.code,
      title: GetProductGroupsInputSchema.shape.title,
    },
    async (params) => {
      logger.debug('get_product_groups called', { params });

      try {
        const apiParams: Record<string, unknown> = {};
        if (params.code) apiParams.code = params.code;
        if (params.title) apiParams.title = params.title;

        const groups = await client.getProductGroups(apiParams);
        const formattedResponse = formatProductGroupsResponse(groups);

        logger.debug('get_product_groups success', { count: groups.length });

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        return handleToolError(error, 'get_product_groups');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_operation_types
  // -------------------------------------------------------------------------
  server.tool(
    'get_operation_types',
    'Get all operation types (work center types). Use this to find valid type_id values for create_routing operations.',
    {},
    async () => {
      logger.debug('get_operation_types called');

      try {
        const types = await client.getWorkCenterTypes();
        const formattedResponse = formatOperationTypesResponse(types);

        logger.debug('get_operation_types success', { count: types.length });

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        return handleToolError(error, 'get_operation_types');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_workstations
  // -------------------------------------------------------------------------
  server.tool(
    'get_workstations',
    'Get all workstations (work centers). Use this to find valid workstation_id values for create_routing operations.',
    {},
    async () => {
      logger.debug('get_workstations called');

      try {
        const workstations = await client.getWorkCenters();
        const formattedResponse = formatWorkstationsResponse(workstations);

        logger.debug('get_workstations success', { count: workstations.length });

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        return handleToolError(error, 'get_workstations');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_customers
  // -------------------------------------------------------------------------
  server.tool(
    'get_customers',
    'Get customers. Use this to find valid customer_id values for create_customer_order.',
    {
      code: GetCustomersInputSchema.shape.code,
      title: GetCustomersInputSchema.shape.title,
      page: GetCustomersInputSchema.shape.page,
      per_page: GetCustomersInputSchema.shape.per_page,
    },
    async (params) => {
      logger.debug('get_customers called', { params });

      try {
        const apiParams: Record<string, unknown> = {
          page: params.page ?? 1,
          per_page: params.per_page ?? 50,
        };
        if (params.code) apiParams.code = params.code;
        if (params.title) apiParams.title = params.title;

        const customers = await client.getCustomers(apiParams);
        const contentRange = (customers as { _contentRange?: string })._contentRange;
        const formattedResponse = formatCustomersResponse(customers, contentRange);

        logger.debug('get_customers success', { count: customers.length, contentRange });

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        return handleToolError(error, 'get_customers');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_sites
  // -------------------------------------------------------------------------
  server.tool(
    'get_sites',
    'Get all manufacturing sites. Use this to find valid site_id values for create_manufacturing_order.',
    {},
    async () => {
      logger.debug('get_sites called');

      try {
        const sites = await client.getSites();
        const formattedResponse = formatSitesResponse(sites);

        logger.debug('get_sites success', { count: sites.length });

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        return handleToolError(error, 'get_sites');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_users
  // -------------------------------------------------------------------------
  server.tool(
    'get_users',
    'Get all users. Use this to find valid assigned_id values for create_manufacturing_order.',
    {},
    async () => {
      logger.debug('get_users called');

      try {
        const users = await client.getUsers();
        const formattedResponse = formatUsersResponse(users);

        logger.debug('get_users success', { count: users.length });

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        return handleToolError(error, 'get_users');
      }
    }
  );

  logger.info('Lookup tools registered: get_units, get_product_groups, get_operation_types, get_workstations, get_customers, get_sites, get_users');
}
