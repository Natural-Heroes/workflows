/**
 * Circuit Breaker for Perdoo GraphQL API.
 *
 * Protects against sustained failures by temporarily stopping requests.
 * States: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing).
 */

import { logger } from '../../lib/logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Configuration for circuit breaker behavior.
 */
export interface CircuitBreakerConfig {
  /** Number of failures to trigger OPEN state */
  failureThreshold: number;
  /** Number of successes in HALF_OPEN to return to CLOSED */
  successThreshold: number;
  /** Milliseconds before transitioning from OPEN to HALF_OPEN */
  timeout: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
};

/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Circuit breaker that protects against sustained failures.
 *
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Requests are blocked, returns error immediately
 * - HALF_OPEN: Testing state, limited requests to check if service recovered
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailure = 0;
  private readonly config: CircuitBreakerConfig;

  /**
   * Creates a new circuit breaker.
   *
   * @param config - Circuit breaker configuration
   */
  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Executes a function through the circuit breaker.
   *
   * @param fn - Async function to execute
   * @returns Promise with function result
   * @throws CircuitBreakerOpenError if circuit is open
   * @throws Original error if function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure >= this.config.timeout) {
        logger.info('Circuit breaker transitioning to HALF_OPEN');
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        throw new CircuitBreakerOpenError(
          'Circuit breaker is open - requests are blocked'
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Records a successful request.
   */
  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        logger.info('Circuit breaker transitioning to CLOSED');
        this.state = 'CLOSED';
        this.failures = 0;
      }
    } else {
      // Reset failure count on success in CLOSED state
      this.failures = 0;
    }
  }

  /**
   * Records a failed request.
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Single failure in HALF_OPEN returns to OPEN
      logger.warn('Circuit breaker returning to OPEN from HALF_OPEN');
      this.state = 'OPEN';
    } else if (this.failures >= this.config.failureThreshold) {
      logger.error('Circuit breaker transitioning to OPEN', {
        failures: this.failures,
        threshold: this.config.failureThreshold,
      });
      this.state = 'OPEN';
    }
  }

  /**
   * Returns current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Returns current failure count.
   */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Manually resets the circuit breaker to CLOSED state.
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    logger.info('Circuit breaker manually reset');
  }
}

/**
 * Creates a circuit breaker with Perdoo defaults.
 *
 * @param config - Partial configuration to override defaults
 * @returns CircuitBreaker instance
 */
export function createCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return new CircuitBreaker({ ...DEFAULT_CONFIG, ...config });
}

export { DEFAULT_CONFIG as CIRCUIT_BREAKER_DEFAULT_CONFIG };
