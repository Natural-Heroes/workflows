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
  Shipment,
  ShipmentsParams,
  CreateCustomerOrderPayload,
  UpdateCustomerOrderPayload,
  CreateManufacturingOrderPayload,
  UpdateManufacturingOrderPayload,
  CreateItemPayload,
  UpdateItemPayload,
  CreateBomPayload,
  UpdateBomPayload,
  CreateRoutingPayload,
  UpdateRoutingPayload,
  Bom,
  BomListParams,
  Routing,
  RoutingListParams,
  StockLot,
  StockLotsParams,
  PurchaseOrder,
  PurchaseOrdersParams,
  ReportType,
  ReportParams,
} from './types.js';

/**
 * HTTP methods supported by the MRPeasy API.
 */
type HttpMethod = 'GET' | 'POST' | 'PUT';

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
   * Makes an authenticated request to the MRPeasy API.
   *
   * All requests go through the resilience stack:
   * 1. Queue - ensures max 1 concurrent request
   * 2. Circuit breaker - protects against sustained failures
   * 3. Retry - handles transient failures (429, 503)
   * 4. Rate limiter - ensures max 100 requests per 10 seconds
   *
   * @param endpoint - API endpoint (without base URL)
   * @param params - Query parameters (for GET) or ignored (for POST/PUT)
   * @param rangeHeader - Optional Range header for pagination (e.g., "items=0-99")
   * @param method - HTTP method (defaults to GET)
   * @param body - Request body for POST/PUT
   * @returns Parsed JSON response
   * @throws MrpEasyApiError on non-2xx responses
   * @throws CircuitBreakerOpenError if circuit breaker is open
   */
  private async request<T, P extends object = object>(
    endpoint: string,
    params?: P,
    rangeHeader?: string,
    method: HttpMethod = 'GET',
    body?: unknown
  ): Promise<T> {
    logger.debug('Request queued', { endpoint, method });

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
            logger.debug('Token acquired, sending request', { endpoint, method });

            return this.executeRequest<T, P>(endpoint, params, rangeHeader, method, body);
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
   * @param rangeHeader - Optional Range header for pagination (e.g., "items=0-99")
   * @param method - HTTP method (GET, POST, PUT)
   * @param body - Request body for POST/PUT
   * @returns Parsed JSON response
   */
  private async executeRequest<T, P extends object = object>(
    endpoint: string,
    params?: P,
    rangeHeader?: string,
    method: HttpMethod = 'GET',
    body?: unknown
  ): Promise<T> {
    // Build URL with query parameters (only for GET)
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (method === 'GET' && params) {
      for (const [key, value] of Object.entries(params) as [string, unknown][]) {
        if (value !== undefined && value !== null) {
          // Handle array parameters (e.g., status[] for MRPeasy PHP-style arrays)
          if (Array.isArray(value)) {
            for (const item of value) {
              url.searchParams.append(key, String(item));
            }
          } else {
            url.searchParams.set(key, String(value));
          }
        }
      }
    }

    logger.debug('MRPeasy API request', {
      method,
      endpoint,
      params: method === 'GET' ? (params ?? {}) : undefined,
      body: method !== 'GET' ? body : undefined,
      rangeHeader,
    });

    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // MRPeasy API uses Range headers for pagination, not query params
      if (rangeHeader) {
        headers['Range'] = rangeHeader;
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      // Add body for POST/PUT requests
      if (method !== 'GET' && body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url.toString(), fetchOptions);

      const duration = Date.now() - startTime;

      // Success statuses: 200/206 (GET), 201 (POST), 202 (PUT)
      const isSuccess = response.ok || response.status === 206 ||
        response.status === 201 || response.status === 202;

      if (!isSuccess) {
        // Try to parse error response
        let errorData: Partial<MrpEasyError> = {};
        try {
          errorData = (await response.json()) as Partial<MrpEasyError>;
        } catch {
          // Response body is not JSON
        }

        logger.error('MRPeasy API error', {
          endpoint,
          method,
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
        method,
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

  /**
   * Get manufacturing orders with Range header pagination.
   *
   * MRPeasy API ignores query string pagination (page, per_page, offset).
   * Use HTTP Range headers instead: Range: items=0-99
   *
   * @param offset - Starting item index (0-based)
   * @param limit - Number of items to fetch
   * @param params - Additional query parameters for filtering
   * @returns Array of manufacturing orders with _contentRange metadata
   */
  async getManufacturingOrdersWithRange(
    offset: number,
    limit: number,
    params?: Omit<ManufacturingOrdersParams, 'page' | 'per_page'>
  ): Promise<ManufacturingOrder[] & { _contentRange?: string }> {
    const rangeHeader = `items=${offset}-${offset + limit - 1}`;
    return this.request<ManufacturingOrder[] & { _contentRange?: string }>(
      '/manufacturing-orders',
      params as ManufacturingOrdersParams,
      rangeHeader
    );
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
   * NOTE: MRPeasy API ignores the page parameter. Use getItemsWithRange for pagination.
   *
   * @param params - Query parameters for filtering (pagination params may not work)
   * @returns Array of items with _contentRange metadata
   */
  async getItems(params?: ItemsParams): Promise<StockItem[] & { _contentRange?: string }> {
    return this.request<StockItem[] & { _contentRange?: string }>('/items', params);
  }

  /**
   * Get items with Range header pagination.
   *
   * MRPeasy API ignores query string pagination (page, per_page, offset).
   * Use HTTP Range headers instead: Range: items=0-99
   *
   * @param offset - Starting item index (0-based)
   * @param limit - Maximum number of items to return
   * @param params - Optional query parameters for filtering (code, search, etc.)
   * @returns Array of items with _contentRange metadata
   */
  async getItemsWithRange(
    offset: number,
    limit: number,
    params?: Omit<ItemsParams, 'page' | 'per_page'>
  ): Promise<StockItem[] & { _contentRange?: string }> {
    const rangeHeader = `items=${offset}-${offset + limit - 1}`;
    return this.request<StockItem[] & { _contentRange?: string }>(
      '/items',
      params as ItemsParams,
      rangeHeader
    );
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

  // ===========================================================================
  // Shipments
  // ===========================================================================

  /**
   * Get shipments.
   *
   * MRPeasy returns a flat array with Content-Range header for pagination.
   * Shipments are read-only (only GET method supported).
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Array of shipments with _contentRange metadata
   */
  async getShipments(
    params?: ShipmentsParams
  ): Promise<Shipment[] & { _contentRange?: string }> {
    return this.request<Shipment[] & { _contentRange?: string }>('/shipments', params);
  }

  /**
   * Get a single shipment by ID.
   *
   * @param id - Shipment ID
   * @returns Shipment details
   */
  async getShipment(id: number): Promise<Shipment> {
    return this.request<Shipment>(`/shipments/${id}`);
  }

  // ===========================================================================
  // Customer Order Mutations
  // ===========================================================================

  /**
   * Create a new customer order.
   *
   * @param payload - Customer order creation data
   * @returns Created customer order
   */
  async createCustomerOrder(payload: CreateCustomerOrderPayload): Promise<CustomerOrder> {
    return this.request<CustomerOrder>(
      '/customer-orders',
      undefined,
      undefined,
      'POST',
      payload
    );
  }

  /**
   * Update an existing customer order.
   *
   * @param id - Customer order ID
   * @param payload - Fields to update
   * @returns Updated customer order
   */
  async updateCustomerOrder(id: number, payload: UpdateCustomerOrderPayload): Promise<CustomerOrder> {
    return this.request<CustomerOrder>(
      `/customer-orders/${id}`,
      undefined,
      undefined,
      'PUT',
      payload
    );
  }

  // ===========================================================================
  // Manufacturing Order Mutations
  // ===========================================================================

  /**
   * Create a new manufacturing order.
   *
   * @param payload - Manufacturing order creation data
   * @returns Created manufacturing order
   */
  async createManufacturingOrder(payload: CreateManufacturingOrderPayload): Promise<ManufacturingOrder> {
    return this.request<ManufacturingOrder>(
      '/manufacturing-orders',
      undefined,
      undefined,
      'POST',
      payload
    );
  }

  /**
   * Update an existing manufacturing order.
   *
   * @param id - Manufacturing order ID
   * @param payload - Fields to update
   * @returns Updated manufacturing order
   */
  async updateManufacturingOrder(id: number, payload: UpdateManufacturingOrderPayload): Promise<ManufacturingOrder> {
    return this.request<ManufacturingOrder>(
      `/manufacturing-orders/${id}`,
      undefined,
      undefined,
      'PUT',
      payload
    );
  }

  // ===========================================================================
  // Item Mutations
  // ===========================================================================

  /**
   * Create a new item.
   *
   * @param payload - Item creation data
   * @returns Created item
   */
  async createItem(payload: CreateItemPayload): Promise<StockItem> {
    return this.request<StockItem>(
      '/items',
      undefined,
      undefined,
      'POST',
      payload
    );
  }

  /**
   * Update an existing item.
   *
   * @param id - Item article_id
   * @param payload - Fields to update
   * @returns Updated item
   */
  async updateItem(id: number, payload: UpdateItemPayload): Promise<StockItem> {
    return this.request<StockItem>(
      `/items/${id}`,
      undefined,
      undefined,
      'PUT',
      payload
    );
  }

  // ===========================================================================
  // BOMs (Bills of Materials)
  // ===========================================================================

  /**
   * Get BOMs list.
   *
   * @param params - Query parameters for filtering
   * @returns Array of BOMs with _contentRange metadata
   */
  async getBoms(params?: BomListParams): Promise<Bom[] & { _contentRange?: string }> {
    return this.request<Bom[] & { _contentRange?: string }>('/boms', params);
  }

  /**
   * Get a single BOM by ID.
   *
   * @param id - BOM ID
   * @returns BOM details with components and routings
   */
  async getBom(id: number): Promise<Bom> {
    return this.request<Bom>(`/boms/${id}`);
  }

  /**
   * Create a new BOM.
   *
   * @param payload - BOM creation data
   * @returns Created BOM
   */
  async createBom(payload: CreateBomPayload): Promise<Bom> {
    return this.request<Bom>(
      '/boms',
      undefined,
      undefined,
      'POST',
      payload
    );
  }

  /**
   * Update an existing BOM.
   *
   * @param id - BOM ID
   * @param payload - Fields to update
   * @returns Updated BOM
   */
  async updateBom(id: number, payload: UpdateBomPayload): Promise<Bom> {
    return this.request<Bom>(
      `/boms/${id}`,
      undefined,
      undefined,
      'PUT',
      payload
    );
  }

  // ===========================================================================
  // Routings
  // ===========================================================================

  /**
   * Get routings list.
   *
   * @param params - Query parameters for filtering
   * @returns Array of routings with _contentRange metadata
   */
  async getRoutings(params?: RoutingListParams): Promise<Routing[] & { _contentRange?: string }> {
    return this.request<Routing[] & { _contentRange?: string }>('/routings', params);
  }

  /**
   * Get a single routing by ID.
   *
   * @param id - Routing ID
   * @returns Routing details with operations
   */
  async getRouting(id: number): Promise<Routing> {
    return this.request<Routing>(`/routings/${id}`);
  }

  /**
   * Create a new routing.
   *
   * @param payload - Routing creation data
   * @returns Created routing
   */
  async createRouting(payload: CreateRoutingPayload): Promise<Routing> {
    return this.request<Routing>(
      '/routings',
      undefined,
      undefined,
      'POST',
      payload
    );
  }

  /**
   * Update an existing routing.
   *
   * @param id - Routing ID
   * @param payload - Fields to update
   * @returns Updated routing
   */
  async updateRouting(id: number, payload: UpdateRoutingPayload): Promise<Routing> {
    return this.request<Routing>(
      `/routings/${id}`,
      undefined,
      undefined,
      'PUT',
      payload
    );
  }

  // ===========================================================================
  // Stock Lots
  // ===========================================================================

  /**
   * Get stock lots.
   *
   * @param params - Query parameters for filtering
   * @returns Array of stock lots with _contentRange metadata
   */
  async getStockLots(params?: StockLotsParams): Promise<StockLot[] & { _contentRange?: string }> {
    return this.request<StockLot[] & { _contentRange?: string }>('/lots', params);
  }

  /**
   * Get a single stock lot by ID.
   *
   * @param id - Stock lot ID
   * @returns Stock lot details with locations
   */
  async getStockLot(id: number): Promise<StockLot> {
    return this.request<StockLot>(`/lots/${id}`);
  }

  // ===========================================================================
  // Purchase Orders
  // ===========================================================================

  /**
   * Get purchase orders.
   *
   * @param params - Query parameters for filtering
   * @returns Array of purchase orders with _contentRange metadata
   */
  async getPurchaseOrders(params?: PurchaseOrdersParams): Promise<PurchaseOrder[] & { _contentRange?: string }> {
    return this.request<PurchaseOrder[] & { _contentRange?: string }>('/purchase-orders', params);
  }

  /**
   * Get a single purchase order by ID.
   *
   * @param id - Purchase order ID
   * @returns Purchase order details
   */
  async getPurchaseOrder(id: number): Promise<PurchaseOrder> {
    return this.request<PurchaseOrder>(`/purchase-orders/${id}`);
  }

  // ===========================================================================
  // Reports
  // ===========================================================================

  /**
   * Get a report by type.
   *
   * @param type - Report type (inventory_summary, inventory_movements, procurement, production)
   * @param params - Report parameters (from/to dates required)
   * @returns Report data
   */
  async getReport(type: ReportType, params: ReportParams): Promise<unknown> {
    return this.request<unknown>(`/report/${type}`, params);
  }
}

// Re-export CircuitBreakerOpenError for callers to catch
export { CircuitBreakerOpenError } from './circuit-breaker.js';
