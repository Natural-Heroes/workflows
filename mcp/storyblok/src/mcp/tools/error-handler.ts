/**
 * Shared error handler for MCP tools.
 *
 * Converts Storyblok API errors into LLM-friendly MCP responses.
 * Maps HTTP status codes to actionable messages with suggestions.
 */

import { StoryblokApiError } from '../../services/storyblok/index.js';
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
 * 1. StoryblokApiError: Maps HTTP status codes to actionable messages
 * 2. Unknown errors: Generic unexpected error message
 */
export function handleToolError(
  error: unknown,
  toolName: string
): McpErrorResponse {
  logger.error(`${toolName} error`, {
    error: error instanceof Error ? error.message : String(error),
  });

  if (error instanceof StoryblokApiError) {
    switch (error.status) {
      case 401:
        return formatMcpError(
          'Authentication failed.',
          'Check that STORYBLOK_MANAGEMENT_TOKEN is valid and not expired.'
        );
      case 403:
        return formatMcpError(
          'Forbidden. Insufficient permissions.',
          'Check that the management token has access to this space and the required permissions.'
        );
      case 404:
        return formatMcpError(
          'Resource not found.',
          'Verify the ID exists. The story, component, or asset may have been deleted.'
        );
      case 409:
        return formatMcpError(
          'Conflict. The resource was modified by another user.',
          'Fetch the latest version and retry the update.'
        );
      case 422:
        return formatMcpError(
          `Validation error: ${error.detail || error.message}`,
          'Check the input parameters. Required fields may be missing or invalid.'
        );
      case 429:
        return formatMcpError(
          'Rate limit exceeded.',
          'Wait a moment before retrying. Storyblok allows 3 req/sec for Management API.'
        );
      default:
        return formatMcpError(
          `Storyblok API error (HTTP ${error.status}): ${error.message}`,
          'Try again in a few seconds. If the issue persists, check Storyblok status.'
        );
    }
  }

  // Fallback for unexpected errors
  const message = error instanceof Error ? error.message : String(error);
  return formatMcpError(
    `Unexpected error: ${message}`,
    'This may be a transient issue. Try again or check server logs for details.'
  );
}
