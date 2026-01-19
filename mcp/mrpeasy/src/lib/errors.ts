/**
 * Centralized error handling utilities for MCP tools.
 *
 * Provides LLM-readable error messages that are actionable and helpful.
 * Separates user-facing messages from internal debugging details.
 */

import { logger } from './logger.js';

/**
 * Error class for MCP tool errors.
 *
 * Provides both user-facing messages (for LLM consumption) and internal
 * details (for debugging/logging).
 */
export class McpToolError extends Error {
  /** LLM-friendly error message (returned to the user) */
  public readonly userMessage: string;

  /** Internal details for debugging (logged, not returned) */
  public readonly internalDetails?: string;

  /** Whether the LLM should retry the operation */
  public readonly isRetryable: boolean;

  /** Suggested action the LLM can take */
  public readonly suggestedAction?: string;

  /** Machine-readable error code */
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

/**
 * Creates a rate limit error with retry guidance.
 *
 * @param retryAfterSeconds - Optional seconds until retry is allowed
 * @returns McpToolError with appropriate message
 */
export function createRateLimitError(retryAfterSeconds?: number): McpToolError {
  const retryMessage = retryAfterSeconds
    ? `Try again in ${retryAfterSeconds} seconds.`
    : 'Try again in a few seconds.';

  return new McpToolError({
    userMessage: `Rate limit exceeded. ${retryMessage}`,
    isRetryable: true,
    suggestedAction: 'Wait and retry the request.',
    errorCode: 'RATE_LIMITED',
  });
}

/**
 * Creates a service unavailable error.
 *
 * @returns McpToolError with appropriate message
 */
export function createServiceUnavailableError(): McpToolError {
  return new McpToolError({
    userMessage: 'The MRPeasy service is temporarily unavailable. Try again later.',
    isRetryable: true,
    suggestedAction: 'Wait a moment and retry the request.',
    errorCode: 'SERVICE_UNAVAILABLE',
  });
}

/**
 * Creates an authentication error.
 *
 * @returns McpToolError with appropriate message
 */
export function createAuthenticationError(): McpToolError {
  return new McpToolError({
    userMessage: 'Authentication failed. The API credentials may be invalid or expired.',
    isRetryable: false,
    suggestedAction: 'Check that MRPEASY_API_KEY and MRPEASY_API_SECRET are correct.',
    errorCode: 'AUTH_ERROR',
  });
}

/**
 * Creates a resource not found error.
 *
 * @param resource - Description of the resource that was not found
 * @returns McpToolError with appropriate message
 */
export function createNotFoundError(resource: string): McpToolError {
  return new McpToolError({
    userMessage: `The ${resource} was not found.`,
    isRetryable: false,
    suggestedAction: 'Verify the ID or search criteria is correct.',
    errorCode: 'NOT_FOUND',
  });
}

/**
 * Creates an input validation error.
 *
 * @param field - The field that failed validation
 * @param issue - Description of the validation issue
 * @returns McpToolError with appropriate message
 */
export function createValidationError(field: string, issue: string): McpToolError {
  return new McpToolError({
    userMessage: `Invalid input: ${field} ${issue}.`,
    isRetryable: false,
    suggestedAction: 'Correct the input and try again.',
    errorCode: 'VALIDATION_ERROR',
  });
}

/**
 * Creates an error for unexpected/unknown errors.
 *
 * Logs internal details but returns a generic user message.
 *
 * @param error - The original error
 * @returns McpToolError with appropriate message
 */
export function createUnexpectedError(error: unknown): McpToolError {
  const internalDetails = error instanceof Error ? error.message : String(error);

  // Log internal details for debugging
  logger.error('Unexpected error occurred', { internalDetails });

  return new McpToolError({
    userMessage: 'An unexpected error occurred. Please try again.',
    internalDetails,
    isRetryable: false,
    suggestedAction: 'If the problem persists, contact support.',
    errorCode: 'UNEXPECTED_ERROR',
  });
}

/**
 * Formats an McpToolError into an MCP-compatible error response.
 *
 * @param error - The McpToolError to format
 * @returns MCP tool result with isError: true
 */
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

/**
 * Checks if an HTTP status code indicates a retryable error.
 *
 * @param status - HTTP status code
 * @returns true if the error is retryable
 */
export function isRetryableHttpStatus(status: number): boolean {
  return [429, 503, 408, 502, 504].includes(status);
}
