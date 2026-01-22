/**
 * Shared error handler for Shopify MCP tools.
 * Converts various error types into LLM-friendly MCP responses.
 */

import { ShopifyApiError } from '../../services/shopify/index.js';
import {
  createRateLimitError,
  createAuthenticationError,
  createGraphQLError,
  createStoreNotFoundError,
  createUnexpectedError,
  formatErrorForMcp,
} from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * Handles errors from tool execution and returns MCP-compatible error response.
 */
export function handleToolError(
  error: unknown,
  toolName: string,
  availableStores?: string[]
): { content: { type: 'text'; text: string }[]; isError: true } {
  logger.error(`${toolName} error`, {
    error: error instanceof Error ? error.message : String(error),
  });

  if (error instanceof ShopifyApiError) {
    if (error.status === 429) {
      return formatErrorForMcp(createRateLimitError());
    }
    if (error.status === 401 || error.status === 403) {
      return formatErrorForMcp(createAuthenticationError(error.store));
    }
    if (error.status === 400 && error.message.includes('not configured')) {
      return formatErrorForMcp(
        createStoreNotFoundError(error.store, availableStores ?? [])
      );
    }
    if (error.graphqlErrors) {
      return formatErrorForMcp(createGraphQLError(error.graphqlErrors));
    }
    return formatErrorForMcp(createUnexpectedError(error));
  }

  return formatErrorForMcp(createUnexpectedError(error));
}
