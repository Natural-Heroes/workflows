/**
 * Unit tests for Circuit Breaker.
 *
 * Tests INFRA-02: Circuit breaker state transitions and shouldTrip predicate.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCircuitBreaker,
} from './circuit-breaker.js';

describe('CircuitBreaker (INFRA-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const breaker = createCircuitBreaker();
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('starts with zero failures', () => {
      const breaker = createCircuitBreaker();
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('CLOSED state behavior', () => {
    it('allows requests in CLOSED state', async () => {
      const breaker = createCircuitBreaker();
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('resets failure count on success', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 3, successThreshold: 2, timeout: 1000 });

      // Cause some failures (but not enough to open)
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }
      expect(breaker.getFailureCount()).toBe(2);

      // Success should reset
      await breaker.execute(async () => 'success');
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('opening the circuit', () => {
    it('opens after failureThreshold consecutive failures', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 3, successThreshold: 2, timeout: 1000 });

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('opens with custom failureThreshold', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 5, successThreshold: 2, timeout: 1000 });

      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('OPEN state behavior', () => {
    it('blocks requests when OPEN', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('OPEN');

      // Should throw CircuitBreakerOpenError
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(
        CircuitBreakerOpenError
      );
    });

    it('CircuitBreakerOpenError has correct message', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      try {
        await breaker.execute(async () => 'success');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as Error).message).toContain('open');
      }
    });
  });

  describe('HALF_OPEN state transition', () => {
    it('transitions to HALF_OPEN after timeout', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('OPEN');

      // Advance past timeout
      vi.advanceTimersByTime(1001);

      // Next request should be allowed (transitions to HALF_OPEN)
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state behavior', () => {
    it('returns to CLOSED after successThreshold successes in HALF_OPEN', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(1001);

      // First success (still HALF_OPEN)
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Second success (back to CLOSED)
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('returns to OPEN on failure in HALF_OPEN', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(1001);

      // Success to enter HALF_OPEN
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Failure in HALF_OPEN should return to OPEN
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('shouldTrip predicate', () => {
    class ApiError extends Error {
      constructor(
        message: string,
        public status: number
      ) {
        super(message);
      }
    }

    it('4xx errors do not trip the circuit when shouldTrip returns false', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      const shouldTrip = (error: unknown) => {
        if (error instanceof ApiError) {
          return error.status >= 500;
        }
        return true;
      };

      // 4xx error should not trip
      try {
        await breaker.execute(async () => {
          throw new ApiError('Bad Request', 400);
        }, shouldTrip);
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('5xx errors do trip the circuit when shouldTrip returns true', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      const shouldTrip = (error: unknown) => {
        if (error instanceof ApiError) {
          return error.status >= 500;
        }
        return true;
      };

      // 5xx error should trip
      try {
        await breaker.execute(async () => {
          throw new ApiError('Server Error', 500);
        }, shouldTrip);
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('without shouldTrip, all errors count as failures', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      try {
        await breaker.execute(async () => {
          throw new ApiError('Bad Request', 400);
        });
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('reset()', () => {
    it('returns to CLOSED state', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('OPEN');

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('allows requests after reset', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });

      // Open the circuit
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      breaker.reset();

      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });
  });
});
