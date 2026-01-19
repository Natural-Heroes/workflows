/**
 * Request Queue for MRPeasy API.
 *
 * MRPeasy allows only 1 concurrent request.
 * This queue ensures requests are processed one at a time in FIFO order.
 */

import { logger } from '../../lib/logger.js';

interface QueuedRequest {
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/**
 * Request queue that enforces single-concurrent execution.
 *
 * All requests are processed one at a time in the order they were received.
 */
export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;

  /**
   * Adds a request to the queue and returns its result.
   *
   * @param fn - Async function to execute
   * @returns Promise that resolves with the function result
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn,
        resolve: resolve as (v: unknown) => void,
        reject,
      });

      logger.debug('Request enqueued', { queueDepth: this.queue.length });
      this.processNext();
    });
  }

  /**
   * Processes the next request in the queue.
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const { fn, resolve, reject } = this.queue.shift()!;

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  /**
   * Returns current queue depth (for debugging).
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  /**
   * Returns whether a request is currently being processed.
   */
  isProcessing(): boolean {
    return this.processing;
  }
}

/**
 * Creates a new request queue.
 *
 * @returns RequestQueue instance
 */
export function createRequestQueue(): RequestQueue {
  return new RequestQueue();
}
