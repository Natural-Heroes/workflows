/**
 * Knowledge tools for the Odoo MCP server.
 *
 * Provides article CRUD with HTML↔Markdown conversion.
 * Odoo stores article bodies as HTML; we convert to/from Markdown for LLM usage.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OdooClientManager } from '../../services/odoo/client-manager.js';
import { OdooApiError, McpToolError, formatErrorForMcp } from '../../lib/errors.js';
import { htmlToMarkdown, markdownToHtml } from '../../lib/converters.js';

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

export function registerKnowledgeTools(
  server: McpServer,
  clientManager: OdooClientManager,
): void {

  // --- read_articles ---
  server.tool(
    'read_articles',
    'Search and read knowledge articles. Body is returned as Markdown.',
    {
      query: z.string().optional().describe('Search articles by name'),
      parent_id: z.number().optional().describe('Filter by parent article ID'),
      limit: z.number().min(1).max(50).default(10).describe('Max articles to return'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const domain: unknown[] = [];
        if (params.query) domain.push(['name', 'ilike', params.query]);
        if (params.parent_id) domain.push(['parent_id', '=', params.parent_id]);

        const articles = await client.searchRead(
          'knowledge.article',
          domain,
          ['id', 'name', 'body', 'parent_id', 'category', 'create_date', 'write_date'],
          { limit: params.limit, order: 'write_date desc' }
        );

        // Convert HTML bodies to Markdown
        const formatted = (articles as Record<string, unknown>[]).map(a => ({
          ...a,
          body: htmlToMarkdown((a.body as string) || ''),
        }));

        return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- create_article ---
  server.tool(
    'create_article',
    'Create a new knowledge article. Provide body as Markdown.',
    {
      name: z.string().describe('Article title'),
      body: z.string().describe('Article content in Markdown'),
      parent_id: z.number().optional().describe('Parent article ID for nesting'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const vals: Record<string, unknown> = {
          name: params.name,
          body: markdownToHtml(params.body),
        };
        if (params.parent_id) vals.parent_id = params.parent_id;

        const articleId = await client.create('knowledge.article', vals);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: articleId, message: 'Article created.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- update_article ---
  server.tool(
    'update_article',
    'Update an existing knowledge article. Provide body as Markdown.',
    {
      article_id: z.number().describe('Article ID to update'),
      name: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New content in Markdown'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        const vals: Record<string, unknown> = {};
        if (params.name) vals.name = params.name;
        if (params.body) vals.body = markdownToHtml(params.body);

        if (Object.keys(vals).length === 0) {
          return formatErrorForMcp(new McpToolError({ userMessage: 'Provide at least name or body to update.', isRetryable: false }));
        }

        await client.write('knowledge.article', [params.article_id], vals);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: params.article_id, message: 'Article updated.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );

  // --- delete_article ---
  server.tool(
    'delete_article',
    'Delete a knowledge article by ID.',
    {
      article_id: z.number().describe('Article ID to delete'),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra);
      if (!apiKey) return formatErrorForMcp(new McpToolError({ userMessage: 'Not authenticated.', isRetryable: false, errorCode: 'AUTH_REQUIRED' }));

      try {
        const client = clientManager.getClient(apiKey);
        await client.unlink('knowledge.article', [params.article_id]);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: params.article_id, message: 'Article deleted.' }, null, 2) }] };
      } catch (error) { return handleError(error); }
    }
  );
}
