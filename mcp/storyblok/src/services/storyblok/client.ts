/**
 * Storyblok Management API client.
 *
 * Wraps the official @storyblok/management-api-client SDK.
 * Uses raw fetch for endpoints not covered by the SDK (tags, space roles).
 */

import { ManagementApiClient } from '@storyblok/management-api-client';

export interface StoryblokClientConfig {
  token: string;
  spaceId: number;
  region: 'eu' | 'us' | 'ca' | 'ap' | 'cn';
}

/**
 * Custom error class for Storyblok API errors.
 */
export class StoryblokApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string
  ) {
    super(message);
    this.name = 'StoryblokApiError';
  }
}

/**
 * Region to Management API base URL mapping.
 */
const REGION_BASE_URL: Record<string, string> = {
  eu: 'https://mapi.storyblok.com',
  us: 'https://api-us.storyblok.com',
  ca: 'https://api-ca.storyblok.com',
  ap: 'https://api-ap.storyblok.com',
  cn: 'https://app.storyblok.cn',
};

/**
 * Storyblok client wrapping the official Management API SDK.
 *
 * The SDK returns `{ data, error, response }` by default (throwOnError: false).
 * Our `handleResponse()` checks for errors and unwraps the data.
 */
export class StoryblokClient {
  public readonly sdk: ManagementApiClient;
  public readonly spaceId: number;
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: StoryblokClientConfig) {
    this.spaceId = config.spaceId;
    this.token = config.token;
    this.baseUrl = REGION_BASE_URL[config.region] || REGION_BASE_URL.eu;

    this.sdk = new ManagementApiClient({
      token: { accessToken: config.token },
      region: config.region,
    });
  }

  /**
   * Unwraps an SDK response, throwing StoryblokApiError on failure.
   *
   * SDK returns `{ data, error, response }` when throwOnError is false.
   * - If `error` is present, we throw a StoryblokApiError
   * - Otherwise, return `data`
   */
  handleResponse<T>(result: { data?: T; error?: unknown; response: Response }): T {
    if (result.error) {
      const status = result.response?.status || 500;
      const errorMessage =
        typeof result.error === 'string'
          ? result.error
          : typeof result.error === 'object' && result.error !== null && 'message' in result.error
            ? String((result.error as { message: unknown }).message)
            : JSON.stringify(result.error);

      throw new StoryblokApiError(
        errorMessage,
        status,
        typeof result.error === 'object' ? JSON.stringify(result.error) : undefined
      );
    }

    return result.data as T;
  }

  /**
   * Raw fetch for endpoints not covered by the SDK.
   * Handles auth headers and error mapping.
   */
  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.token,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let detail: string | undefined;
      try {
        const body = await response.text();
        detail = body.slice(0, 500);
      } catch {
        // ignore
      }

      throw new StoryblokApiError(
        `Storyblok API error: ${response.status} ${response.statusText}`,
        response.status,
        detail
      );
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}
