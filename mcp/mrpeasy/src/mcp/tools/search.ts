/**
 * MCP Tool: search_items
 *
 * Searches for items (products, parts, materials) in MRPeasy by name or code.
 * Searches both /items (inventory) and /products (manufactured items) endpoints.
 * Since MRPeasy's server-side search doesn't filter by code reliably,
 * this tool fetches items and filters client-side for accurate results.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/index.js';
import type { StockItem, Product } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

/**
 * Unified search result type for display.
 */
interface SearchResult {
  id: number;
  code: string;
  title: string;
  type: string;
  group: string;
  inStock: number;
  available: number;
  deleted: boolean;
  source: 'inventory' | 'products';
}

/**
 * Registers search-related MCP tools with the server.
 *
 * @param server - The MCP server instance
 * @param client - The MRPeasy API client
 */
export function registerSearchTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  server.tool(
    'search_items',
    'Search for items by name or code (part number/SKU). Searches both inventory items AND manufactured products. Use get_product with code parameter for exact code lookup.',
    {
      query: z
        .string()
        .min(2)
        .describe('Search term - matches against item name OR code (part number)'),
      include_deleted: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include deleted items in results (default: false)'),
      page: z
        .number()
        .int()
        .positive()
        .default(1)
        .describe('Page number for pagination'),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Items per page (max 100)'),
    },
    async (params) => {
      logger.debug('search_items tool called', { params });

      try {
        const searchQuery = params.query.toLowerCase();
        const seenIds = new Set<number>(); // Track seen article_ids for deduplication
        const allResults: SearchResult[] = [];

        // Helper to add item if not already seen (deduplication by article_id)
        const addResult = (result: SearchResult) => {
          if (!seenIds.has(result.id)) {
            seenIds.add(result.id);
            allResults.push(result);
          }
        };

        // Helper to check if an item matches the search query
        const itemMatchesQuery = (code?: string, title?: string): boolean => {
          const codeMatch = code?.toLowerCase().includes(searchQuery);
          const titleMatch = title?.toLowerCase().includes(searchQuery);
          return codeMatch || titleMatch || false;
        };

        // First, try to use the API's code filter for direct code matches
        // This is important for finding products with P- codes that don't appear in default listings
        logger.debug('Trying code filter search', { query: searchQuery });
        try {
          const codeFilterItems = await client.getItems({ code: params.query, per_page: 100 });
          let matchCount = 0;
          for (const item of codeFilterItems) {
            if (item.deleted && !params.include_deleted) continue;
            // Always filter client-side - API may not filter properly
            if (!itemMatchesQuery(item.code, item.title)) continue;
            matchCount++;
            addResult({
              id: item.article_id,
              code: item.code ?? 'N/A',
              title: item.title ?? 'Unknown',
              type: item.is_raw ? 'Raw Material' : 'Product',
              group: item.group_title ?? 'Unknown',
              inStock: item.in_stock ?? 0,
              available: item.available ?? 0,
              deleted: item.deleted ?? false,
              source: 'inventory',
            });
          }
          logger.debug('Code filter returned items', { count: codeFilterItems.length, matched: matchCount });
        } catch (codeFilterError) {
          logger.debug('Code filter failed', {
            error: codeFilterError instanceof Error ? codeFilterError.message : 'Unknown',
          });
        }

        // Also try the API's search parameter for name/title matches
        logger.debug('Trying search parameter', { query: params.query });
        try {
          const searchItems = await client.getItems({ search: params.query, per_page: 100 });
          let matchCount = 0;
          for (const item of searchItems) {
            if (item.deleted && !params.include_deleted) continue;
            // Always filter client-side - API may not filter properly
            if (!itemMatchesQuery(item.code, item.title)) continue;
            matchCount++;
            addResult({
              id: item.article_id,
              code: item.code ?? 'N/A',
              title: item.title ?? 'Unknown',
              type: item.is_raw ? 'Raw Material' : 'Product',
              group: item.group_title ?? 'Unknown',
              inStock: item.in_stock ?? 0,
              available: item.available ?? 0,
              deleted: item.deleted ?? false,
              source: 'inventory',
            });
          }
          logger.debug('Search parameter returned items', { count: searchItems.length, matched: matchCount });
        } catch (searchError) {
          logger.debug('Search parameter failed, falling back to pagination', {
            error: searchError instanceof Error ? searchError.message : 'Unknown',
          });
        }

        // If no results yet from /items, fallback to paginated search with client-side filtering
        // This catches cases where MRPeasy API doesn't match substrings in the middle of names
        // (e.g., "nilotica" in "Shea Nilotica" won't match MRPeasy's search parameter)
        if (allResults.length === 0) {
          logger.debug('No matches from API filters, trying paginated search');
          const fetchPerPage = 100;
          let page = 1;
          const maxPages = 100; // Cover up to 10000 items
          let totalItems = 0;
          const maxResults = 100; // Stop early if we've found enough matches

          while (page <= maxPages) {
            const items = await client.getItems({ page, per_page: fetchPerPage });
            if (items.length === 0) break;

            const contentRange = (items as { _contentRange?: string })._contentRange;
            if (contentRange) {
              const match = contentRange.match(/items \d+-\d+\/(\d+)/);
              if (match) totalItems = parseInt(match[1], 10);
            }

            for (const item of items) {
              if (item.deleted && !params.include_deleted) continue;
              if (!itemMatchesQuery(item.code, item.title)) continue;
              addResult({
                id: item.article_id,
                code: item.code ?? 'N/A',
                title: item.title ?? 'Unknown',
                type: item.is_raw ? 'Raw Material' : 'Product',
                group: item.group_title ?? 'Unknown',
                inStock: item.in_stock ?? 0,
                available: item.available ?? 0,
                deleted: item.deleted ?? false,
                source: 'inventory',
              });
            }

            // Early termination: if we found enough results, stop paginating
            if (allResults.length >= maxResults) {
              logger.debug('Found enough results, stopping pagination early', { count: allResults.length });
              break;
            }

            if (page * fetchPerPage >= totalItems) break;
            page++;
          }
          logger.debug('Paginated search completed', { pages: page, totalItems, found: allResults.length });
        }

        // Also search /products endpoint (manufactured items)
        // These might have different codes (like P-XXX)
        // Helper to add product to results
        const addProductToResults = (product: { id: number; number?: string; name?: string; group?: string; active?: boolean }) => {
          if (!product.active && !params.include_deleted) return;
          const codeMatch = product.number?.toLowerCase().includes(searchQuery);
          const nameMatch = product.name?.toLowerCase().includes(searchQuery);
          if (codeMatch || nameMatch) {
            // Check if already in results (avoid duplicates)
            const exists = allResults.some(
              (r) => r.code === product.number || r.id === product.id
            );
            if (!exists) {
              allResults.push({
                id: product.id,
                code: product.number ?? 'N/A',
                title: product.name ?? 'Unknown',
                type: 'Manufactured Product',
                group: product.group ?? 'Unknown',
                inStock: 0, // Products endpoint doesn't have stock info
                available: 0,
                deleted: !product.active,
                source: 'products',
              });
            }
          }
        };

        try {
          // First try search parameter (might be supported)
          logger.debug('Searching /products with search param', { query: params.query });
          const searchProducts = await client.getProducts({ search: params.query, per_page: 100 });
          if (searchProducts?.data) {
            for (const product of searchProducts.data) {
              addProductToResults(product);
            }
            logger.debug('/products search param returned', { count: searchProducts.data.length });
          }
        } catch (searchError) {
          logger.debug('/products search param failed', {
            error: searchError instanceof Error ? searchError.message : 'Unknown',
          });
        }

        // If no product results yet from search, paginate through /products with client-side filtering
        const productResultsBefore = allResults.filter(r => r.source === 'products').length;
        if (productResultsBefore === 0) {
          try {
            logger.debug('Paginating /products with client-side filtering');
            let page = 1;
            const maxProductPages = 10; // Limit to 1000 products
            while (page <= maxProductPages) {
              const productsResponse = await client.getProducts({ page, per_page: 100 });
              if (!productsResponse?.data || productsResponse.data.length === 0) break;

              for (const product of productsResponse.data) {
                addProductToResults(product);
              }

              // Check if there are more pages
              const contentRange = (productsResponse as { _contentRange?: string })._contentRange;
              if (contentRange) {
                const match = contentRange.match(/items \d+-\d+\/(\d+)/);
                if (match) {
                  const total = parseInt(match[1], 10);
                  if (page * 100 >= total) break;
                }
              }
              page++;
            }
          } catch (productsError) {
            logger.debug('Products endpoint pagination failed', {
              error: productsError instanceof Error ? productsError.message : 'Unknown error',
            });
          }
        }

        // Apply pagination to combined results
        const startIdx = (params.page - 1) * params.per_page;
        const endIdx = startIdx + params.per_page;
        const paginatedResults = allResults.slice(startIdx, endIdx);

        // Format response for LLM consumption
        const lines: string[] = [];
        lines.push(`Search Results for "${params.query}":`);
        lines.push('');

        if (paginatedResults.length === 0) {
          lines.push(`No items found matching "${params.query}".`);
          if (!params.include_deleted) {
            lines.push('Note: Deleted items are hidden. Set include_deleted=true to include them.');
          }
        } else {
          paginatedResults.forEach((item, index) => {
            const num = startIdx + index + 1;
            lines.push(`${num}. ${item.title} (ID: ${item.id})`);
            lines.push(`   Code: ${item.code} | Type: ${item.type}`);
            lines.push(`   Group: ${item.group}`);
            if (item.source === 'inventory') {
              lines.push(`   In Stock: ${item.inStock} | Available: ${item.available}`);
            }
            lines.push(`   Status: ${item.deleted ? 'Deleted' : 'Active'}`);
            lines.push('');
          });

          lines.push(`Showing ${paginatedResults.length} of ${allResults.length} matching items.`);
          if (allResults.length > endIdx) {
            lines.push(`Use page=${params.page + 1} to see more results.`);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n'),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, 'search_items');
      }
    }
  );

  logger.info('Search tools registered');
}
