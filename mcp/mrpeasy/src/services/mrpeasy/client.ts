/**
 * MRPeasy REST API client.
 *
 * Uses native fetch (Node 18+) with Basic Auth.
 * All logging goes to stderr via the logger module.
 *
 * Includes resilience features:
 * - Request queue (max 1 concurrent request)
 * - Token bucket rate limiter (100 requests per 10 seconds)
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
  MrpEasyApiResponse,
  MrpEasyError,
  StockItem,
  StockItemsParams,
  CustomerOrder,
  CustomerOrdersParams,
  ManufacturingOrder,
  ManufacturingOrdersParams,
  Product,
  ProductsParams,
  Item,
  ItemsParams,
} from './types.js';

/**
 * MRPeasy API client configuration.
 */
export interface MrpEasyClientConfig {
  /** API key from MRPeasy account */
  apiKey: string;
  /** API secret from MRPeasy account */
  apiSecret: string;
  /** Base URL (optional, defaults to production) */
  baseUrl?: string;
  /** Maximum retry attempts (optional, defaults to 3) */
  maxRetries?: number;
  /** Enable circuit breaker (optional, defaults to true) */
  circuitBreakerEnabled?: boolean;
}

/**
 * Error thrown by MRPeasy API client.
 */
export class MrpEasyApiError extends Error {
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
    this.name = 'MrpEasyApiError';
    this.status = status;
    this.code = code;
    this.isRetryable = [429, 503, 408, 502, 504].includes(status);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * MRPeasy REST API client.
 *
 * Provides typed methods for interacting with the MRPeasy API.
 * Uses Basic Auth with base64 encoded credentials.
 *
 * All requests automatically go through the resilience stack:
 * queue → circuit breaker → retry → rate limiter → fetch
 */
export class MrpEasyClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  // Resilience components
  private readonly rateLimiter: TokenBucket;
  private readonly queue: RequestQueue;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries: number;
  private readonly circuitBreakerEnabled: boolean;

  /**
   * Creates a new MRPeasy API client.
   *
   * @param config - Client configuration with API credentials
   */
  constructor(config: MrpEasyClientConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.mrpeasy.com/rest/v1';

    // Basic Auth: base64 encode "apiKey:apiSecret"
    const credentials = `${config.apiKey}:${config.apiSecret}`;
    const encoded = Buffer.from(credentials).toString('base64');
    this.authHeader = `Basic ${encoded}`;

    // Initialize resilience components
    this.rateLimiter = createRateLimiter();
    this.queue = createRequestQueue();
    this.circuitBreaker = createCircuitBreaker();
    this.maxRetries = config.maxRetries ?? 3;
    this.circuitBreakerEnabled = config.circuitBreakerEnabled ?? true;
  }

