/**
 * MCP Tools: Customer operations
 *
 * - get_customers: Search/list customers with filtering
 * - tag_customer: Add tags to a customer
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShopifyClient } from '../../services/shopify/index.js';
import type { Customer, Connection } from '../../services/shopify/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

const CUSTOMERS_QUERY = `
query GetCustomers($first: Int!, $after: String, $query: String) {
  customers(first: $first, after: $after, query: $query) {
    edges {
      node {
        id
        email
        firstName
        lastName
        phone
        ordersCount
        totalSpentV2 {
          amount
          currencyCode
        }
        tags
        state
        createdAt
        updatedAt
        defaultAddress {
          address1
          city
          province
          country
          zip
        }
        note
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

const TAG_CUSTOMER_MUTATION = `
mutation TagCustomer($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node {
      ... on Customer {
        id
        tags
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

export function registerCustomerTools(
  server: McpServer,
  client: ShopifyClient
): void {
  server.tool(
    'get_customers',
    'Search and list Shopify customers. Filter by name, email, tag, order count, etc.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      query: z
        .string()
        .optional()
        .describe('Search query (e.g., "email:john@example.com", "tag:vip", "orders_count:>5")'),
      first: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Number of customers to return (max 50)'),
      after: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response'),
    },
    async (params) => {
      logger.debug('get_customers called', { params });

      try {
        const data = await client.query<{
          customers: Connection<Customer>;
        }>(CUSTOMERS_QUERY, {
          first: params.first,
          after: params.after ?? null,
          query: params.query ?? null,
        }, params.store);

        const customers = data.customers.edges.map((edge) => {
          const c = edge.node;
          return {
            id: c.id,
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            phone: c.phone,
            ordersCount: c.ordersCount,
            totalSpent: c.totalSpentV2,
            tags: c.tags,
            state: c.state,
            createdAt: c.createdAt,
            defaultAddress: c.defaultAddress,
            note: c.note,
          };
        });

        const response = {
          summary: `${customers.length} customer(s) returned.${data.customers.pageInfo.hasNextPage ? ' More results available.' : ''}`,
          pagination: {
            hasNextPage: data.customers.pageInfo.hasNextPage,
            endCursor: data.customers.pageInfo.endCursor,
          },
          customers,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_customers', client.getStoreIds());
      }
    }
  );

  server.tool(
    'tag_customer',
    'Add tags to a Shopify customer. Tags are additive (existing tags are preserved).',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
      id: z
        .string()
        .describe('Customer GID (e.g., "gid://shopify/Customer/123456789")'),
      tags: z
        .array(z.string())
        .min(1)
        .describe('Tags to add to the customer'),
    },
    async (params) => {
      logger.debug('tag_customer called', { params });

      try {
        const data = await client.query<{
          tagsAdd: {
            node: { id: string; tags: string[] } | null;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        }>(TAG_CUSTOMER_MUTATION, {
          id: params.id,
          tags: params.tags,
        }, params.store);

        if (data.tagsAdd.userErrors.length > 0) {
          const errors = data.tagsAdd.userErrors.map((e) => e.message).join('; ');
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: errors }) }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            customerId: data.tagsAdd.node?.id,
            tags: data.tagsAdd.node?.tags,
          }) }],
        };
      } catch (error) {
        return handleToolError(error, 'tag_customer', client.getStoreIds());
      }
    }
  );

  logger.info('Customer tools registered');
}
