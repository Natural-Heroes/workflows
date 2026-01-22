/**
 * MCP Tools: Shop operations
 *
 * - get_shop: Get basic and extended shop information
 * - list_stores: List all configured stores
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShopifyClient } from '../../services/shopify/index.js';
import type { Shop } from '../../services/shopify/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

const SHOP_QUERY = `
query GetShop {
  shop {
    id
    name
    email
    myshopifyDomain
    primaryDomain {
      url
      host
    }
    currencyCode
    plan {
      displayName
    }
    timezoneAbbreviation
    weightUnit
    billingAddress {
      address1
      address2
      city
      province
      country
      zip
    }
    shipsToCountries
  }
}`;

export function registerShopTools(
  server: McpServer,
  client: ShopifyClient
): void {
  server.tool(
    'get_shop',
    'Get Shopify shop information including name, domain, currency, plan, shipping countries, and billing address.',
    {
      store: z
        .string()
        .optional()
        .describe(`Store identifier. Available: ${client.getStoreIds().join(', ')}. Default: ${client.getDefaultStore()}`),
    },
    async (params) => {
      logger.debug('get_shop called', { params });

      try {
        const data = await client.query<{ shop: Shop }>(
          SHOP_QUERY,
          {},
          params.store
        );

        const s = data.shop;
        const response = {
          id: s.id,
          name: s.name,
          email: s.email,
          myshopifyDomain: s.myshopifyDomain,
          primaryDomain: s.primaryDomain,
          currency: s.currencyCode,
          plan: s.plan.displayName,
          timezone: s.timezoneAbbreviation,
          weightUnit: s.weightUnit,
          billingAddress: s.billingAddress,
          shipsToCountries: s.shipsToCountries,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'get_shop', client.getStoreIds());
      }
    }
  );

  server.tool(
    'list_stores',
    'List all configured Shopify stores and their identifiers. Shows which store is the default.',
    {},
    async () => {
      logger.debug('list_stores called');

      const stores = client.getStoreIds();
      const defaultStore = client.getDefaultStore();

      const response = {
        stores: stores.map((id) => ({
          id,
          isDefault: id === defaultStore,
        })),
        defaultStore,
        usage: 'Pass the store ID as the "store" parameter in any tool to target that store.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response) }],
      };
    }
  );

  logger.info('Shop tools registered');
}
