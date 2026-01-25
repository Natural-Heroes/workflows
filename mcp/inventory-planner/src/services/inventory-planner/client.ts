/**
 * Inventory Planner REST API client.
 *
 * Uses native fetch (Node 18+) with API Key + Account ID headers.
 * All logging goes to stderr via the logger module.
 *
 * Includes resilience features:
 * - Request queue (max 1 concurrent request)
 * - Token bucket rate limiter
 * - Retry with exponential backoff (on 429, 503)
 * - Circuit breaker (5 failures opens, 30s timeout)
 */

import { logger } from '../../lib/logger.js';
import { TokenBucket, createRateLimiter } from './rate-limiter.js';
import { RequestQueue, createRequestQueue } from './request-queue.js';
import { withRetry } from './retry.js';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCircuitBreaker,
} from './circuit-breaker.js';
import type {
  Variant,
  VariantsParams,
  PurchaseOrder,
  PurchaseOrdersParams,
  PurchaseOrderItem,
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  UpdateReceivedQuantityPayload,
  UpdateVariantPayload,
  PaginationMeta,
  InventoryPlannerError,
} from './types.js';

/**
 * HTTP methods supported by the Inventory Planner API.
 */
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT';

/**
 * Inventory Planner API client configuration.
 */
export interface InventoryPlannerClientConfig {
  /** API key from Inventory Planner account */
  apiKey: string;
  /** Account ID from Inventory Planner */
  accountId: string;
  /** Base URL (optional, defaults to production) */
  baseUrl?: string;
  /** Maximum retry attempts (optional, defaults to 3) */
  maxRetries?: number;
  /** Enable circuit breaker (optional, defaults to true) */
  circuitBreakerEnabled?: boolean;
}

/**
 * Error thrown by Inventory Planner API client.
 */
export class InventoryPlannerApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly isRetryable: boolean;
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code?: string,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'InventoryPlannerApiError';
    this.status = status;
    this.code = code;
    this.isRetryable = [429, 503, 408, 502, 504].includes(status);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Response wrapper with pagination metadata.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta?: PaginationMeta;
}

/**
 * Inventory Planner REST API client.
 *
 * Provides typed methods for interacting with the Inventory Planner API.
 * Uses Authorization and Account headers for authentication.
 *
 * All requests automatically go through the resilience stack:
 * queue -> circuit breaker -> retry -> rate limiter -> fetch
 */
