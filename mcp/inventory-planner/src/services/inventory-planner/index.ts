/**
 * Inventory Planner API client module.
 *
 * Provides a pre-configured API client instance using environment credentials.
 *
 * Usage:
 *   import { createInventoryPlannerClient } from './services/inventory-planner/index.js';
 *   const client = createInventoryPlannerClient();
 *   const variants = await client.getVariants();
 */

import { getEnv } from '../../lib/env.js';
import { InventoryPlannerClient } from './client.js';

// Re-export all types
export * from './types.js';

// Re-export client class and errors
export {
  InventoryPlannerClient,
  InventoryPlannerApiError,
  CircuitBreakerOpenError,
} from './client.js';
export type { InventoryPlannerClientConfig, PaginatedResponse } from './client.js';

// Re-export resilience utilities (for advanced usage or testing)
export { TokenBucket, createRateLimiter } from './rate-limiter.js';
export { RequestQueue, createRequestQueue } from './request-queue.js';
export { withRetry, type RetryConfig } from './retry.js';
export {
  CircuitBreaker,
  createCircuitBreaker,
  type CircuitBreakerConfig,
} from './circuit-breaker.js';

/**
 * Memoized client instance.
 * Created once on first call to createInventoryPlannerClient().
 */
let clientInstance: InventoryPlannerClient | null = null;

/**
 * Creates or returns the memoized Inventory Planner API client.
 *
 * Uses credentials from environment variables (via getEnv()).
 * The client is memoized - subsequent calls return the same instance.
 *
 * @returns Configured InventoryPlannerClient instance
 * @throws Error if environment variables are not set
 */
export function createInventoryPlannerClient(): InventoryPlannerClient {
  if (!clientInstance) {
    const env = getEnv();

    clientInstance = new InventoryPlannerClient({
      apiKey: env.INVENTORY_PLANNER_API_KEY,
      accountId: env.INVENTORY_PLANNER_ACCOUNT_ID,
    });
  }

  return clientInstance;
}

/**
 * Resets the memoized client instance.
 * Primarily used for testing purposes.
 */
export function resetInventoryPlannerClient(): void {
  clientInstance = null;
}
