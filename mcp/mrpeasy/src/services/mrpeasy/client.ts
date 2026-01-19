/**
 * MRPeasy REST API client.
 *
 * Uses native fetch (Node 18+) with Basic Auth.
 * All logging goes to stderr via the logger module.
 */

import { logger } from '../../lib/logger.js';
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
}

/**
 * Error thrown by MRPeasy API client.
 */
export class MrpEasyApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'MrpEasyApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * MRPeasy REST API client.
 *
 * Provides typed methods for interacting with the MRPeasy API.
 * Uses Basic Auth with base64 encoded credentials.
 */
export class MrpEasyClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

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
  }

  /**
   * Makes an authenticated GET request to the MRPeasy API.
   *
   * @param endpoint - API endpoint (without base URL)
   * @param params - Query parameters
   * @returns Parsed JSON response
   * @throws MrpEasyApiError on non-2xx responses
   */
  private async request<T, P extends object = object>(
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
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        // Try to parse error response
        let errorData: Partial<MrpEasyError> = {};
        try {
          errorData = await response.json() as Partial<MrpEasyError>;
        } catch {
          // Response body is not JSON
        }

        logger.error('MRPeasy API error', {
          endpoint,
          status: response.status,
          message: errorData.message ?? response.statusText,
          duration,
        });

        throw new MrpEasyApiError(
          errorData.message ?? `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData.code
        );
      }

      const data = await response.json() as T;

      logger.debug('MRPeasy API response', {
        endpoint,
        status: response.status,
        duration,
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
   * @param params - Query parameters for filtering and pagination
   * @returns Paginated list of stock items
   */
  async getStockItems(
    params?: StockItemsParams
  ): Promise<MrpEasyApiResponse<StockItem>> {
    return this.request<MrpEasyApiResponse<StockItem>>('/stock-items', params);
  }

  // ===========================================================================
  // Customer Orders
  // ===========================================================================

  /**
   * Get customer orders (sales orders).
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Paginated list of customer orders
   */
  async getCustomerOrders(
    params?: CustomerOrdersParams
  ): Promise<MrpEasyApiResponse<CustomerOrder>> {
    return this.request<MrpEasyApiResponse<CustomerOrder>>('/customer-orders', params);
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
   * @param params - Query parameters for filtering and pagination
   * @returns Paginated list of manufacturing orders
   */
  async getManufacturingOrders(
    params?: ManufacturingOrdersParams
  ): Promise<MrpEasyApiResponse<ManufacturingOrder>> {
    return this.request<MrpEasyApiResponse<ManufacturingOrder>>(
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
   * Get a single product by ID.
   *
   * @param id - Product ID
   * @returns Product details including BOM
   */
  async getProduct(id: number): Promise<Product> {
    return this.request<Product>(`/products/${id}`);
  }

  // ===========================================================================
  // Items (General Search)
  // ===========================================================================

  /**
   * Get items (general search across all item types).
   *
   * @param params - Query parameters for filtering and pagination
   * @returns Paginated list of items
   */
  async getItems(params?: ItemsParams): Promise<MrpEasyApiResponse<Item>> {
    return this.request<MrpEasyApiResponse<Item>>('/items', params);
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
