/**
 * MCP Tools: Product operations
 *
 * - get_products: Search/list products with filtering
 * - get_product: Get single product by ID
 * - get_variants: Get variants by product ID
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShopifyClient } from '../../services/shopify/index.js';
import type { Product, Connection } from '../../services/shopify/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

const PRODUCTS_QUERY = `
query GetProducts($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query) {
    edges {
      node {
        id
        title
        handle
        status
        vendor
        productType
        tags
        totalInventory
        createdAt
        updatedAt
        variants(first: 10) {
          edges {
            node {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              inventoryQuantity
              selectedOptions {
                name
                value
              }
            }
          }
        }
        images(first: 1) {
          edges {
            node {
              id
              url
              altText
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
}`;

const PRODUCT_BY_ID_QUERY = `
query GetProduct($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    status
    vendor
    productType
    tags
    totalInventory
    createdAt
    updatedAt
    variants(first: 100) {
      edges {
        node {
          id
          title
          sku
          barcode
          price
          compareAtPrice
          inventoryQuantity
          inventoryItem {
            id
          }
          selectedOptions {
            name
            value
          }
        }
      }
    }
    images(first: 10) {
      edges {
        node {
          id
          url
          altText
          width
          height
        }
      }
    }
  }
}`;

const VARIANTS_QUERY = `
query GetVariants($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      title
      sku
      barcode
      price
      compareAtPrice
      inventoryQuantity
      inventoryItem {
        id
      }
      selectedOptions {
        name
        value
      }
      product {
        id
        title
      }
    }
  }
}`;

export function registerProductTools(
  server: McpServer,
  client: ShopifyClient
): void {
  server.tool(
    'get_products',
    'Search and list Shopify products. Filter by title, status, vendor, product_type, or tag. Returns product details with variants and inventory.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      query: z
        .string()
        .optional()
        .describe('Search query. Supports Shopify search syntax (e.g., "title:hero", "status:active", "vendor:NH")'),
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
      logger.debug('get_products called', { params });

      try {
        const data = await client.query<{
          products: Connection<Product>;
        }>(PRODUCTS_QUERY, {
          first: params.first,
          after: params.after ?? null,
          query: params.query ?? null,
        }, params.store);

        const products = data.products.edges.map((edge) => {
          const p = edge.node;
          return {
            id: p.id,
            title: p.title,
            handle: p.handle,
            status: p.status,
            vendor: p.vendor,
            productType: p.productType,
            tags: p.tags,
            totalInventory: p.totalInventory,
            variants: p.variants.edges.map((v) => ({
              id: v.node.id,
              title: v.node.title,
              sku: v.node.sku,
              price: v.node.price,
              inventoryQuantity: v.node.inventoryQuantity,
              options: v.node.selectedOptions,
            })),
          };
        });

        const response = {
          summary: `${products.length} product(s) returned.${data.products.pageInfo.hasNextPage ? ' More results available.' : ''}`,
          pagination: {
            hasNextPage: data.products.pageInfo.hasNextPage,
            endCursor: data.products.pageInfo.endCursor,
          },
          products,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_products', client.getStoreIds());
      }
    }
  );

  server.tool(
    'get_product',
    'Get a single Shopify product by ID with full details including all variants and images.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      id: z
        .string()
        .describe('Product GID (e.g., "gid://shopify/Product/123456789")'),
    },
    async (params) => {
      logger.debug('get_product called', { params });

      try {
        const data = await client.query<{
          product: Product | null;
        }>(PRODUCT_BY_ID_QUERY, { id: params.id }, params.store);

        if (!data.product) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Product not found', id: params.id }) }],
            isError: true,
          };
        }

        const p = data.product;
        const response = {
          id: p.id,
          title: p.title,
          handle: p.handle,
          status: p.status,
          vendor: p.vendor,
          productType: p.productType,
          tags: p.tags,
          totalInventory: p.totalInventory,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          variants: p.variants.edges.map((v) => ({
            id: v.node.id,
            title: v.node.title,
            sku: v.node.sku,
            barcode: v.node.barcode,
            price: v.node.price,
            compareAtPrice: v.node.compareAtPrice,
            inventoryQuantity: v.node.inventoryQuantity,
            inventoryItemId: v.node.inventoryItem?.id,
            options: v.node.selectedOptions,
          })),
          images: p.images.edges.map((i) => ({
            id: i.node.id,
            url: i.node.url,
            altText: i.node.altText,
          })),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_product', client.getStoreIds());
      }
    }
  );

  server.tool(
    'get_variants',
    'Get product variants by their IDs. Useful for checking inventory and pricing of specific variants.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      ids: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe('Array of variant GIDs (e.g., ["gid://shopify/ProductVariant/123"])'),
    },
    async (params) => {
      logger.debug('get_variants called', { params });

      try {
        interface VariantNode {
          id: string;
          title: string;
          sku: string | null;
          barcode: string | null;
          price: string;
          compareAtPrice: string | null;
          inventoryQuantity: number;
          selectedOptions: Array<{ name: string; value: string }>;
          product?: { id: string; title: string };
        }

        const data = await client.query<{
          nodes: Array<VariantNode | null>;
        }>(VARIANTS_QUERY, { ids: params.ids }, params.store);

        const variants = data.nodes
          .filter((n): n is VariantNode => n !== null)
          .map((v) => ({
            id: v.id,
            title: v.title,
            sku: v.sku,
            barcode: v.barcode,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            inventoryQuantity: v.inventoryQuantity,
            options: v.selectedOptions,
            product: v.product ?? null,
          }));

        return {
          content: [{ type: 'text', text: JSON.stringify({ count: variants.length, variants }) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_variants', client.getStoreIds());
      }
    }
  );

  logger.info('Product tools registered');
}
