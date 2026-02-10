/**
 * Storyblok Management API client module.
 *
 * Provides a pre-configured API client instance using environment credentials.
 *
 * Usage:
 *   import { createStoryblokClient } from './services/storyblok/index.js';
 *   const client = createStoryblokClient();
 */

import { getEnv } from '../../lib/env.js';
import { StoryblokClient } from './client.js';

// Re-export client class and error
export { StoryblokClient, StoryblokApiError } from './client.js';
export type { StoryblokClientConfig } from './client.js';

/**
 * Memoized client instance.
 * Created once on first call to createStoryblokClient().
 */
let clientInstance: StoryblokClient | null = null;

/**
 * Creates or returns the memoized Storyblok API client.
 *
 * Uses credentials from environment variables (via getEnv()).
 * The client is memoized - subsequent calls return the same instance.
 *
 * @returns Configured StoryblokClient instance
 * @throws Error if environment variables are not set
 */
export function createStoryblokClient(): StoryblokClient {
  if (!clientInstance) {
    const env = getEnv();

    clientInstance = new StoryblokClient({
      token: env.STORYBLOK_MANAGEMENT_TOKEN,
      spaceId: env.STORYBLOK_SPACE_ID,
      region: env.STORYBLOK_REGION,
    });
  }

  return clientInstance;
}
