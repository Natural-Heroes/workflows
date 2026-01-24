/**
 * Shopify Admin GraphQL API client with multi-store support.
 *
 * Uses native fetch (Node 18+) with token-based authentication.
 * Handles Shopify's cost-based rate limiting with retry logic.
 *
 * API Version: 2025-01 (latest stable)
 */

import { logger } from '../../lib/logger.js';
import type { StoreConfig } from '../../lib/env.js';
import type { GraphQLResponse, GraphQLError } from './types.js';

const SHOPIFY_API_VERSION = '2025-01';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Error thrown by Shopify API client.
 */
export class ShopifyApiError extends Error {
  public readonly status: number;
  public readonly graphqlErrors?: GraphQLError[];
  public readonly isRetryable: boolean;
  public readonly store: string;

  constructor(
    message: string,
    status: number,
    store: string,
    graphqlErrors?: GraphQLError[]
  ) {
    super(message);
    this.name = 'ShopifyApiError';
    this.status = status;
    this.graphqlErrors = graphqlErrors;
    this.isRetryable = status === 429 || status === 503 || status === 502 || status === 504;
    this.store = store;
  }
}

/**
 * Multi-store Shopify Admin GraphQL API client.
 *
 * Manages connections to multiple Shopify stores and routes
 * requests based on store identifier.
 */
export class ShopifyClient {
  private readonly stores: Map<string, StoreConfig>;
  private readonly defaultStore: string;

  constructor(stores: StoreConfig[], defaultStore: string) {
    this.stores = new Map(stores.map((s) => [s.id, s]));
    this.defaultStore = defaultStore;
  }

  /**
   * Returns the list of configured store IDs.
   */
  getStoreIds(): string[] {
    return Array.from(this.stores.keys());
  }

  /**
   * Returns the default store ID.
   */
  getDefaultStore(): string {
    return this.defaultStore;
  }

  /**
   * Resolves a store identifier to its config.
   * Uses default store if none specified.
   *
   * @throws ShopifyApiError if store is not configured
   */
  private resolveStore(storeId?: string): StoreConfig {
    const id = storeId ?? this.defaultStore;
    const store = this.stores.get(id);
    if (!store) {
      throw new ShopifyApiError(
        `Store "${id}" is not configured`,
        400,
        id
      );
    }
    return store;
  }

  /**
   * Executes a GraphQL query against a Shopify store.
   *
   * Handles:
   * - Token-based authentication (X-Shopify-Access-Token)
   * - Retry on 429 (THROTTLED) responses
   * - GraphQL error detection and reporting
   *
   * @param query - GraphQL query string
   * @param variables - Query variables
   * @param storeId - Store identifier (uses default if omitted)
   * @returns Parsed response data
   */
  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
    storeId?: string
  ): Promise<T> {
    const store = this.resolveStore(storeId);
    const url = `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        logger.debug('Shopify GraphQL request', {
          store: store.id,
          attempt: attempt + 1,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': store.token,
          },
          body: JSON.stringify({ query, variables }),
        });

        // Handle HTTP-level errors
        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const delay = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : RETRY_DELAY_MS * Math.pow(2, attempt);
            logger.warn('Shopify rate limited, retrying', {
              store: store.id,
              delay,
              attempt: attempt + 1,
            });
            await this.sleep(delay);
            continue;
          }

          throw new ShopifyApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            store.id
          );
        }

        const json = (await response.json()) as GraphQLResponse<T>;

        // Log cost info if available
        if (json.extensions?.cost) {
          const cost = json.extensions.cost;
          logger.debug('Shopify API cost', {
            store: store.id,
            requested: cost.requestedQueryCost,
            actual: cost.actualQueryCost,
            available: cost.throttleStatus.currentlyAvailable,
          });
        }

        // Handle GraphQL-level THROTTLED errors
        if (json.errors?.some((e) => e.extensions?.['code'] === 'THROTTLED')) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn('Shopify GraphQL throttled, retrying', {
            store: store.id,
            delay,
            attempt: attempt + 1,
          });
          await this.sleep(delay);
          continue;
        }

        // Handle other GraphQL errors
        if (json.errors && json.errors.length > 0) {
          throw new ShopifyApiError(
            json.errors.map((e) => e.message).join('; '),
            200,
            store.id,
            json.errors
          );
        }

        if (!json.data) {
          throw new ShopifyApiError(
            'Empty response from Shopify API',
            200,
            store.id
          );
        }

        return json.data;
      } catch (error) {
        if (error instanceof ShopifyApiError && !error.isRetryable) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn('Shopify request failed, retrying', {
            store: store.id,
            error: lastError.message,
            delay,
            attempt: attempt + 1,
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new ShopifyApiError(
      'Max retries exceeded',
      0,
      storeId ?? this.defaultStore
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
