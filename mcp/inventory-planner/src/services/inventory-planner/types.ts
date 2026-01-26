/**
 * Inventory Planner API types for TypeScript.
 *
 * Types are based on Inventory Planner Public API documentation.
 * The API provides extensive metrics for demand forecasting and replenishment.
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Pagination parameters for list endpoints.
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page (max 1000) */
  limit?: number;
}

/**
 * Pagination metadata in API responses.
 */
export interface PaginationMeta {
  /** Collection name */
  name: string;
  /** Total number of items */
  total: number;
  /** Number of items in current response */
  count: number;
  /** Items per page limit */
  limit: number;
}

/**
 * API result status.
 */
export interface ApiResultStatus {
  /** Status: "success" or "error" */
  status: 'success' | 'error';
  /** Optional message */
  message?: string;
}

/**
 * Generic API response wrapper.
 */
export interface InventoryPlannerApiResponse<T> {
  /** Optional result status */
  result?: ApiResultStatus;
  /** Pagination metadata */
  meta?: PaginationMeta;
  /** Response data array (key varies by endpoint) */
  [key: string]: T[] | ApiResultStatus | PaginationMeta | undefined;
}

/**
 * API error response structure.
 */
export interface InventoryPlannerError {
  /** Error message */
  message: string;
  /** Error code (if provided) */
  code?: string;
  /** HTTP status code */
  status: number;
}

// ============================================================================
// Variant Types (Core Entity)
// ============================================================================

/**
 * Variant vendor information.
 */
export interface VariantVendor {
  /** Vendor ID */
  id?: string;
  /** Vendor name */
  name?: string;
  /** Vendor SKU/code */
  sku?: string;
  /** Lead time in days */
  lead_time?: number;
  /** Minimum order quantity */
  moq?: number;
  /** Cost per unit */
  cost?: number;
  /** Is primary vendor */
  primary?: boolean;
}

/**
 * Variant from Inventory Planner /api/v1/variants endpoint.
 * Contains extensive metrics for demand forecasting and replenishment.
 */
export interface Variant {
  /** Unique variant ID */
  id: string;
  /** SKU/item code */
  sku: string;
  /** Product title/name */
  title?: string;
  /** Variant title (e.g., size/color) */
  variant_title?: string;
  /** Full display title */
  full_title?: string;
  /** Product ID (if applicable) */
  product_id?: string;

  // Stock levels
  /** Current stock on hand */
  stock_on_hand?: number;
  /** Available stock (on hand minus reserved) */
  stock_available?: number;
  /** Incoming stock (on order) */
  stock_incoming?: number;
  /** Reserved/allocated stock */
  stock_reserved?: number;

  // Replenishment metrics (key for AI assistants)
  /** Recommended replenishment quantity */
  replenishment?: number;
  /** Days until out of stock (stockout forecast) */
  oos?: number;
  /** Days of stock remaining */
  days_of_stock?: number;
  /** Lead time in days */
  lead_time?: number;
  /** Review period (days of stock target) */
  review_period?: number;
  /** Reorder point */
  reorder_point?: number;
  /** Safety stock level */
  safety_stock?: number;

  // Financial metrics
  /** Average cost per unit */
  avg_cost?: number;
  /** Selling price */
  price?: number;
  /** Forecasted lost revenue from stockouts */
  under_value?: number;
  /** Overstock value */
  over_value?: number;
  /** Total inventory value */
  inventory_value?: number;

  // Demand forecasting
  /** Forecasted daily demand */
  forecast_daily?: number;
  /** Forecasted weekly demand */
  forecast_weekly?: number;
  /** Forecasted monthly demand */
  forecast_monthly?: number;
  /** Average daily sales velocity */
  velocity_daily?: number;
  /** Average weekly sales velocity */
  velocity_weekly?: number;

  // Vendor information
  /** Primary vendor ID */
  vendor_id?: string;
  /** Primary vendor name */
  vendor_name?: string;
  /** Vendors list */
  vendors?: VariantVendor[];

