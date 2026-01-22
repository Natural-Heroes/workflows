/**
 * Shopify service module entry point.
 *
 * Creates and exports the ShopifyClient configured from environment.
 */

import { getEnv } from '../../lib/env.js';
import { ShopifyClient } from './client.js';

export { ShopifyClient, ShopifyApiError } from './client.js';
export type * from './types.js';

/**
 * Creates a ShopifyClient using environment configuration.
 */
export function createShopifyClient(): ShopifyClient {
  const env = getEnv();
  return new ShopifyClient(env.stores, env.defaultStore);
}
