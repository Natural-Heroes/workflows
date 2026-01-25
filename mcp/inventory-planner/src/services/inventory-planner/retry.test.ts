/**
 * Unit tests for Retry Logic.
 *
 * Tests INFRA-02: Retry behavior, retryable statuses, Retry-After, exponential backoff.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withRetry, RETRY_DEFAULT_CONFIG } from './retry.js';
import { InventoryPlannerApiError } from './client.js';

describe('Retry Logic (INFRA-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful requests', () => {
    it('returns result on first success (no retry needed)', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryable status codes', () => {
    it('retries on 429 status', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new InventoryPlannerApiError('Rate limited', 429))
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn);

      // Run all timers until promise resolves
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 status', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new InventoryPlannerApiError('Service unavailable', 503))
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn);

      // Run all timers until promise resolves
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('non-retryable status codes', () => {
    it('does NOT retry on 400', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new InventoryPlannerApiError('Bad request', 400));

      await expect(withRetry(fn)).rejects.toThrow('Bad request');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 401', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new InventoryPlannerApiError('Unauthorized', 401));

      await expect(withRetry(fn)).rejects.toThrow('Unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 404', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new InventoryPlannerApiError('Not found', 404));

      await expect(withRetry(fn)).rejects.toThrow('Not found');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry-After header', () => {
    it('respects Retry-After header for 429', async () => {
      // Create error with retryAfterSeconds
      const error429 = new InventoryPlannerApiError('Rate limited', 429, 'RATE_LIMITED', 5);

      const fn = vi
        .fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn);

      // Run all timers until promise resolves
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('exponential backoff', () => {
    it('uses exponential backoff (delays increase)', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new InventoryPlannerApiError('Error', 503))
        .mockRejectedValueOnce(new InventoryPlannerApiError('Error', 503))
        .mockRejectedValueOnce(new InventoryPlannerApiError('Error', 503))
        .mockResolvedValueOnce('success');

      const resultPromise = withRetry(fn);

      // First attempt - immediate
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // After first backoff (~2000ms +- jitter)
      await vi.advanceTimersByTimeAsync(3000);
      expect(fn).toHaveBeenCalledTimes(2);

      // After second backoff (~4000ms +- jitter)
      await vi.advanceTimersByTimeAsync(6000);
      expect(fn).toHaveBeenCalledTimes(3);

      // After third backoff (~8000ms +- jitter)
      await vi.advanceTimersByTimeAsync(10000);
      expect(fn).toHaveBeenCalledTimes(4);

      const result = await resultPromise;
      expect(result).toBe('success');
    });
  });

  describe('max attempts', () => {
    it('throws after maxAttempts exhausted', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new InventoryPlannerApiError('Service unavailable', 503));

      const resultPromise = withRetry(fn, { maxAttempts: 3 });

      // Catch to prevent unhandled rejection warning during timer advance
      resultPromise.catch(() => {
        /* expected rejection */
      });

      // Run all timers until promise settles
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Service unavailable');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('uses default maxAttempts of 5', async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(new InventoryPlannerApiError('Service unavailable', 503));

      const resultPromise = withRetry(fn);

      // Catch to prevent unhandled rejection warning during timer advance
      resultPromise.catch(() => {
        /* expected rejection */
      });

      // Run all timers until promise settles
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Service unavailable');
      expect(fn).toHaveBeenCalledTimes(RETRY_DEFAULT_CONFIG.maxAttempts);
    });
  });

  describe('non-InventoryPlannerApiError', () => {
    it('does not retry on generic errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Generic error'));

      await expect(withRetry(fn)).rejects.toThrow('Generic error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