  // Classification
  /** Warehouse/location ID */
  warehouse_id?: string;
  /** Warehouse name */
  warehouse_name?: string;
  /** Product type/category */
  product_type?: string;
  /** Tags */
  tags?: string[];
  /** ABC classification (A, B, C) */
  abc_class?: string;
  /** XYZ classification */
  xyz_class?: string;

  // Status
  /** Is active/enabled */
  active?: boolean;
  /** Is deleted/removed */
  removed?: boolean;
  /** Last updated timestamp (RFC822) */
  updated_at?: string;
  /** Created timestamp (RFC822) */
  created_at?: string;

  // Stockout history and analysis (from API)
  /**
   * Total days out of stock historically
   * (API field: oos - but this represents total OOS days, not just forecast)
   */
  oos_days_total?: number;
  /** Days out of stock in the last 60 days */
  oos_last_60_days?: number;
  /** Whether continuing to sell when OOS */
  oos_sell?: boolean;
  /** Mean OOS duration (days) */
  cur_mean_oos?: number;
  /**
   * Stockout history - array of [date, status] pairs
   * where status: 1 = stockout started, 0 = back in stock
   */
  stockouts_hist?: [string, number][];
  /** Stock level history - array of [date, quantity] pairs */
  stock_hist?: [string, number][];
  /** Forecasted stockouts during days of stock period */
  forecasted_stockouts_dos?: number;
  /** Forecasted lost sales during lead time (units) */
  forecasted_lost_sales_lead_time?: number;
  /** Forecasted lost revenue during lead time */
  forecasted_lost_revenue_lead_time?: number;
}

/**
 * Variants query parameters.
 * Supports extensive filtering with operators.
 */
export interface VariantsParams extends PaginationParams {
  /** Filter by SKU (exact match) */
  sku?: string;
  /** Filter by SKU (case-insensitive) */
  sku_eqi?: string;
  /** Filter by product ID */
  product_id?: string;
  /** Filter by warehouse ID */
  warehouse_id?: string;
  /** Filter by vendor ID */
  vendor_id?: string;

  // Replenishment filters (key for reorder queries)
  /** Filter items with replenishment > 0 */
  replenishment_gt?: number;
  /** Filter items with replenishment >= value */
  replenishment_gte?: number;

  // Stock filters
  /** Filter by stock on hand greater than */
  stock_on_hand_gt?: number;
  /** Filter by stock on hand less than */
  stock_on_hand_lt?: number;
  /** Filter by days until out of stock less than */
  oos_lt?: number;
  /** Filter by days until out of stock greater than */
  oos_gt?: number;

  // Field selection
  /** Comma-separated list of fields to return */
  fields?: string;

  // Sorting
  /** Sort by field ascending */
  sort_asc?: string;
  /** Sort by field descending */
  sort_desc?: string;

  // Include removed items
  removed?: boolean;
}

// ============================================================================
// Purchase Order Types
// ============================================================================

/**
 * Purchase order line item.
 */
export interface PurchaseOrderItem {
  /** Line item ID */
  id?: string;
  /** Variant ID */
  variant_id?: string;
  /** SKU */
  sku?: string;
  /** Product title */
  title?: string;
  /** Quantity ordered */
  quantity?: number;
  /** Quantity received */
  received_quantity?: number;
  /** Unit cost */
  cost?: number;
  /** Line total */
  total?: number;
}

/**
 * Purchase order status codes.
 */
export type PurchaseOrderStatus =
  | 'draft'
  | 'open'
  | 'sent'
  | 'partial'
  | 'received'
  | 'closed'
  | 'cancelled';

/**
 * Purchase order type.
 */
export type PurchaseOrderType = 'purchase_order' | 'transfer' | 'assembly';

/**
 * Purchase order from /api/v1/purchase-orders endpoint.
 */
export interface PurchaseOrder {
  /** Purchase order ID */
  id: string;
  /** PO number/code */
  number?: string;
  /** PO status */
  status?: PurchaseOrderStatus;
  /** Order type */
  type?: PurchaseOrderType;

  // Vendor/destination
  /** Vendor ID */
  vendor_id?: string;
  /** Vendor name */
  vendor_name?: string;
  /** Destination warehouse ID */
  warehouse_id?: string;
  /** Destination warehouse name */
  warehouse_name?: string;
  /** Source warehouse ID (for transfers) */
  source_warehouse_id?: string;

