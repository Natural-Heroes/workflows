/**
 * Shared error handler for MCP tools.
 * Converts various error types into LLM-friendly MCP responses.
 */

import { InventoryPlannerApiError, CircuitBreakerOpenError } from '../../services/inventory-planner/index.js';
import {
  createRateLimitError,
  createServiceUnavailableError,
  createAuthenticationError,
  createNotFoundError,
  createApiValidationError,
  createUnexpectedError,
  formatErrorForMcp,
} from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * Handles errors from tool execution and returns MCP-compatible error response.
 *
 * @param error - The caught error
 * @param toolName - Name of the tool for logging
 * @returns MCP tool result with isError: true
 */
export function handleToolError(
  error: unknown,
  toolName: string
): { content: { type: 'text'; text: string }[]; isError: true } {
  logger.error(`${toolName} error`, {
    error: error instanceof Error ? error.message : String(error),
  });

  // Handle Inventory Planner API errors
  if (error instanceof InventoryPlannerApiError) {
    switch (error.status) {
      case 400:
        return formatErrorForMcp(createApiValidationError(error.message));
      case 429:
        return formatErrorForMcp(createRateLimitError(error.retryAfterSeconds));
      case 503:
        return formatErrorForMcp(createServiceUnavailableError());
      case 401:
      case 403:
        return formatErrorForMcp(createAuthenticationError());
      case 404:
        return formatErrorForMcp(createNotFoundError('requested resource'));
      default:
        return formatErrorForMcp(createUnexpectedError(error));
    }
  }

  // Handle circuit breaker open
  if (error instanceof CircuitBreakerOpenError) {
    return formatErrorForMcp(createServiceUnavailableError());
  }

  // Handle unexpected errors
  return formatErrorForMcp(createUnexpectedError(error));
}
