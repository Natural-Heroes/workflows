/**
 * Perdoo GraphQL API client module.
 *
 * Provides a pre-configured API client instance using environment credentials.
 *
 * Usage:
 *   import { createPerdooClient } from './services/perdoo/index.js';
 *   const client = createPerdooClient();
 *   const data = await client.execute(SOME_QUERY);
 */

import { getEnv } from '../../lib/env.js';
import { PerdooClient } from './client.js';

// Re-export all types
export * from './types.js';

// Re-export error types
export {
  PerdooApiError,
  PerdooHttpError,
  type GraphQLError,
  type GraphQLResponse,
} from '../../lib/errors.js';

// Re-export client class and errors
export {
  PerdooClient,
  CircuitBreakerOpenError,
} from './client.js';
export type { PerdooClientConfig, ExecuteOptions } from './client.js';

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
 * Created once on first call to createPerdooClient().
 */
let clientInstance: PerdooClient | null = null;

/**
 * Creates or returns the memoized Perdoo API client.
 *
 * Uses token from environment variables (via getEnv()).
 * The client is memoized - subsequent calls return the same instance.
 *
 * @returns Configured PerdooClient instance
 * @throws Error if environment variables are not set
 */
export function createPerdooClient(): PerdooClient {
  if (!clientInstance) {
    const env = getEnv();

    clientInstance = new PerdooClient({
      token: env.PERDOO_API_TOKEN,
    });
  }

  return clientInstance;
}

/**
 * Resets the memoized client instance.
 * Primarily used for testing purposes.
 */
export function resetPerdooClient(): void {
  clientInstance = null;
}
