/**
 * Retry Logic with Exponential Backoff for Perdoo GraphQL API.
 *
 * Handles transient failures with exponential backoff and jitter.
 * Uses PerdooApiError and PerdooHttpError for retry classification.
 */

import { logger } from '../../lib/logger.js';
import { PerdooApiError, PerdooHttpError } from '../../lib/errors.js';

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of attempts (including first try) */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Jitter factor (0.2 = +/-20%) */
  jitterFactor: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  jitterFactor: 0.2,
};

/**
 * Calculates delay for a given attempt with exponential backoff and jitter.
 *
 * @param attempt - Zero-based attempt number
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Apply jitter: delay +/- (delay * jitterFactor * random)
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);

  return Math.round(cappedDelay + jitter);
}

/**
 * Checks if an error is retryable based on error type classification.
 *
 * @param error - Error to check
 * @returns true if the error should trigger a retry
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof PerdooApiError) {
    return error.isRetryable;
  }
  if (error instanceof PerdooHttpError) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Executes a function with retry logic.
 *
 * Retries on retryable errors (rate limits, server errors) with exponential backoff.
 * Authentication errors and other non-transient errors are never retried.
 *
 * @param fn - Async function to execute
 * @param config - Partial retry configuration (merged with defaults)
 * @returns Promise with function result
 * @throws Last error after all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if not retryable or last attempt
      if (!isRetryable(error) || attempt === cfg.maxAttempts - 1) {
        throw error;
      }

      const delay = calculateDelay(attempt, cfg);
      logger.warn('Retrying request', {
        attempt: attempt + 1,
        maxAttempts: cfg.maxAttempts,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

export { DEFAULT_CONFIG as RETRY_DEFAULT_CONFIG };
