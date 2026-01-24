/**
 * MCP Tools: Order operations
 *
 * - get_orders: List/search orders with filtering
 * - get_order: Get single order by ID with full details
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShopifyClient } from '../../services/shopify/index.js';
import type { Order, Connection } from '../../services/shopify/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

const ORDERS_QUERY = `
query GetOrders($first: Int!, $after: String, $query: String, $sortKey: OrderSortKeys, $reverse: Boolean) {
  orders(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    edges {
      node {
        id
        name
        email
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        createdAt
        processedAt
        cancelledAt
        closedAt
        tags
        note
        customer {
          id
          email
          firstName
          lastName
        }
        lineItems(first: 10) {
          edges {
            node {
              id
              title
              quantity
              sku
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              fulfillmentStatus
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

const ORDER_BY_ID_QUERY = `
query GetOrder($id: ID!) {
  order(id: $id) {
    id
    name
    email
    phone
    displayFinancialStatus
    displayFulfillmentStatus
    totalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    subtotalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    totalShippingPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    totalTaxSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    createdAt
    updatedAt
    processedAt
    cancelledAt
    closedAt
    tags
    note
    customer {
      id
      email
      firstName
      lastName
    }
    lineItems(first: 50) {
      edges {
        node {
          id
          title
          quantity
          sku
          variant {
            id
            title
          }
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          discountedUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          fulfillmentStatus
        }
      }
    }
    shippingAddress {
      address1
      address2
      city
      province
      country
      zip
      phone
    }
    billingAddress {
      address1
      address2
      city
      province
      country
      zip
      phone
    }
    fulfillments {
      id
      status
      createdAt
      trackingInfo {
        number
        url
        company
      }
    }
  }
}`;

export function registerOrderTools(
  server: McpServer,
  client: ShopifyClient
): void {
  server.tool(
    'get_orders',
    'Search and list Shopify orders. Filter by status, date, customer, fulfillment status, etc. Uses Shopify query syntax.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      query: z
        .string()
        .optional()
        .describe('Shopify search query (e.g., "fulfillment_status:unfulfilled", "financial_status:paid", "created_at:>2025-01-01")'),
      first: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Number of orders to return (max 50)'),
      after: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response'),
      sort_key: z
        .enum(['PROCESSED_AT', 'TOTAL_PRICE', 'ID', 'CREATED_AT', 'UPDATED_AT', 'ORDER_NUMBER'])
        .default('CREATED_AT')
        .describe('Sort field'),
      reverse: z
        .boolean()
        .default(true)
        .describe('Reverse sort order (true = newest first)'),
    },
    async (params) => {
      logger.debug('get_orders called', { params });

      try {
        const data = await client.query<{
          orders: Connection<Order>;
        }>(ORDERS_QUERY, {
          first: params.first,
          after: params.after ?? null,
          query: params.query ?? null,
          sortKey: params.sort_key,
          reverse: params.reverse,
        }, params.store);

        const orders = data.orders.edges.map((edge) => {
          const o = edge.node;
          return {
            id: o.id,
            name: o.name,
            email: o.email,
            financialStatus: o.displayFinancialStatus,
            fulfillmentStatus: o.displayFulfillmentStatus,
            total: o.totalPriceSet.shopMoney,
            createdAt: o.createdAt,
            customer: o.customer,
            tags: o.tags,
            lineItems: o.lineItems.edges.map((li) => ({
              title: li.node.title,
              quantity: li.node.quantity,
              sku: li.node.sku,
              fulfillmentStatus: li.node.fulfillmentStatus,
            })),
          };
        });

        const response = {
          summary: `${orders.length} order(s) returned.${data.orders.pageInfo.hasNextPage ? ' More results available.' : ''}`,
          pagination: {
            hasNextPage: data.orders.pageInfo.hasNextPage,
            endCursor: data.orders.pageInfo.endCursor,
          },
          orders,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_orders', client.getStoreIds());
      }
    }
  );

  server.tool(
    'get_order',
    'Get a single Shopify order by ID with full details including line items, addresses, fulfillments, and tracking.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      id: z
        .string()
        .describe('Order GID (e.g., "gid://shopify/Order/123456789")'),
    },
    async (params) => {
      logger.debug('get_order called', { params });

      try {
        const data = await client.query<{
          order: Order | null;
        }>(ORDER_BY_ID_QUERY, { id: params.id }, params.store);

        if (!data.order) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Order not found', id: params.id }) }],
            isError: true,
          };
        }

        const o = data.order;
        const response = {
          id: o.id,
          name: o.name,
          email: o.email,
          phone: o.phone,
          financialStatus: o.displayFinancialStatus,
          fulfillmentStatus: o.displayFulfillmentStatus,
          total: o.totalPriceSet.shopMoney,
          subtotal: o.subtotalPriceSet.shopMoney,
          shipping: o.totalShippingPriceSet.shopMoney,
          tax: o.totalTaxSet.shopMoney,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          processedAt: o.processedAt,
          cancelledAt: o.cancelledAt,
          closedAt: o.closedAt,
          tags: o.tags,
          note: o.note,
          customer: o.customer,
          lineItems: o.lineItems.edges.map((li) => ({
            id: li.node.id,
            title: li.node.title,
            quantity: li.node.quantity,
            sku: li.node.sku,
            variant: li.node.variant,
            unitPrice: li.node.originalUnitPriceSet.shopMoney,
            discountedPrice: li.node.discountedUnitPriceSet.shopMoney,
            fulfillmentStatus: li.node.fulfillmentStatus,
          })),
          shippingAddress: o.shippingAddress,
          billingAddress: o.billingAddress,
          fulfillments: o.fulfillments,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_order', client.getStoreIds());
      }
    }
  );

  logger.info('Order tools registered');
}