  /**
   * Makes an authenticated GET request to the MRPeasy API.
   *
   * All requests go through the resilience stack:
   * 1. Queue - ensures max 1 concurrent request
   * 2. Circuit breaker - protects against sustained failures
   * 3. Retry - handles transient failures (429, 503)
   * 4. Rate limiter - ensures max 100 requests per 10 seconds
   *
   * @param endpoint - API endpoint (without base URL)
   * @param params - Query parameters
   * @returns Parsed JSON response
   * @throws MrpEasyApiError on non-2xx responses
   * @throws CircuitBreakerOpenError if circuit breaker is open
   */
  private async request<T, P extends object = object>(
    endpoint: string,
    params?: P
  ): Promise<T> {
    logger.debug('Request queued', { endpoint });

    // Queue ensures single concurrent request
    return this.queue.enqueue(async () => {
      // Wrapper for circuit breaker (optional)
      const executeWithOptionalCircuitBreaker = async (
        fn: () => Promise<T>
      ): Promise<T> => {
        if (this.circuitBreakerEnabled) {
          return this.circuitBreaker.execute(fn);
        }
        return fn();
      };

      return executeWithOptionalCircuitBreaker(async () => {
        // Retry handles transient failures (429, 503)
        return withRetry(
          async () => {
            // Rate limiter ensures we don't exceed 100/10s
            logger.debug('Waiting for rate limit token', { endpoint });
            await this.rateLimiter.waitForToken();
            logger.debug('Token acquired, sending request', { endpoint });

            return this.executeRequest<T, P>(endpoint, params);
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
   * @param params - Query parameters
   * @returns Parsed JSON response
   */
  private async executeRequest<T, P extends object = object>(
    endpoint: string,
    params?: P
  ): Promise<T> {
    // Build URL with query parameters
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      for (const [key, value] of Object.entries(params) as [string, unknown][]) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    logger.debug('MRPeasy API request', {
      method: 'GET',
      endpoint,
      params: params ?? {},
    });

    const startTime = Date.now();

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      const duration = Date.now() - startTime;

      // Handle 206 Partial Content (paginated responses) as success
      if (!response.ok && response.status !== 206) {
        // Try to parse error response
        let errorData: Partial<MrpEasyError> = {};
        try {
          errorData = (await response.json()) as Partial<MrpEasyError>;
        } catch {
          // Response body is not JSON
        }

        logger.error('MRPeasy API error', {
          endpoint,
          status: response.status,
          message: errorData.message ?? response.statusText,
          duration,
        });

        // Handle specific status codes with appropriate error messages
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
          throw new MrpEasyApiError(
            'Rate limit exceeded',
            429,
            'RATE_LIMITED',
            isNaN(retrySeconds as number) ? undefined : retrySeconds
          );
        }

        if (response.status === 503) {
          throw new MrpEasyApiError(
            'MRPeasy service is temporarily unavailable',
            503,
            'SERVICE_UNAVAILABLE'
          );
        }

        if (response.status === 401 || response.status === 403) {
          throw new MrpEasyApiError(
            'Authentication failed. Check MRPEASY_API_KEY and MRPEASY_API_SECRET.',
            response.status,
            'AUTH_ERROR'
          );
        }

        if (response.status === 404) {
          throw new MrpEasyApiError(
            'Resource not found',
            404,
            'NOT_FOUND'
          );
        }

        throw new MrpEasyApiError(
          errorData.message ?? `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData.code
        );
      }

      const data = (await response.json()) as T;

      // Store Content-Range header for pagination parsing
      const contentRange = response.headers.get('Content-Range');
      if (contentRange) {
        (data as Record<string, unknown>)._contentRange = contentRange;
      }

      logger.debug('MRPeasy API response', {
        endpoint,
        status: response.status,
        duration,
        contentRange,
      });

      return data;
    } catch (error) {
      // Re-throw MrpEasyApiError as-is
      if (error instanceof MrpEasyApiError) {
        throw error;
      }

      // Wrap other errors (network errors, etc.)
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('MRPeasy API request failed', {
        endpoint,
        error: message,
      });

      throw new MrpEasyApiError(`Request failed: ${message}`, 0);
    }
  }

  // ===========================================================================
  // Stock Items
  // ===========================================================================

  /**
   * Get stock items (inventory).
   *
   * MRPeasy returns a flat array with Content-Range header for pagination.
   * Content-Range format: "items 0-99/3633"
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Array of stock items with _contentRange metadata
   */
  async getStockItems(
    params?: StockItemsParams
  ): Promise<StockItem[] & { _contentRange?: string }> {
    return this.request<StockItem[] & { _contentRange?: string }>('/items', params);
  }

  // ===========================================================================
  // Customer Orders
  // ===========================================================================

  /**
   * Get customer orders (sales orders).
   *
   * MRPeasy returns a flat array with Content-Range header for pagination.
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Array of customer orders with _contentRange metadata
   */
  async getCustomerOrders(
    params?: CustomerOrdersParams
  ): Promise<CustomerOrder[] & { _contentRange?: string }> {
    return this.request<CustomerOrder[] & { _contentRange?: string }>('/customer-orders', params);
  }

  /**
   * Get a single customer order by ID.
   *
   * @param id - Customer order ID
   * @returns Customer order details
   */
  async getCustomerOrder(id: number): Promise<CustomerOrder> {
    return this.request<CustomerOrder>(`/customer-orders/${id}`);
  }

  // ===========================================================================
  // Manufacturing Orders
  // ===========================================================================

  /**
   * Get manufacturing orders (production orders).
   *
   * MRPeasy returns a flat array with Content-Range header for pagination.
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Array of manufacturing orders with _contentRange metadata
   */
  async getManufacturingOrders(
    params?: ManufacturingOrdersParams
  ): Promise<ManufacturingOrder[] & { _contentRange?: string }> {
    return this.request<ManufacturingOrder[] & { _contentRange?: string }>(
      '/manufacturing-orders',
      params
    );
  }

  /**
   * Get a single manufacturing order by ID.
   *
   * @param id - Manufacturing order ID
   * @returns Manufacturing order details
   */
  async getManufacturingOrder(id: number): Promise<ManufacturingOrder> {
    return this.request<ManufacturingOrder>(`/manufacturing-orders/${id}`);
  }

  // ===========================================================================
  // Products
  // ===========================================================================

  /**
   * Get products (manufactured items with BOM).
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Paginated list of products
   */
  async getProducts(
    params?: ProductsParams
  ): Promise<MrpEasyApiResponse<Product>> {
    return this.request<MrpEasyApiResponse<Product>>('/products', params);
  }

  /**
   * Get a single product/item by ID.
   *
   * MRPeasy uses /items/{id} for individual item details.
   *
   * @param id - Item/Article ID
   * @returns Item details
   */
  async getProduct(id: number): Promise<StockItem> {
    return this.request<StockItem>(`/items/${id}`);
  }

  // ===========================================================================
  // Items (General Search)
  // ===========================================================================

  /**
   * Get items (general search across all item types).
   *
   * MRPeasy returns a flat array with Content-Range header for pagination.
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Array of items with _contentRange metadata
   */
  async getItems(params?: ItemsParams): Promise<StockItem[] & { _contentRange?: string }> {
    return this.request<StockItem[] & { _contentRange?: string }>('/items', params);
  }

  /**
   * Get a single item by ID.
   *
   * @param id - Item ID
   * @returns Item details
   */
  async getItem(id: number): Promise<Item> {
    return this.request<Item>(`/items/${id}`);
  }
}

// Re-export CircuitBreakerOpenError for callers to catch
export { CircuitBreakerOpenError } from './circuit-breaker.js';
