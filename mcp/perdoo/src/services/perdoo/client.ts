/**
 * Perdoo GraphQL API client.
 *
 * Uses native fetch (Node 18+) with Bearer token authentication.
 * All logging goes to stderr via the logger module.
 *
 * Includes resilience features:
 * - Request queue (max 1 concurrent request)
 * - Token bucket rate limiter (30 capacity, 3 tokens/sec)
 * - Retry with exponential backoff (on retryable errors)
 * - Circuit breaker (5 failures opens, 30s timeout)
 *
 * Mutations are NEVER retried to prevent duplicate side effects.
 */

import { logger } from '../../lib/logger.js';
import {
  PerdooApiError,
  PerdooHttpError,
  type GraphQLResponse,
} from '../../lib/errors.js';
import { TokenBucket, createRateLimiter } from './rate-limiter.js';
import { RequestQueue, createRequestQueue } from './request-queue.js';
import { withRetry } from './retry.js';
import {
  CircuitBreaker,
  createCircuitBreaker,
} from './circuit-breaker.js';

/**
 * Perdoo client configuration.
 */
export interface PerdooClientConfig {
  /** Bearer token for Perdoo API authentication */
  token: string;
  /** GraphQL endpoint URL (optional, defaults to EU production) */
  endpoint?: string;
  /** Maximum retry attempts for queries (optional, defaults to 3) */
  maxRetries?: number;
  /** Enable circuit breaker (optional, defaults to true) */
  circuitBreakerEnabled?: boolean;
}

/**
 * Options for individual execute() calls.
 */
export interface ExecuteOptions {
  /** Whether this operation is a mutation (never retried) */
  isMutation?: boolean;
}

/**
 * Perdoo GraphQL API client.
 *
 * Provides a typed execute() method for running GraphQL operations
 * against the Perdoo API with full resilience stack.
 *
 * All requests automatically go through the resilience stack:
 * queue -> circuit breaker -> (if query: retry) -> rate limiter -> fetch
 */
export class PerdooClient {
  private readonly endpoint: string;
  private readonly token: string;

  // Resilience components
  private readonly rateLimiter: TokenBucket;
  private readonly queue: RequestQueue;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries: number;
  private readonly circuitBreakerEnabled: boolean;

  /**
   * Creates a new Perdoo API client.
   *
   * @param config - Client configuration with API token
   */
  constructor(config: PerdooClientConfig) {
    this.endpoint = config.endpoint ?? 'https://api-eu.perdoo.com/graphql/';
    this.token = config.token;

    // Initialize resilience components
    this.rateLimiter = createRateLimiter();
    this.queue = createRequestQueue();
    this.circuitBreaker = createCircuitBreaker();
    this.maxRetries = config.maxRetries ?? 3;
    this.circuitBreakerEnabled = config.circuitBreakerEnabled ?? true;
  }

  /**
   * Executes a GraphQL operation through the resilience stack.
   *
   * Pipeline: queue -> circuit breaker -> (if query: retry) -> rate limiter -> fetch
   *
   * Mutations are NEVER retried to prevent duplicate side effects.
   * Queries are retried on transient failures (rate limits, server errors).
   *
   * @param operation - GraphQL query or mutation string
   * @param variables - GraphQL variables object
   * @param options - Execution options (isMutation flag)
   * @returns Parsed response data
   * @throws PerdooApiError on GraphQL errors
   * @throws PerdooHttpError on HTTP errors
   * @throws CircuitBreakerOpenError if circuit is open
   */
  async execute<T>(
    operation: string,
    variables?: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<T> {
    const isMutation = options?.isMutation ?? false;

    logger.debug('GraphQL operation queued', {
      isMutation,
      hasVariables: !!variables,
    });

    // Queue ensures single concurrent request
    return this.queue.enqueue(async () => {
      // Wrapper for circuit breaker (optional)
      const executeWithOptionalCircuitBreaker = async (
        fn: () => Promise<T>
      ): Promise<T> => {
        if (this.circuitBreakerEnabled) {
          return this.circuitBreaker.execute(fn);
        }
        return fn();
      };

      return executeWithOptionalCircuitBreaker(async () => {
        // The actual request function
        const doRequest = async (): Promise<T> => {
          // Rate limiter ensures we don't exceed limits
          logger.debug('Waiting for rate limit token');
          await this.rateLimiter.waitForToken();
          logger.debug('Token acquired, sending request');

          return this.executeRequest<T>(operation, variables);
        };

        // Only retry queries, NEVER mutations
        if (!isMutation) {
          return withRetry(doRequest, { maxAttempts: this.maxRetries });
        }

        return doRequest();
      });
    });
  }

  /**
   * Executes the actual GraphQL HTTP request.
   *
   * @param operation - GraphQL query or mutation string
   * @param variables - GraphQL variables object
   * @returns Parsed response data
   * @throws PerdooApiError on GraphQL errors in response
   * @throws PerdooHttpError on non-2xx HTTP status
   */
  private async executeRequest<T>(
    operation: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();

    const body = JSON.stringify({
      query: operation,
      variables: variables ?? undefined,
    });

    logger.debug('Perdoo GraphQL request', {
      endpoint: this.endpoint,
      bodyLength: body.length,
    });

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body,
      });

      const duration = Date.now() - startTime;

      // Handle HTTP errors
      if (!response.ok) {
        logger.error('Perdoo API HTTP error', {
          status: response.status,
          statusText: response.statusText,
          duration,
        });

        throw new PerdooHttpError(response.status, response.statusText);
      }

      // Parse GraphQL response
      const result = (await response.json()) as GraphQLResponse<T>;

      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        logger.error('Perdoo API GraphQL errors', {
          errorCount: result.errors.length,
          errors: result.errors.map((e) => e.message),
          duration,
        });

        throw new PerdooApiError(result.errors);
      }

      // Ensure data is present
      if (result.data === null || result.data === undefined) {
        throw new PerdooApiError([
          { message: 'GraphQL response contained no data' },
        ]);
      }

      logger.debug('Perdoo GraphQL response', {
        duration,
        hasData: !!result.data,
      });

      return result.data;
    } catch (error) {
      // Re-throw our custom errors as-is
      if (error instanceof PerdooApiError || error instanceof PerdooHttpError) {
        throw error;
      }

      // Wrap network/other errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Perdoo GraphQL request failed', { error: message });

      throw new PerdooHttpError(0, `Request failed: ${message}`);
    }
  }
}

// Re-export CircuitBreakerOpenError for callers to catch
export { CircuitBreakerOpenError } from './circuit-breaker.js';
