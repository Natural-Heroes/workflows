/**
 * MCP Tools: Webhooks
 *
 * 5 tools for managing Storyblok webhook endpoints.
 * All use raw fetch (not in SDK).
 *
 * Webhooks notify external services when content events occur
 * (e.g. story published, asset uploaded).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers webhook tools on the MCP server.
 */
export function registerWebhookTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  server.tool(
    'sb_list_webhooks',
    'List all webhook endpoints in the space.',
    {
      page: z.number().int().min(1).optional().describe('Page number'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page'),
    },
    async (params) => {
      logger.debug('sb_list_webhooks called', params);
      try {
        const queryParts: string[] = [];
        if (params.page !== undefined) queryParts.push(`page=${params.page}`);
        if (params.per_page !== undefined) queryParts.push(`per_page=${params.per_page}`);
        const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

        const data = await client.fetch<{ webhook_endpoints: unknown[] }>(
          `/v1/spaces/${spaceId}/webhook_endpoints${query}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ webhook_endpoints: data.webhook_endpoints || [], count: (data.webhook_endpoints || []).length }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_webhooks');
      }
    }
  );

  server.tool(
    'sb_get_webhook',
    'Get a single webhook endpoint by ID.',
    {
      webhook_id: z.number().int().describe('Webhook endpoint ID'),
    },
    async (params) => {
      logger.debug('sb_get_webhook called', params);
      try {
        const data = await client.fetch<{ webhook_endpoint: unknown }>(
          `/v1/spaces/${spaceId}/webhook_endpoints/${params.webhook_id}`
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.webhook_endpoint) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_webhook');
      }
    }
  );

  server.tool(
    'sb_create_webhook',
    `Create a new webhook endpoint.

Common actions: "story.published", "story.unpublished", "story.deleted",
"asset.created", "asset.deleted", "datasource.entries_updated".`,
    {
      name: z.string().describe('Webhook name'),
      endpoint: z.string().describe('URL to receive webhook POST requests'),
      actions: z.array(z.string()).describe('Event actions to trigger the webhook'),
      description: z.string().optional().describe('Webhook description'),
      secret: z.string().optional().describe('Secret for HMAC signature verification'),
      activated: z.boolean().optional().describe('Whether webhook is active (default: true)'),
    },
    async (params) => {
      logger.debug('sb_create_webhook called', { name: params.name });
      try {
        const webhook: Record<string, unknown> = {
          name: params.name,
          endpoint: params.endpoint,
          actions: params.actions,
        };
        if (params.description !== undefined) webhook.description = params.description;
        if (params.secret !== undefined) webhook.secret = params.secret;
        if (params.activated !== undefined) webhook.activated = params.activated;

        const data = await client.fetch<{ webhook_endpoint: unknown }>(
          `/v1/spaces/${spaceId}/webhook_endpoints`,
          { method: 'POST', body: JSON.stringify({ webhook_endpoint: webhook }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.webhook_endpoint) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_create_webhook');
      }
    }
  );

  server.tool(
    'sb_update_webhook',
    'Update an existing webhook endpoint. Only provided fields are changed.',
    {
      webhook_id: z.number().int().describe('Webhook endpoint ID'),
      name: z.string().optional().describe('New name'),
      endpoint: z.string().optional().describe('New URL'),
      actions: z.array(z.string()).optional().describe('New actions'),
      description: z.string().optional().describe('New description'),
      secret: z.string().optional().describe('New secret'),
      activated: z.boolean().optional().describe('Enable/disable'),
    },
    async (params) => {
      logger.debug('sb_update_webhook called', { webhook_id: params.webhook_id });
      try {
        const webhook: Record<string, unknown> = {};
        if (params.name !== undefined) webhook.name = params.name;
        if (params.endpoint !== undefined) webhook.endpoint = params.endpoint;
        if (params.actions !== undefined) webhook.actions = params.actions;
        if (params.description !== undefined) webhook.description = params.description;
        if (params.secret !== undefined) webhook.secret = params.secret;
        if (params.activated !== undefined) webhook.activated = params.activated;

        const data = await client.fetch<{ webhook_endpoint: unknown }>(
          `/v1/spaces/${spaceId}/webhook_endpoints/${params.webhook_id}`,
          { method: 'PUT', body: JSON.stringify({ webhook_endpoint: webhook }) }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data.webhook_endpoint) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_webhook');
      }
    }
  );

  server.tool(
    'sb_delete_webhook',
    'Delete a webhook endpoint.',
    {
      webhook_id: z.number().int().describe('Webhook endpoint ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_webhook called', params);
      try {
        await client.fetch<void>(
          `/v1/spaces/${spaceId}/webhook_endpoints/${params.webhook_id}`,
          { method: 'DELETE' }
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: `Webhook ${params.webhook_id} deleted.` }) }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_webhook');
      }
    }
  );
}
