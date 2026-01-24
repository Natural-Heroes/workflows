/**
 * Centralized error handling utilities for MCP tools.
 *
 * Provides LLM-readable error messages that are actionable and helpful.
 * Separates user-facing messages from internal debugging details.
 * Includes Odoo-specific error mapping for JSON-2 API responses.
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
 * Odoo-specific API error with status code and error details.
 */
export class OdooApiError extends Error {
  /** HTTP status code from the Odoo response */
  public readonly statusCode: number;

  /** Odoo exception class name (e.g. "odoo.exceptions.AccessError") */
  public readonly odooErrorName?: string;

  /** Odoo debug traceback (if available) */
  public readonly odooDebug?: string;

  constructor(options: {
    message: string;
    statusCode: number;
    odooErrorName?: string;
    odooDebug?: string;
  }) {
    super(options.message);
    this.name = 'OdooApiError';
    this.statusCode = options.statusCode;
    this.odooErrorName = options.odooErrorName;
    this.odooDebug = options.odooDebug;
  }
}

/**
 * Maps an Odoo error response to a user-friendly OdooApiError.
 *
 * Handles known Odoo exception types and HTTP status codes.
 *
 * @param status - HTTP status code
 * @param body - Parsed response body (may contain Odoo error details)
 * @returns OdooApiError with appropriate message
 */
export function createOdooApiError(
  status: number,
  body?: { error?: { name?: string; message?: string; arguments?: unknown[]; debug?: string } }
): OdooApiError {
  const odooError = body?.error;
  const odooName = odooError?.name;
  const odooMessage = odooError?.message || 'Unknown error';
  const odooDebug = odooError?.debug;

  let userMessage: string;

  // Map Odoo exception names to user-friendly messages
  if (odooName === 'odoo.exceptions.AccessError') {
    userMessage = "You don't have permission to access this resource.";
  } else if (odooName === 'odoo.exceptions.ValidationError') {
    userMessage = `Validation failed: ${odooMessage}`;
  } else if (odooName === 'odoo.exceptions.MissingError') {
    userMessage = 'Record not found.';
  } else if (odooName === 'odoo.exceptions.UserError') {
    userMessage = odooMessage;
  } else if (status === 401) {
    userMessage =
      'Your Odoo API key may have expired. Generate a new one in Odoo Settings > Security > API Keys.';
  } else if (status === 429) {
    userMessage = 'Odoo rate limit exceeded. Try again in a few seconds.';
  } else {
    userMessage = `Odoo API error (${status}): ${odooMessage}`;
  }

  logger.error('Odoo API error', {
    status,
    odooName,
    odooMessage,
    hasDebug: !!odooDebug,
  });

  return new OdooApiError({
    message: userMessage,
    statusCode: status,
    odooErrorName: odooName,
    odooDebug,
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
