/**
 * MCP Tools: Datasources
 *
 * 6 tools for managing Storyblok datasources (key-value stores).
 * Datasources power dropdowns, config, and shared data in the CMS.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers datasource tools on the MCP server.
 */
export function registerDatasourceTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  // ===========================================================================
  // sb_list_datasources
  // ===========================================================================
  server.tool(
    'sb_list_datasources',
    'List all datasources in the space. Datasources are key-value stores used for dropdowns and configuration.',
    {
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
      search: z.string().optional().describe('Search by name'),
      by_ids: z.string().optional().describe('Comma-separated datasource IDs'),
    },
    async (params) => {
      logger.debug('sb_list_datasources called', params);

      try {
        const result = await client.sdk.datasources.list({
          path: { space_id: spaceId },
          query: {
            page: params.page,
            per_page: params.per_page,
            search: params.search,
            by_ids: params.by_ids,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              datasources: data.datasources || [],
              count: (data.datasources || []).length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_datasources');
      }
    }
  );

  // ===========================================================================
  // sb_get_datasource
  // ===========================================================================
  server.tool(
    'sb_get_datasource',
    'Get a single datasource with its dimensions by ID.',
    {
      datasource_id: z.number().int().describe('Datasource ID'),
    },
    async (params) => {
      logger.debug('sb_get_datasource called', params);

      try {
        const result = await client.sdk.datasources.get({
          path: { space_id: spaceId, datasource_id: params.datasource_id },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.datasource),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_datasource');
      }
    }
  );

  // ===========================================================================
  // sb_create_datasource
  // ===========================================================================
  server.tool(
    'sb_create_datasource',
    'Create a new datasource. After creating, use sb_list_datasource_entries to manage its entries.',
    {
      name: z.string().describe('Datasource name'),
      slug: z.string().describe('URL-friendly slug (unique within space)'),
    },
    async (params) => {
      logger.debug('sb_create_datasource called', { name: params.name });

      try {
        // SDK types require `id` and timestamps but API ignores them for creation
        const result = await client.sdk.datasources.create({
          path: { space_id: spaceId },
          body: {
            datasource: { name: params.name, slug: params.slug } as never,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.datasource),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_datasource');
      }
    }
  );

  // ===========================================================================
  // sb_update_datasource
  // ===========================================================================
  server.tool(
    'sb_update_datasource',
    'Update a datasource name or slug.',
    {
      datasource_id: z.number().int().describe('Datasource ID to update'),
      name: z.string().optional().describe('New name'),
      slug: z.string().optional().describe('New slug'),
    },
    async (params) => {
      logger.debug('sb_update_datasource called', { datasource_id: params.datasource_id });

      try {
        const datasource: Record<string, unknown> = {};
        if (params.name !== undefined) datasource.name = params.name;
        if (params.slug !== undefined) datasource.slug = params.slug;

        const result = await client.sdk.datasources.update({
          path: { space_id: spaceId, datasource_id: params.datasource_id },
          body: { datasource: datasource as never },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.datasource),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_datasource');
      }
    }
  );

  // ===========================================================================
  // sb_delete_datasource
  // ===========================================================================
  server.tool(
    'sb_delete_datasource',
    'Delete a datasource and all its entries.',
    {
      datasource_id: z.number().int().describe('Datasource ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_datasource called', params);

      try {
        const result = await client.sdk.datasources.delete({
          path: { space_id: spaceId, datasource_id: params.datasource_id },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: `Datasource ${params.datasource_id} deleted.` }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_datasource');
      }
    }
  );

  // ===========================================================================
  // sb_list_datasource_entries
  // ===========================================================================
  server.tool(
    'sb_list_datasource_entries',
    `List entries (key-value pairs) for a datasource.

Each entry has a name (display label) and value (stored value).
Use datasource_id or datasource_slug to identify the datasource.`,
    {
      datasource_id: z.number().int().optional().describe('Datasource ID'),
      datasource_slug: z.string().optional().describe('Datasource slug (alternative to ID)'),
      dimension: z.string().optional().describe('Dimension to filter by (e.g. locale code)'),
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(1000).optional().describe('Results per page (default: 25, max: 1000)'),
    },
    async (params) => {
      logger.debug('sb_list_datasource_entries called', params);

      try {
        const result = await client.sdk.datasourceEntries.list({
          path: { space_id: spaceId },
          query: {
            datasource_id: params.datasource_id,
            datasource_slug: params.datasource_slug,
            dimension: params.dimension,
            page: params.page,
            per_page: params.per_page,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              datasource_entries: data.datasource_entries || [],
              count: (data.datasource_entries || []).length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_datasource_entries');
      }
    }
  );

  // ===========================================================================
  // sb_create_datasource_entry
  // ===========================================================================
  server.tool(
    'sb_create_datasource_entry',
    'Create a new entry in a datasource.',
    {
      datasource_id: z.number().int().describe('Datasource ID'),
      name: z.string().describe('Entry display name (label)'),
      value: z.string().describe('Entry value (stored)'),
      dimension_value: z.string().optional().describe('Dimension-specific value'),
    },
    async (params) => {
      logger.debug('sb_create_datasource_entry called', { name: params.name });

      try {
        const result = await client.sdk.datasourceEntries.create({
          path: { space_id: spaceId },
          body: {
            datasource_entry: {
              name: params.name,
              value: params.value,
              datasource_id: params.datasource_id,
              dimension_value: params.dimension_value,
            } as never,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.datasource_entry),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_datasource_entry');
      }
    }
  );

  // ===========================================================================
  // sb_update_datasource_entry
  // ===========================================================================
  server.tool(
    'sb_update_datasource_entry',
    'Update an existing datasource entry.',
    {
      entry_id: z.number().int().describe('Datasource entry ID'),
      name: z.string().optional().describe('New display name'),
      value: z.string().optional().describe('New value'),
      dimension_value: z.string().optional().describe('New dimension value'),
    },
    async (params) => {
      logger.debug('sb_update_datasource_entry called', { entry_id: params.entry_id });

      try {
        const entry: Record<string, unknown> = {};
        if (params.name !== undefined) entry.name = params.name;
        if (params.value !== undefined) entry.value = params.value;
        if (params.dimension_value !== undefined) entry.dimension_value = params.dimension_value;

        const result = await client.sdk.datasourceEntries.updateDatasourceEntry({
          path: { space_id: spaceId, datasource_entry_id: params.entry_id },
          body: { datasource_entry: entry as never },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.datasource_entry),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_datasource_entry');
      }
    }
  );

  // ===========================================================================
  // sb_delete_datasource_entry
  // ===========================================================================
  server.tool(
    'sb_delete_datasource_entry',
    'Delete a datasource entry.',
    {
      entry_id: z.number().int().describe('Datasource entry ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_datasource_entry called', params);

      try {
        const result = await client.sdk.datasourceEntries.delete({
          path: { space_id: spaceId, datasource_entry_id: params.entry_id },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: `Datasource entry ${params.entry_id} deleted.` }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_datasource_entry');
      }
    }
  );
}