export class InventoryPlannerClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly accountId: string;

  // Resilience components
  private readonly rateLimiter: TokenBucket;
  private readonly queue: RequestQueue;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries: number;
  private readonly circuitBreakerEnabled: boolean;

  /**
   * Creates a new Inventory Planner API client.
   *
   * @param config - Client configuration with API credentials
   */
  constructor(config: InventoryPlannerClientConfig) {
    this.baseUrl = config.baseUrl ?? 'https://app.inventory-planner.com';
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;

    // Initialize resilience components
    this.rateLimiter = createRateLimiter();
    this.queue = createRequestQueue();
    this.circuitBreaker = createCircuitBreaker();
    this.maxRetries = config.maxRetries ?? 3;
    this.circuitBreakerEnabled = config.circuitBreakerEnabled ?? true;
  }

  /**
   * Makes an authenticated request to the Inventory Planner API.
   *
   * All requests go through the resilience stack:
   * 1. Queue - ensures max 1 concurrent request
   * 2. Circuit breaker - protects against sustained failures
   * 3. Retry - handles transient failures (429, 503)
   * 4. Rate limiter - prevents overwhelming the API
   *
   * @param endpoint - API endpoint (without base URL)
   * @param params - Query parameters (for GET) or ignored (for POST/PATCH)
   * @param method - HTTP method (defaults to GET)
   * @param body - Request body for POST/PATCH
   * @returns Parsed JSON response
   * @throws InventoryPlannerApiError on non-2xx responses
   * @throws CircuitBreakerOpenError if circuit breaker is open
   */
  private async request<T>(
    endpoint: string,
    params?: Record<string, unknown>,
    method: HttpMethod = 'GET',
    body?: unknown
  ): Promise<T> {
    logger.debug('Request queued', { endpoint, method });

    // Queue ensures single concurrent request
    return this.queue.enqueue(async () => {
      // Only count server-side errors (5xx, network) as circuit breaker failures.
      // Client errors (4xx) indicate bad requests, not service degradation.
      const shouldTrip = (error: unknown): boolean => {
        if (error instanceof InventoryPlannerApiError) {
          return error.status === 0 || error.status >= 500;
        }
        return true; // Network errors, unknown errors -> trip
      };

      // Wrapper for circuit breaker (optional)
      const executeWithOptionalCircuitBreaker = async (
        fn: () => Promise<T>
      ): Promise<T> => {
        if (this.circuitBreakerEnabled) {
          return this.circuitBreaker.execute(fn, shouldTrip);
        }
        return fn();
      };

      return executeWithOptionalCircuitBreaker(async () => {
        // Retry handles transient failures (429, 503)
        return withRetry(
          async () => {
            // Rate limiter ensures we don't exceed limits
            logger.debug('Waiting for rate limit token', { endpoint });
            await this.rateLimiter.waitForToken();
            logger.debug('Token acquired, sending request', { endpoint, method });

            return this.executeRequest<T>(endpoint, params, method, body);
          },
          { maxAttempts: this.maxRetries }
        );
      });
    });
  }

  /**
   * Executes the actual HTTP request.
   *
   * @param endpoint - API endpoint (without base URL)
   * @param params - Query parameters (used for GET requests)
   * @param method - HTTP method (GET, POST, PATCH, PUT)
   * @param body - Request body for POST/PATCH/PUT
   * @returns Parsed JSON response
   */
  private async executeRequest<T>(
    endpoint: string,
    params?: Record<string, unknown>,
    method: HttpMethod = 'GET',
    body?: unknown
  ): Promise<T> {
    // Build URL with query parameters (only for GET)
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (method === 'GET' && params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          // Handle special filter operators (e.g., replenishment_gt)
          url.searchParams.set(key, String(value));
        }
      }
    }

    logger.debug('Inventory Planner API request', {
      method,
      endpoint,
      params: method === 'GET' ? (params ?? {}) : undefined,
      body: method !== 'GET' ? body : undefined,
    });

    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        Authorization: this.apiKey,
        Account: this.accountId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      // Add body for POST/PATCH/PUT requests
      if (method !== 'GET' && body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url.toString(), fetchOptions);

      const duration = Date.now() - startTime;
      const rawBody = await response.text();

      // Success statuses: 200, 201, 202, 204
      const isSuccess = response.ok;

      if (!isSuccess) {
        // Parse error response safely
        let parsedError: unknown;
        try {
          parsedError = rawBody ? JSON.parse(rawBody) : undefined;
        } catch {
          parsedError = undefined;
        }

        const errorData = parsedError as Partial<InventoryPlannerError> | undefined;
        const message =
          (typeof parsedError === 'string' && parsedError) ||
          errorData?.message ||
          rawBody ||
          `HTTP ${response.status}: ${response.statusText}`;

        logger.error('Inventory Planner API error', {
          endpoint,
          method,
          status: response.status,
          message,
          duration,
          responseBody: rawBody?.slice(0, 2000),
          parsedError,
        });

        // Handle specific status codes with appropriate error messages
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
          throw new InventoryPlannerApiError(
            'Rate limit exceeded',
            429,
            'RATE_LIMITED',
            isNaN(retrySeconds as number) ? undefined : retrySeconds
          );
        }

        if (response.status === 503) {
          throw new InventoryPlannerApiError(
            'Inventory Planner service is temporarily unavailable',
            503,
            'SERVICE_UNAVAILABLE'
          );
        }

        if (response.status === 401 || response.status === 403) {
          throw new InventoryPlannerApiError(
            'Authentication failed. Check INVENTORY_PLANNER_API_KEY and INVENTORY_PLANNER_ACCOUNT_ID.',
            response.status,
            'AUTH_ERROR'
          );
        }

        if (response.status === 404) {
          throw new InventoryPlannerApiError(
            'Resource not found',
            404,
            'NOT_FOUND'
          );
        }

        throw new InventoryPlannerApiError(
          message,
          response.status,
          errorData?.code
        );
      }

      // Parse successful response body (may be empty for 204)
      let data: T;
      if (!rawBody) {
        logger.debug('Inventory Planner API response has empty body', {
          endpoint,
          method,
          status: response.status,
          duration,
        });
        data = {} as T;
      } else {
        try {
          data = JSON.parse(rawBody) as T;
        } catch {
          logger.warn('Inventory Planner API response is not JSON, returning raw text', {
            endpoint,
            method,
            status: response.status,
            duration,
            rawBody: rawBody.slice(0, 500),
          });
          data = rawBody as unknown as T;
        }
      }

      logger.debug('Inventory Planner API response', {
        endpoint,
        method,
        status: response.status,
        duration,
      });

      return data;
    } catch (error) {
      // Re-throw InventoryPlannerApiError as-is
      if (error instanceof InventoryPlannerApiError) {
        throw error;
      }

      // Wrap other errors (network errors, etc.)
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Inventory Planner API request failed', {
        endpoint,
        error: message,
      });

      throw new InventoryPlannerApiError(`Request failed: ${message}`, 0);
    }
  }

  // ===========================================================================
  // Variants (Core Read Operations)
  // ===========================================================================

  /**
   * Get variants with demand forecasting and replenishment metrics.
   *
   * This is the primary endpoint for inventory analysis.
   * Supports extensive filtering including replenishment_gt for reorder items.
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Paginated list of variants with metrics
   */
  async getVariants(params?: VariantsParams): Promise<PaginatedResponse<Variant>> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      meta?: PaginationMeta;
      variants?: Variant[];
    }>('/api/v1/variants', params as Record<string, unknown>);

    return {
      data: response.variants ?? [],
      meta: response.meta,
    };
  }

  /**
   * Get a single variant by ID.
   *
   * @param id - Variant ID
   * @returns Variant details with full metrics
   */
  async getVariant(id: string): Promise<Variant> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      variant?: Variant;
    }>(`/api/v1/variants/${id}`);

    if (!response.variant) {
      throw new InventoryPlannerApiError('Variant not found', 404, 'NOT_FOUND');
    }

    return response.variant;
  }

  /**
   * Get variants needing replenishment.
   *
   * Convenience method that filters for items with replenishment > 0.
   *
   * @param params - Additional query parameters
   * @returns Paginated list of variants needing reorder
   */
  async getReplenishment(
    params?: Omit<VariantsParams, 'replenishment_gt'>
  ): Promise<PaginatedResponse<Variant>> {
    return this.getVariants({
      ...params,
      replenishment_gt: 0,
    });
  }

  // ===========================================================================
  // Purchase Orders (Core Read Operations)
  // ===========================================================================

  /**
   * Get purchase orders, transfers, and assembly orders.
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Paginated list of purchase orders
   */
  async getPurchaseOrders(
    params?: PurchaseOrdersParams
  ): Promise<PaginatedResponse<PurchaseOrder>> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      meta?: PaginationMeta;
      'purchase-orders'?: PurchaseOrder[];
    }>('/api/v1/purchase-orders', params as Record<string, unknown>);

    return {
      data: response['purchase-orders'] ?? [],
      meta: response.meta,
    };
  }

  /**
   * Get a single purchase order by ID.
   *
   * @param id - Purchase order ID
   * @returns Purchase order details with line items
   */
  async getPurchaseOrder(id: string): Promise<PurchaseOrder> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      'purchase-order'?: PurchaseOrder;
    }>(`/api/v1/purchase-orders/${id}`);

    if (!response['purchase-order']) {
      throw new InventoryPlannerApiError('Purchase order not found', 404, 'NOT_FOUND');
    }

    return response['purchase-order'];
  }

  /**
   * Get line items for a purchase order.
   *
   * @param orderId - Purchase order ID
   * @returns List of line items
   */
  async getPurchaseOrderItems(orderId: string): Promise<PurchaseOrderItem[]> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      items?: PurchaseOrderItem[];
    }>(`/api/v1/purchase-orders/${orderId}/items`);

    return response.items ?? [];
  }

  // ===========================================================================
  // Write Operations (Phase 2)
  // ===========================================================================

  /**
   * Create a new purchase order.
   *
   * @param payload - Purchase order creation data
   * @returns Created purchase order
   */
  async createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      'purchase-order'?: PurchaseOrder;
    }>('/api/v1/purchase-orders', undefined, 'POST', payload);

    if (!response['purchase-order']) {
      throw new InventoryPlannerApiError('Failed to create purchase order', 500);
    }

    return response['purchase-order'];
  }

  /**
   * Update an existing purchase order.
   *
   * @param id - Purchase order ID
   * @param payload - Fields to update
   * @returns Updated purchase order
   */
  async updatePurchaseOrder(
    id: string,
    payload: UpdatePurchaseOrderPayload
  ): Promise<PurchaseOrder> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      'purchase-order'?: PurchaseOrder;
    }>(`/api/v1/purchase-orders/${id}`, undefined, 'PATCH', payload);

    if (!response['purchase-order']) {
      throw new InventoryPlannerApiError('Failed to update purchase order', 500);
    }

    return response['purchase-order'];
  }

  /**
   * Update received quantities on a purchase order.
   *
   * @param orderId - Purchase order ID
   * @param items - Items with received quantities
   * @returns Updated items
   */
  async updateReceivedQuantities(
    orderId: string,
    items: UpdateReceivedQuantityPayload[]
  ): Promise<PurchaseOrderItem[]> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      items?: PurchaseOrderItem[];
    }>(`/api/v1/purchase-orders/${orderId}/items`, undefined, 'PATCH', { items });

    return response.items ?? [];
  }

  /**
   * Update a variant's planning parameters.
   *
   * @param id - Variant ID
   * @param payload - Fields to update
   * @returns Updated variant
   */
  async updateVariant(id: string, payload: UpdateVariantPayload): Promise<Variant> {
    const response = await this.request<{
      result?: { status: string; message?: string };
      variant?: Variant;
    }>(`/api/v1/variants/${id}`, undefined, 'PATCH', payload);

    if (!response.variant) {
      throw new InventoryPlannerApiError('Failed to update variant', 500);
    }

    return response.variant;
  }
}

// Re-export CircuitBreakerOpenError for callers to catch
export { CircuitBreakerOpenError } from './circuit-breaker.js';