  // Dates
  /** Order date (RFC822) */
  order_date?: string;
  /** Expected delivery date (RFC822) */
  expected_date?: string;
  /** Actual received date (RFC822) */
  received_date?: string;
  /** Created timestamp (RFC822) */
  created_at?: string;
  /** Updated timestamp (RFC822) */
  updated_at?: string;

  // Financial
  /** Total order value */
  total?: number;
  /** Currency code */
  currency?: string;
  /** Shipping cost */
  shipping_cost?: number;

  // Line items
  /** Order items */
  items?: PurchaseOrderItem[];

  // Metadata
  /** Notes/comments */
  notes?: string;
  /** Reference number */
  reference?: string;
  /** External ID (from source system) */
  external_id?: string;
}

/**
 * Purchase orders query parameters.
 */
export interface PurchaseOrdersParams extends PaginationParams {
  /** Filter by PO ID */
  id?: string;
  /** Filter by PO number */
  number?: string;
  /** Filter by status */
  status?: PurchaseOrderStatus;
  /** Filter by type */
  type?: PurchaseOrderType;
  /** Filter by vendor ID */
  vendor_id?: string;
  /** Filter by warehouse ID */
  warehouse_id?: string;

  // Date filters
  /** Filter by order date after */
  order_date_gt?: string;
  /** Filter by order date before */
  order_date_lt?: string;
  /** Filter by expected date after */
  expected_date_gt?: string;
  /** Filter by expected date before */
  expected_date_lt?: string;

  // Field selection and sorting
  /** Comma-separated list of fields to return */
  fields?: string;
  /** Sort by field ascending */
  sort_asc?: string;
  /** Sort by field descending */
  sort_desc?: string;
}

// ============================================================================
// Mutation Payloads (Phase 2 - Write Operations)
// ============================================================================

/**
 * Line item payload for creating a purchase order.
 */
export interface CreatePurchaseOrderItemPayload {
  /** Variant ID */
  variant_id: string;
  /** Quantity to order */
  quantity: number;
  /** Unit cost (optional) */
  cost?: number;
}

/**
 * Payload for creating a purchase order.
 */
export interface CreatePurchaseOrderPayload {
  /** Vendor ID */
  vendor_id: string;
  /** Destination warehouse ID */
  warehouse_id: string;
  /** Line items */
  items: CreatePurchaseOrderItemPayload[];
  /** Order type (defaults to purchase_order) */
  type?: PurchaseOrderType;
  /** Expected delivery date */
  expected_date?: string;
  /** Notes */
  notes?: string;
  /** Reference number */
  reference?: string;
}

/**
 * Payload for updating a purchase order.
 */
export interface UpdatePurchaseOrderPayload {
  /** New status */
  status?: PurchaseOrderStatus;
  /** New expected date */
  expected_date?: string;
  /** New notes */
  notes?: string;
  /** New reference */
  reference?: string;
}

/**
 * Payload for updating received quantities on a PO.
 */
export interface UpdateReceivedQuantityPayload {
  /** Item ID */
  id: string;
  /** Quantity received */
  received_quantity: number;
}

/**
 * Payload for updating a variant.
 */
export interface UpdateVariantPayload {
  /** Lead time override */
  lead_time?: number;
  /** Review period override */
  review_period?: number;
  /** Safety stock override */
  safety_stock?: number;
  /** Reorder point override */
  reorder_point?: number;
  /** Active status */
  active?: boolean;
}

// ============================================================================
// Warehouse Types
// ============================================================================

/**
 * Warehouse/location from /api/v1/warehouses endpoint.
 */
export interface Warehouse {
  /** Warehouse ID (e.g., "c955_330498075") */
  name: string;
  /** Display name (e.g., "Monta") */
  display_name: string;
  /** Warehouse type */
  type?: string;
  /** Whether warehouse is disabled */
  disabled?: boolean;
  /** Connection name (e.g., Shopify store) */
  connection?: string;
  /** Currency code */
  currency?: string;
  /** Created timestamp */
  created_at?: string;
  /** Updated timestamp */
  updated_at?: string;
}
