/**
 * Shared error handler for MCP tools.
 *
 * Converts various Perdoo error types into LLM-friendly MCP responses.
 * Maps GraphQL/HTTP errors to actionable messages with suggestions.
 */

import {
  PerdooApiError,
  PerdooHttpError,
  CircuitBreakerOpenError,
} from '../../services/perdoo/index.js';
import { logger } from '../../lib/logger.js';

/**
 * MCP error response format.
 */
type McpErrorResponse = {
  content: { type: 'text'; text: string }[];
  isError: true;
};

/**
 * Formats an error message with an optional suggestion into an MCP error response.
 *
 * @param message - The error message
 * @param suggestion - Optional suggestion for recovery
 * @returns Formatted MCP error response
 */
function formatMcpError(message: string, suggestion?: string): McpErrorResponse {
  const text = suggestion
    ? `Error: ${message}\n\nSuggestion: ${suggestion}`
    : `Error: ${message}`;

  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

/**
 * Handles errors from tool execution and returns MCP-compatible error response.
 *
 * Error handling priority:
 * 1. PerdooHttpError: Maps HTTP status codes to actionable messages
 * 2. PerdooApiError: Maps GraphQL error classifications to messages
 * 3. CircuitBreakerOpenError: Service temporarily unavailable
 * 4. Unknown errors: Generic unexpected error message
 *
 * @param error - The caught error
 * @param toolName - Name of the tool for logging context
 * @returns MCP tool result with isError: true
 */
export function handleToolError(
  error: unknown,
  toolName: string
): McpErrorResponse {
  logger.error(`${toolName} error`, {
    error: error instanceof Error ? error.message : String(error),
  });

  // Handle HTTP-level errors (non-2xx responses)
  if (error instanceof PerdooHttpError) {
    switch (error.status) {
      case 400: {
        // Bad request - show the actual validation error from the API
        let detail = '';
        if (error.responseBody) {
          try {
            const body = JSON.parse(error.responseBody);
            if (body.errors) {
              detail = body.errors.map((e: { message?: string }) => e.message).join('; ');
            }
          } catch {
            detail = error.responseBody.slice(0, 200);
          }
        }
        return formatMcpError(
          `Bad request: ${detail || 'Invalid GraphQL operation or input.'}`,
          'Check the operation parameters. The request was rejected by the Perdoo API.'
        );
      }
      case 401:
      case 403:
        return formatMcpError(
          'Authentication failed.',
          'Check that PERDOO_API_TOKEN is valid and not expired.'
        );
      case 429:
        return formatMcpError(
          'Rate limit exceeded.',
          'Wait a moment before retrying. The server will automatically back off.'
        );
      default:
        return formatMcpError(
          `Perdoo API error (HTTP ${error.status}).`,
          'Try again in a few seconds. If the issue persists, check Perdoo status.'
        );
    }
  }

  // Handle GraphQL-level errors (errors in response body)
  if (error instanceof PerdooApiError) {
    if (error.isAuthError) {
      return formatMcpError(
        'Authentication failed.',
        'Check that PERDOO_API_TOKEN is valid and has the required permissions.'
      );
    }

    if (error.isRateLimited) {
      return formatMcpError(
        'Rate limit exceeded.',
        'Wait a moment before retrying. The server will automatically back off.'
      );
    }

    return formatMcpError(
      error.message,
      'Check the operation parameters and try again.'
    );
  }

  // Handle circuit breaker open state
  if (error instanceof CircuitBreakerOpenError) {
    return formatMcpError(
      'Perdoo service is temporarily unavailable.',
      'The service has experienced repeated failures. Wait 30 seconds before retrying.'
    );
  }

  // Fallback for unexpected errors
  const message = error instanceof Error ? error.message : String(error);
  return formatMcpError(
    `Unexpected error: ${message}`,
    'This may be a transient issue. Try again or check server logs for details.'
  );
}
