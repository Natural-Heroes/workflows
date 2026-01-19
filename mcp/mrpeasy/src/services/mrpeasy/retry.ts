/**
 * Retry Logic with Exponential Backoff for MRPeasy API.
 *
 * Handles transient failures (429, 503) with exponential backoff and jitter.
 */

import { logger } from '../../lib/logger.js';
import { MrpEasyApiError } from './client.js';

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
  /** Jitter factor (0.2 = ±20%) */
  jitterFactor: number;
  /** HTTP status codes that trigger retry */
  retryableStatuses: number[];
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
  retryableStatuses: [429, 503],
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

  // Apply jitter: delay ± (delay * jitterFactor * random)
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);

  return Math.round(cappedDelay + jitter);
}

/**
 * Checks if an error is retryable based on configuration.
 *
 * @param error - Error to check
 * @param config - Retry configuration
 * @returns true if the error should trigger a retry
 */
function isRetryable(error: unknown, config: RetryConfig): boolean {
  if (error instanceof MrpEasyApiError) {
    return config.retryableStatuses.includes(error.status);
  }
  return false;
}

/**
 * Executes a function with retry logic.
 *
 * Retries on retryable errors (429, 503 by default) with exponential backoff.
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
      if (!isRetryable(error, cfg) || attempt === cfg.maxAttempts - 1) {
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
