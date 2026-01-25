/**
 * Unit tests for Request Queue.
 *
 * Tests INFRA-02: FIFO ordering, single concurrency, queue depth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestQueue, createRequestQueue } from './request-queue.js';

describe('RequestQueue (INFRA-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('FIFO ordering', () => {
    it('processes requests in FIFO order', async () => {
      const queue = createRequestQueue();
      const executionOrder: number[] = [];

      // Enqueue 3 requests that each take some time
      const promise1 = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 100));
        executionOrder.push(1);
        return 1;
      });

      const promise2 = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 100));
        executionOrder.push(2);
        return 2;
      });

      const promise3 = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 100));
        executionOrder.push(3);
        return 3;
      });

      // Process all
      await vi.advanceTimersByTimeAsync(500);

      const [r1, r2, r3] = await Promise.all([promise1, promise2, promise3]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(r3).toBe(3);
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('single concurrency', () => {
    it('processes only one request at a time', async () => {
      const queue = createRequestQueue();
      let concurrent = 0;
      let maxConcurrent = 0;

      const makeRequest = () =>
        queue.enqueue(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 100));
          concurrent--;
          return 'done';
        });

      // Enqueue multiple requests
      const promises = [
        makeRequest(),
        makeRequest(),
        makeRequest(),
        makeRequest(),
      ];

      // Process all
      await vi.advanceTimersByTimeAsync(500);
      await Promise.all(promises);

      // Should never have more than 1 concurrent
      expect(maxConcurrent).toBe(1);
    });

    it('isProcessing returns true during execution', async () => {
      const queue = createRequestQueue();
      let wasProcessing = false;

      const promise = queue.enqueue(async () => {
        wasProcessing = queue.isProcessing();
        await new Promise((r) => setTimeout(r, 100));
        return 'done';
      });

      // Start processing
      await vi.advanceTimersByTimeAsync(50);
      expect(queue.isProcessing()).toBe(true);

      // Complete
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(wasProcessing).toBe(true);
      expect(queue.isProcessing()).toBe(false);
    });
  });

  describe('queue depth', () => {
    it('getQueueDepth returns correct count', async () => {
      const queue = createRequestQueue();

      // Initially empty
      expect(queue.getQueueDepth()).toBe(0);

      // Add slow request
      const promise1 = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 1;
      });

      // First request starts processing immediately (removed from queue)
      await vi.advanceTimersByTimeAsync(0);
      expect(queue.getQueueDepth()).toBe(0);

      // Add more while first is processing
      const promise2 = queue.enqueue(async () => 2);
      const promise3 = queue.enqueue(async () => 3);

      expect(queue.getQueueDepth()).toBe(2);

      // Complete all
      await vi.advanceTimersByTimeAsync(1100);
      await Promise.all([promise1, promise2, promise3]);

      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('handles errors without breaking queue', async () => {
      const queue = createRequestQueue();
      const results: string[] = [];

      // First request succeeds
      const promise1 = queue.enqueue(async () => {
        results.push('first');
        return 'first';
      });

      // Second request fails
      const promise2 = queue.enqueue(async () => {
        results.push('second-start');
        throw new Error('Second failed');
      });

      // Catch to prevent unhandled rejection during timer advance
      promise2.catch(() => {
        /* expected rejection */
      });

      // Third request should still work
      const promise3 = queue.enqueue(async () => {
        results.push('third');
        return 'third';
      });

      // Process all
      await vi.advanceTimersByTimeAsync(100);

      const r1 = await promise1;
      await expect(promise2).rejects.toThrow('Second failed');
      const r3 = await promise3;

      expect(r1).toBe('first');
      expect(r3).toBe('third');
      expect(results).toEqual(['first', 'second-start', 'third']);
    });

    it('queue continues after error', async () => {
      const queue = createRequestQueue();

      // Fail first
      const promise1 = queue.enqueue(async () => {
        throw new Error('fail');
      });

      // Catch to prevent unhandled rejection during timer advance
      promise1.catch(() => {
        /* expected rejection */
      });

      // Succeed second
      const promise2 = queue.enqueue(async () => 'success');

      await vi.advanceTimersByTimeAsync(100);

      await expect(promise1).rejects.toThrow('fail');
      expect(await promise2).toBe('success');
    });
  });

  describe('createRequestQueue', () => {
    it('creates a new RequestQueue instance', () => {
      const queue = createRequestQueue();
      expect(queue).toBeInstanceOf(RequestQueue);
      expect(queue.getQueueDepth()).toBe(0);
      expect(queue.isProcessing()).toBe(false);
    });
  });
});
