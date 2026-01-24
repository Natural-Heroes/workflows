/**
 * Odoo JSON-2 API client.
 *
 * Provides typed methods for common Odoo ORM operations using the
 * JSON-2 API format: /json/2/{model}/{method}
 *
 * Authentication is via bearer token (API key) per request.
 */

import { OdooApiError, createOdooApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { OdooErrorResponse, OdooSearchReadOptions, OdooReadGroupOptions } from './types.js';

export class OdooClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly database: string;

  constructor(baseUrl: string, apiKey: string, database: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, ''); // Strip trailing slashes
    this.apiKey = apiKey;
    this.database = database;
  }

  /**
   * Low-level JSON-2 API call.
   *
   * @param model - Odoo model name (e.g. "res.partner")
   * @param method - ORM method name (e.g. "search_read")
   * @param params - Method parameters as key-value pairs
   * @returns Parsed response data
   * @throws OdooApiError on HTTP or Odoo-level errors
   */
  async call<T>(model: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}/json/2/${model}/${method}`;

    logger.debug('Odoo API call', { model, method, url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `bearer ${this.apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Odoo-Database': this.database,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      let errorBody: OdooErrorResponse | undefined;
      try {
        errorBody = (await response.json()) as OdooErrorResponse;
      } catch {
        // Response body is not JSON, proceed without it
      }
      throw createOdooApiError(response.status, errorBody);
    }

    return (await response.json()) as T;
  }

  /**
   * Search and read records matching a domain filter.
   */
  async searchRead<T>(
    model: string,
    domain: unknown[],
    fields: string[],
    options?: OdooSearchReadOptions
  ): Promise<T[]> {
    return this.call<T[]>(model, 'search_read', {
      domain,
      fields,
      limit: options?.limit,
      offset: options?.offset,
      order: options?.order,
      context: options?.context ?? { lang: 'en_US' },
    });
  }

  /**
   * Read specific records by their IDs.
   */
  async read<T>(model: string, ids: number[], fields: string[]): Promise<T[]> {
    return this.call<T[]>(model, 'read', {
      ids,
      fields,
      context: { lang: 'en_US' },
    });
  }

  /**
   * Count records matching a domain filter.
   */
  async searchCount(model: string, domain: unknown[]): Promise<number> {
    return this.call<number>(model, 'search_count', { domain });
  }

  /**
   * Create a new record.
   *
   * Wraps values in vals_list parameter as required by the JSON-2 API.
   * Returns the ID of the created record.
   */
  async create(model: string, vals: Record<string, unknown>): Promise<number> {
    const result = await this.call<number[]>(model, 'create', {
      vals_list: [vals],
      context: { lang: 'en_US' },
    });
    // create returns an array of IDs; return the first
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Update existing records.
   *
   * Passes vals as explicit keyword argument as required by the JSON-2 API.
   */
  async write(model: string, ids: number[], vals: Record<string, unknown>): Promise<boolean> {
    return this.call<boolean>(model, 'write', {
      ids,
      vals,
    });
  }

  /**
   * Delete records.
   */
  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.call<boolean>(model, 'unlink', { ids });
  }

  /**
   * Aggregate records grouped by specified fields.
   */
  async readGroup<T>(
    model: string,
    domain: unknown[],
    fields: string[],
    groupby: string[],
    options?: OdooReadGroupOptions
  ): Promise<T[]> {
    return this.call<T[]>(model, 'read_group', {
      domain,
      fields,
      groupby,
      offset: options?.offset,
      limit: options?.limit,
      orderby: options?.orderby,
      lazy: options?.lazy ?? true,
    });
  }
}
