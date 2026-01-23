/**
 * Error types for Perdoo GraphQL API.
 *
 * Provides structured error classes for GraphQL and HTTP errors,
 * with built-in classification for retry logic (auth errors, rate limits, etc.).
 */

/**
 * GraphQL error from Perdoo API response.
 */
export interface GraphQLError {
  /** Error message */
  message: string;
  /** Source locations in the query */
  locations?: Array<{ line: number; column: number }>;
  /** Path to the field that caused the error */
  path?: Array<string | number>;
  /** Extensions with error codes and metadata */
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
}

/**
 * GraphQL response envelope from Perdoo API.
 */
export interface GraphQLResponse<T> {
  /** Response data (null if errors occurred) */
  data: T | null;
  /** Array of GraphQL errors */
  errors?: GraphQLError[];
  /** Response extensions (timing, tracing, etc.) */
  extensions?: Record<string, unknown>;
}

/**
 * Error thrown when Perdoo API returns GraphQL errors.
 *
 * Classifies errors for retry logic:
 * - Authentication errors: never retry
 * - Rate limit errors: retryable
 * - Other errors: not retryable by default
 */
export class PerdooApiError extends Error {
  public readonly errors: GraphQLError[];
  public readonly isAuthError: boolean;
  public readonly isRateLimited: boolean;
  public readonly isRetryable: boolean;

  constructor(errors: GraphQLError[]) {
    const message = errors.map((e) => e.message).join('; ');
    super(message);
    this.name = 'PerdooApiError';
    this.errors = errors;

    // Check if any error indicates authentication failure
    this.isAuthError = errors.some(
      (e) =>
        e.extensions?.code === 'UNAUTHENTICATED' ||
        e.message.toLowerCase().includes('authentication') ||
        e.message.toLowerCase().includes('unauthorized')
    );

    // Check if any error indicates rate limiting
    this.isRateLimited = errors.some(
      (e) =>
        e.extensions?.code === 'RATE_LIMITED' ||
        e.message.toLowerCase().includes('rate limit') ||
        e.message.toLowerCase().includes('throttl')
    );

    // Retryable if rate limited but NOT an auth error
    this.isRetryable = this.isRateLimited && !this.isAuthError;
  }
}

/**
 * Error thrown when Perdoo API returns an HTTP error (non-2xx status).
 *
 * Classifies errors for retry logic:
 * - 429 (Too Many Requests): retryable
 * - 502, 503, 504 (Server errors): retryable
 * - All other statuses: not retryable
 */
export class PerdooHttpError extends Error {
  public readonly status: number;
  public readonly isRetryable: boolean;
  public readonly responseBody?: string;

  constructor(status: number, statusText: string, responseBody?: string) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'PerdooHttpError';
    this.status = status;
    this.isRetryable = [429, 502, 503, 504].includes(status);
    this.responseBody = responseBody;
  }
}
