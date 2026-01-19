/**
 * MRPeasy API client module.
 *
 * Provides a pre-configured API client instance using environment credentials.
 *
 * Usage:
 *   import { createMrpEasyClient } from './services/mrpeasy/index.js';
 *   const client = createMrpEasyClient();
 *   const stockItems = await client.getStockItems();
 */

import { getEnv } from '../../lib/env.js';
import { MrpEasyClient } from './client.js';

// Re-export all types
export * from './types.js';

// Re-export client class and error
export { MrpEasyClient, MrpEasyApiError } from './client.js';
export type { MrpEasyClientConfig } from './client.js';

/**
 * Memoized client instance.
 * Created once on first call to createMrpEasyClient().
 */
let clientInstance: MrpEasyClient | null = null;

/**
 * Creates or returns the memoized MRPeasy API client.
 *
 * Uses credentials from environment variables (via getEnv()).
 * The client is memoized - subsequent calls return the same instance.
 *
 * @returns Configured MrpEasyClient instance
 * @throws Error if environment variables are not set
 */
export function createMrpEasyClient(): MrpEasyClient {
  if (!clientInstance) {
    const env = getEnv();

    clientInstance = new MrpEasyClient({
      apiKey: env.MRPEASY_API_KEY,
      apiSecret: env.MRPEASY_API_SECRET,
    });
  }

  return clientInstance;
}

/**
 * Resets the memoized client instance.
 * Primarily used for testing purposes.
 */
export function resetMrpEasyClient(): void {
  clientInstance = null;
}
