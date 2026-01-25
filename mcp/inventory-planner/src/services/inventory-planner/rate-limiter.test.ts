/**
 * Unit tests for Token Bucket Rate Limiter.
 *
 * Tests INFRA-02: Rate limiter burst capacity, token refill, and blocking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenBucket, createRateLimiter } from './rate-limiter.js';

describe('TokenBucket Rate Limiter (INFRA-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts with full capacity', () => {
      const limiter = new TokenBucket(10, 1);
      expect(limiter.getTokenCount()).toBe(10);
    });
  });

  describe('burst behavior', () => {
    it('allows burst up to capacity', () => {
      const limiter = new TokenBucket(5, 1);

      // Should allow 5 consecutive requests
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryConsume()).toBe(true);
      }
    });

    it('rejects when tokens exhausted', () => {
      const limiter = new TokenBucket(3, 1);

      // Exhaust tokens
      for (let i = 0; i < 3; i++) {
        limiter.tryConsume();
      }

      // Next should fail
      expect(limiter.tryConsume()).toBe(false);
    });

    it('getTokenCount reflects consumption', () => {
      const limiter = new TokenBucket(5, 1);

      limiter.tryConsume();
      expect(limiter.getTokenCount()).toBeLessThanOrEqual(4);

      limiter.tryConsume();
      expect(limiter.getTokenCount()).toBeLessThanOrEqual(3);
    });
  });

  describe('token refill', () => {
    it('refills tokens over time', () => {
      const limiter = new TokenBucket(10, 2); // 2 tokens per second

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryConsume();
      }

      expect(limiter.getTokenCount()).toBe(0);

      // Advance 1 second (should add 2 tokens)
      vi.advanceTimersByTime(1000);

      expect(limiter.getTokenCount()).toBeCloseTo(2, 0);
    });

    it('does not exceed capacity on refill', () => {
      const limiter = new TokenBucket(5, 10); // 10 tokens per second

      // Consume 1 token
      limiter.tryConsume();

      // Advance 10 seconds (would add 100 tokens, but capped at 5)
      vi.advanceTimersByTime(10000);

      expect(limiter.getTokenCount()).toBeLessThanOrEqual(5);
    });

    it('allows request after refill', () => {
      const limiter = new TokenBucket(1, 1); // 1 token per second

      // Exhaust
      limiter.tryConsume();
      expect(limiter.tryConsume()).toBe(false);

      // Advance 1 second
      vi.advanceTimersByTime(1000);

      // Should allow again
      expect(limiter.tryConsume()).toBe(true);
    });
  });

  describe('waitForToken', () => {
    it('blocks until token available', async () => {
      const limiter = new TokenBucket(1, 1); // 1 token per second

      // Exhaust
      limiter.tryConsume();

      // Start waiting
      const waitPromise = limiter.waitForToken();

      // Should not resolve immediately
      let resolved = false;
      waitPromise.then(() => {
        resolved = true;
      });

      // Advance just a bit
      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);

      // Advance enough for token
      await vi.advanceTimersByTimeAsync(1000);
      expect(resolved).toBe(true);
    });

    it('returns immediately if token available', async () => {
      const limiter = new TokenBucket(5, 1);

      const startTime = Date.now();
      await limiter.waitForToken();
      const elapsed = Date.now() - startTime;

      // Should return almost immediately
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('createRateLimiter defaults', () => {
    it('creates limiter with capacity 30 and refill 3/sec', () => {
      const limiter = createRateLimiter();

      // Should allow 30 burst requests
      for (let i = 0; i < 30; i++) {
        expect(limiter.tryConsume()).toBe(true);
      }

      // 31st should fail
      expect(limiter.tryConsume()).toBe(false);

      // After 1 second, should have ~3 more tokens
      vi.advanceTimersByTime(1000);
      expect(limiter.getTokenCount()).toBeCloseTo(3, 0);
    });
  });
});
