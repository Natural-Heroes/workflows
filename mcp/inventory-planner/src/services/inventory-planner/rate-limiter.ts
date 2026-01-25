/**
 * Token Bucket Rate Limiter for Inventory Planner API.
 *
 * Inventory Planner does not document specific rate limits,
 * so we use conservative defaults to avoid overwhelming the API.
 */

import { logger } from '../../lib/logger.js';

/**
 * Token bucket rate limiter.
 *
 * Tokens are consumed for each request and refill over time.
 * If no tokens are available, requests must wait.
 */
export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per ms
  private lastRefill: number;

  /**
   * Creates a new token bucket.
   *
   * @param capacity - Maximum tokens the bucket can hold
   * @param refillPerSecond - Tokens added per second
   */
  constructor(capacity: number, refillPerSecond: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  /**
   * Refills tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Attempts to consume a token.
   *
   * @returns true if token was available, false if rate limited
   */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Waits for a token to become available.
   *
   * @returns Promise that resolves when a token is consumed
   */
  async waitForToken(): Promise<void> {
    while (!this.tryConsume()) {
      // Calculate wait time for next token
      const waitTime = Math.ceil(1 / this.refillRate);
      logger.debug('Rate limiter waiting for token', { waitMs: waitTime });
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  /**
   * Returns current token count (for debugging).
   */
  getTokenCount(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Creates a rate limiter with Inventory Planner defaults.
 *
 * Using conservative limits: 30 capacity / 3 tokens per second.
 * This allows burst requests while maintaining sustainable throughput.
 *
 * @returns TokenBucket configured for Inventory Planner API
 */
export function createRateLimiter(): TokenBucket {
  return new TokenBucket(30, 3);
}
