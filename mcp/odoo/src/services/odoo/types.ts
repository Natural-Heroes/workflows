/**
 * Type definitions for the Odoo JSON-2 API client.
 */

/** Options for search_read calls */
export interface OdooSearchReadOptions {
  /** Maximum number of records to return */
  limit?: number;
  /** Number of records to skip */
  offset?: number;
  /** Sort order (e.g. "name asc, id desc") */
  order?: string;
  /** Odoo context to pass with the request */
  context?: Record<string, unknown>;
}

/** Odoo JSON-2 API error response structure */
export interface OdooErrorResponse {
  error: {
    /** Odoo exception class name (e.g. "odoo.exceptions.AccessError") */
    name: string;
    /** Human-readable error message */
    message: string;
    /** Additional error arguments */
    arguments: unknown[];
    /** Error context */
    context: Record<string, unknown>;
    /** Debug traceback (only in debug mode) */
    debug?: string;
  };
}

/** Options for read_group calls */
export interface OdooReadGroupOptions {
  /** Number of records to skip */
  offset?: number;
  /** Maximum number of groups to return */
  limit?: number;
  /** Sort order for groups (e.g. "balance desc") */
  orderby?: string;
  /** If true (default), only group by first groupby field; if false, group by all */
  lazy?: boolean;
}
