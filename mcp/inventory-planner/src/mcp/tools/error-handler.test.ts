/**
 * Unit tests for error-handler.ts
 *
 * Tests that all error types are translated to LLM-friendly messages
 * with actionable suggestions. Validates INFRA-03.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleToolError } from './error-handler.js';
import {
  InventoryPlannerApiError,
  CircuitBreakerOpenError,
} from '../../services/inventory-planner/index.js';

// Mock the logger to avoid noise in tests
vi.mock('../../lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('handleToolError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rate limit errors (429)', () => {
    it('returns isError: true for rate limit errors', () => {
      const error = new InventoryPlannerApiError('Rate limit exceeded', 429);

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('message includes "Rate limit exceeded"', () => {
      const error = new InventoryPlannerApiError('Rate limit exceeded', 429);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('Rate limit exceeded');
    });

    it('includes retry timing when retryAfterSeconds provided', () => {
      const error = new InventoryPlannerApiError(
        'Rate limit exceeded',
        429,
        'RATE_LIMITED',
        30
      );

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('30 seconds');
    });

    it('includes generic "few seconds" when no retry timing', () => {
      const error = new InventoryPlannerApiError('Rate limit exceeded', 429);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('few seconds');
    });
  });

  describe('Authentication errors (401, 403)', () => {
    it('returns isError: true for 401 errors', () => {
      const error = new InventoryPlannerApiError('Unauthorized', 401);

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('returns isError: true for 403 errors', () => {
      const error = new InventoryPlannerApiError('Forbidden', 403);

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('message mentions "Authentication failed" for 401', () => {
      const error = new InventoryPlannerApiError('Unauthorized', 401);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('Authentication failed');
    });

    it('message mentions "Authentication failed" for 403', () => {
      const error = new InventoryPlannerApiError('Forbidden', 403);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('Authentication failed');
    });

    it('suggests checking INVENTORY_PLANNER_API_KEY', () => {
      const error = new InventoryPlannerApiError('Unauthorized', 401);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('INVENTORY_PLANNER_API_KEY');
    });
  });

  describe('Not found errors (404)', () => {
    it('returns isError: true for 404 errors', () => {
      const error = new InventoryPlannerApiError('Not found', 404);

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('message includes "not found"', () => {
      const error = new InventoryPlannerApiError('Not found', 404);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text.toLowerCase()).toContain('not found');
    });

    it('suggests verifying ID or search criteria', () => {
      const error = new InventoryPlannerApiError('Not found', 404);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('Verify');
    });
  });

  describe('Service unavailable errors (503)', () => {
    it('returns isError: true for 503 errors', () => {
      const error = new InventoryPlannerApiError('Service unavailable', 503);

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('message indicates temporary unavailability', () => {
      const error = new InventoryPlannerApiError('Service unavailable', 503);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('temporarily unavailable');
    });

    it('suggests retry', () => {
      const error = new InventoryPlannerApiError('Service unavailable', 503);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text.toLowerCase()).toContain('retry');
    });
  });

  describe('API validation errors (400)', () => {
    it('returns isError: true for 400 errors', () => {
      const error = new InventoryPlannerApiError('Invalid parameter: page', 400);

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('passes through the API error message', () => {
      const error = new InventoryPlannerApiError(
        'Invalid parameter: page must be positive',
        400
      );

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain(
        'Invalid parameter: page must be positive'
      );
    });

    it('suggests checking request parameters', () => {
      const error = new InventoryPlannerApiError('Invalid parameter', 400);

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text.toLowerCase()).toContain('parameter');
    });
  });

  describe('Circuit breaker open', () => {
    it('returns isError: true for circuit breaker open error', () => {
      const error = new CircuitBreakerOpenError(
        'Circuit breaker is open - requests are blocked'
      );

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('message indicates service temporarily unavailable', () => {
      const error = new CircuitBreakerOpenError(
        'Circuit breaker is open - requests are blocked'
      );

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('temporarily unavailable');
    });

    it('does NOT expose "circuit breaker" terminology to LLM', () => {
      const error = new CircuitBreakerOpenError(
        'Circuit breaker is open - requests are blocked'
      );

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text.toLowerCase()).not.toContain(
        'circuit breaker'
      );
    });
  });

  describe('Unknown/unexpected errors', () => {
    it('returns isError: true for unknown errors', () => {
      const error = new Error('Something went terribly wrong internally');

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
    });

    it('returns generic message for unknown errors', () => {
      const error = new Error('Internal database corruption detected');

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).toContain('unexpected error');
    });

    it('does NOT expose internal error details to LLM', () => {
      const error = new Error('SQL injection detected in user input');

      const result = handleToolError(error, 'test_tool');

      expect(result.content[0].text).not.toContain('SQL injection');
      expect(result.content[0].text).not.toContain('detected');
    });

    it('handles non-Error thrown values', () => {
      const error = 'A string error was thrown';

      const result = handleToolError(error, 'test_tool');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('unexpected error');
    });

    it('handles null/undefined thrown values', () => {
      const result = handleToolError(null, 'test_tool');

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('unexpected error');
    });
  });

  describe('Response format', () => {
    it('returns content array with type "text"', () => {
      const error = new Error('test');

      const result = handleToolError(error, 'test_tool');

      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
    });

    it('always includes isError: true', () => {
      const errors = [
        new InventoryPlannerApiError('Rate limit', 429),
        new InventoryPlannerApiError('Unauthorized', 401),
        new InventoryPlannerApiError('Not found', 404),
        new InventoryPlannerApiError('Service unavailable', 503),
        new InventoryPlannerApiError('Bad request', 400),
        new CircuitBreakerOpenError('Open'),
        new Error('Unknown'),
      ];

      for (const error of errors) {
        const result = handleToolError(error, 'test_tool');
        expect(result.isError).toBe(true);
      }
    });
  });
});
