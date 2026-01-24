/**
 * Centralized error handling utilities for Shopify MCP tools.
 *
 * Provides LLM-readable error messages that are actionable and helpful.
 */

import { logger } from './logger.js';

export class McpToolError extends Error {
  public readonly userMessage: string;
  public readonly internalDetails?: string;
  public readonly isRetryable: boolean;
  public readonly suggestedAction?: string;
  public readonly errorCode?: string;

  constructor(options: {
    userMessage: string;
    internalDetails?: string;
    isRetryable?: boolean;
    suggestedAction?: string;
    errorCode?: string;
  }) {
    super(options.userMessage);
    this.name = 'McpToolError';
    this.userMessage = options.userMessage;
    this.internalDetails = options.internalDetails;
    this.isRetryable = options.isRetryable ?? false;
    this.suggestedAction = options.suggestedAction;
    this.errorCode = options.errorCode;
  }
}

export function createRateLimitError(retryAfterSeconds?: number): McpToolError {
  const retryMessage = retryAfterSeconds
    ? `Try again in ${retryAfterSeconds} seconds.`
    : 'Try again in a few seconds.';

  return new McpToolError({
    userMessage: `Shopify rate limit exceeded. ${retryMessage}`,
    isRetryable: true,
    suggestedAction: 'Wait and retry the request.',
    errorCode: 'RATE_LIMITED',
  });
}

export function createAuthenticationError(store?: string): McpToolError {
  const storeMsg = store ? ` for store "${store}"` : '';
  return new McpToolError({
    userMessage: `Authentication failed${storeMsg}. The access token may be invalid or lack required scopes.`,
    isRetryable: false,
    suggestedAction: 'Check that the SHOPIFY_STORE_*_TOKEN has the required Admin API scopes.',
    errorCode: 'AUTH_ERROR',
  });
}

export function createStoreNotFoundError(store: string, available: string[]): McpToolError {
  return new McpToolError({
    userMessage: `Store "${store}" is not configured. Available stores: ${available.join(', ')}.`,
    isRetryable: false,
    suggestedAction: `Use one of the available stores: ${available.join(', ')}.`,
    errorCode: 'STORE_NOT_FOUND',
  });
}

export function createNotFoundError(resource: string): McpToolError {
  return new McpToolError({
    userMessage: `The ${resource} was not found.`,
    isRetryable: false,
    suggestedAction: 'Verify the ID or search criteria is correct.',
    errorCode: 'NOT_FOUND',
  });
}

export function createValidationError(field: string, issue: string): McpToolError {
  return new McpToolError({
    userMessage: `Invalid input: ${field} ${issue}.`,
    isRetryable: false,
    suggestedAction: 'Correct the input and try again.',
    errorCode: 'VALIDATION_ERROR',
  });
}

export function createGraphQLError(errors: Array<{ message: string }>): McpToolError {
  const messages = errors.map((e) => e.message).join('; ');
  return new McpToolError({
    userMessage: `Shopify API error: ${messages}`,
    isRetryable: false,
    suggestedAction: 'Check the query parameters and try again.',
    errorCode: 'GRAPHQL_ERROR',
  });
}

export function createUnexpectedError(error: unknown): McpToolError {
  const internalDetails = error instanceof Error ? error.message : String(error);
  logger.error('Unexpected error occurred', { internalDetails });

  return new McpToolError({
    userMessage: 'An unexpected error occurred. Please try again.',
    internalDetails,
    isRetryable: false,
    suggestedAction: 'If the problem persists, check the server logs.',
    errorCode: 'UNEXPECTED_ERROR',
  });
}

export function formatErrorForMcp(
  error: McpToolError
): { content: { type: 'text'; text: string }[]; isError: true } {
  let text = error.userMessage;
  if (error.suggestedAction) {
    text += `\n\nSuggestion: ${error.suggestedAction}`;
  }
  return {
    content: [{ type: 'text' as const, text }],
    isError: true,
  };
}
