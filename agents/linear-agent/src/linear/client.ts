import { LinearClient } from "@linear/sdk";
import Bottleneck from "bottleneck";
import type { LinearConfig } from "../config/types.js";
import type { TokenManager } from "../oauth/token-manager.js";

export interface LinearClientBundle {
  /** Returns a LinearClient with a valid access token, recreating if token was refreshed. */
  getClient: () => Promise<LinearClient>;
  rateLimiter: Bottleneck;
}

/** Creates a rate-limited Linear SDK client bundle that auto-refreshes tokens. */
export function createLinearClient(
  tokenManager: TokenManager,
  config: LinearConfig,
): LinearClientBundle {
  const rateLimiter = new Bottleneck({
    reservoir: config.rateLimit,
    reservoirRefreshAmount: config.rateLimit,
    reservoirRefreshInterval: 60 * 60 * 1000,
    maxConcurrent: 10,
  });

  let cachedToken: string | null = null;
  let cachedClient: LinearClient | null = null;

  async function getClient(): Promise<LinearClient> {
    const token = await tokenManager.getAccessToken();
    if (cachedClient && cachedToken === token) {
      return cachedClient;
    }
    cachedToken = token;
    cachedClient = new LinearClient({ accessToken: token });
    return cachedClient;
  }

  return { getClient, rateLimiter };
}
