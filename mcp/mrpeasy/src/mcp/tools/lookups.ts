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
    'mrp_get_units',
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
        return handleToolError(error, 'mrp_get_units');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_product_groups
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_product_groups',
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
        return handleToolError(error, 'mrp_get_product_groups');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_operation_types
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_operation_types',
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
        return handleToolError(error, 'mrp_get_operation_types');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_workstations
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_workstations',
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
        return handleToolError(error, 'mrp_get_workstations');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_customers
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_customers',
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
        return handleToolError(error, 'mrp_get_customers');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_sites
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_sites',
    'Get all manufacturing sites. Use this to find valid site_id values for create_manufacturing_order. Extracts unique sites from work stations.',
    {},
    async () => {
      logger.debug('get_sites called');

      try {
        // MRPeasy doesn't have a dedicated /sites endpoint.
        // Sites are extracted from work stations which have site_id.
        const workstations = await client.getWorkCenters();

        // Extract unique sites from work stations
        const siteMap = new Map<number, { id: number; name: string | null }>();
        for (const ws of workstations) {
          if (ws.site_id && !siteMap.has(ws.site_id)) {
            siteMap.set(ws.site_id, {
              id: ws.site_id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              name: (ws as any).site_name ?? (ws as any).site_title ?? null,
            });
          }
        }

        const sites = Array.from(siteMap.values());

        if (sites.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                summary: 'No sites found. Your MRPeasy account may not have multi-site enabled, or work stations have no site assignments.',
                hint: 'If using single-site mode, you may not need to specify site_id for manufacturing orders.',
                sites: [],
              }),
            }],
          };
        }

        const response = {
          summary: `${sites.length} manufacturing site(s) found (extracted from work stations).`,
          sites: sites.map((s) => ({
            id: s.id,
            name: s.name ?? `Site ${s.id}`,
          })),
        };

        logger.debug('get_sites success', { count: sites.length });

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_get_sites');
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_users
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_get_users',
    'Get users/workers for manufacturing order assignments. Extracts unique assigned users from recent manufacturing orders.',
    {},
    async () => {
      logger.debug('get_users called');

      try {
        // MRPeasy doesn't have a dedicated /users endpoint for listing employees.
        // We extract unique users from manufacturing orders which have assigned_id and assigned_name.
        const manufacturingOrders = await client.getManufacturingOrders({ per_page: 100 });

        // Extract unique users from MO assignments
        const userMap = new Map<number, { id: number; name: string | null }>();
        for (const mo of manufacturingOrders) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = mo as any;
          if (raw.assigned_id && !userMap.has(raw.assigned_id)) {
            userMap.set(raw.assigned_id, {
              id: raw.assigned_id,
              name: raw.assigned_name ?? raw.assigned ?? null,
            });
          }
        }

        const users = Array.from(userMap.values());

        if (users.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                summary: 'No assigned users found in recent manufacturing orders.',
                hint: 'Try looking at an existing manufacturing order to find a valid assigned_id, or check your MRPeasy user management settings.',
                users: [],
              }),
            }],
          };
        }

        const response = {
          summary: `${users.length} user(s) found (extracted from manufacturing order assignments).`,
          note: 'This list shows users who have been assigned to manufacturing orders. Your organization may have additional users.',
          users: users.map((u) => ({
            id: u.id,
            name: u.name ?? `User ${u.id}`,
          })),
        };

        logger.debug('get_users success', { count: users.length });

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_get_users');
      }
    }
  );

  logger.info('Lookup tools registered: get_units, get_product_groups, get_operation_types, get_workstations, get_customers, get_sites, get_users');
}
