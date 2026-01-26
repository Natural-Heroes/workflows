/**
 * MCP Tools: Collection operations
 *
 * - get_collections: List/search collections
 * - get_collection_products: Get products in a collection
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShopifyClient } from '../../services/shopify/index.js';
import type { Collection, Product, Connection } from '../../services/shopify/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

const COLLECTIONS_QUERY = `
query GetCollections($first: Int!, $after: String, $query: String) {
  collections(first: $first, after: $after, query: $query) {
    edges {
      node {
        id
        title
        handle
        descriptionHtml
        productsCount {
          count
        }
        sortOrder
        updatedAt
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

const COLLECTION_PRODUCTS_QUERY = `
query GetCollectionProducts($id: ID!, $first: Int!, $after: String) {
  collection(id: $id) {
    id
    title
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          status
          vendor
          totalInventory
          variants(first: 5) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryQuantity
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

export function registerCollectionTools(
  server: McpServer,
  client: ShopifyClient
): void {
  server.tool(
    'shop_get_collections',
    'List or search Shopify collections. Filter by title or other attributes.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      query: z
        .string()
        .optional()
        .describe('Search query (e.g., "title:Summer")'),
      first: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Number of collections to return (max 50)'),
      after: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response'),
    },
    async (params) => {
      logger.debug('get_collections called', { params });

      try {
        const data = await client.query<{
          collections: Connection<Collection>;
        }>(COLLECTIONS_QUERY, {
          first: params.first,
          after: params.after ?? null,
          query: params.query ?? null,
        }, params.store);

        const collections = data.collections.edges.map((edge) => {
          const c = edge.node;
          return {
            id: c.id,
            title: c.title,
            handle: c.handle,
            productsCount: c.productsCount.count,
            sortOrder: c.sortOrder,
            updatedAt: c.updatedAt,
          };
        });

        const response = {
          summary: `${collections.length} collection(s) returned.${data.collections.pageInfo.hasNextPage ? ' More results available.' : ''}`,
          pagination: {
            hasNextPage: data.collections.pageInfo.hasNextPage,
            endCursor: data.collections.pageInfo.endCursor,
          },
          collections,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'shop_get_collections', client.getStoreIds());
      }
    }
  );

  server.tool(
    'shop_get_collection_products',
    'Get products within a specific Shopify collection. Useful for checking inventory by collection.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      id: z
        .string()
        .describe('Collection GID (e.g., "gid://shopify/Collection/123456789")'),
      first: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Number of products to return (max 50)'),
      after: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response'),
    },
    async (params) => {
      logger.debug('get_collection_products called', { params });

      try {
        const data = await client.query<{
          collection: {
            id: string;
            title: string;
            products: Connection<Product>;
          } | null;
        }>(COLLECTION_PRODUCTS_QUERY, {
          id: params.id,
          first: params.first,
          after: params.after ?? null,
        }, params.store);

        if (!data.collection) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Collection not found', id: params.id }) }],
            isError: true,
          };
        }

        const products = data.collection.products.edges.map((edge) => {
          const p = edge.node;
          return {
            id: p.id,
            title: p.title,
            handle: p.handle,
            status: p.status,
            vendor: p.vendor,
            totalInventory: p.totalInventory,
            variants: p.variants.edges.map((v) => ({
              id: v.node.id,
              title: v.node.title,
              sku: v.node.sku,
              price: v.node.price,
              inventoryQuantity: v.node.inventoryQuantity,
            })),
          };
        });

        const response = {
          collection: { id: data.collection.id, title: data.collection.title },
          summary: `${products.length} product(s) in "${data.collection.title}".${data.collection.products.pageInfo.hasNextPage ? ' More available.' : ''}`,
          pagination: {
            hasNextPage: data.collection.products.pageInfo.hasNextPage,
            endCursor: data.collection.products.pageInfo.endCursor,
          },
          products,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'shop_get_collection_products', client.getStoreIds());
      }
    }
  );

  logger.info('Collection tools registered');
}
