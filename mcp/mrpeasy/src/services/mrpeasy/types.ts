/**
 * MRPeasy API types for TypeScript.
 *
 * Types are based on MRPeasy REST API v1 documentation.
 * Only includes fields we actively use - extend as needed.
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
  /** Items per page (default varies by endpoint) */
  per_page?: number;
}

/**
 * Pagination metadata in API responses.
 */
export interface PaginationMeta {
  /** Current page number */
  page: number;
  /** Items per page */
  per_page: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  total_pages: number;
}

/**
 * Generic API response wrapper with pagination.
 */
export interface MrpEasyApiResponse<T> {
  /** Response data array */
  data: T[];
  /** Pagination metadata */
  pagination: PaginationMeta;
}

/**
 * API error response structure.
 */
export interface MrpEasyError {
  /** Error message */
  message: string;
  /** Error code (if provided) */
  code?: string;
  /** HTTP status code */
  status: number;
}

// ============================================================================
// Domain Types
// ============================================================================

/**
 * Stock item representing inventory in a warehouse.
 */
export interface StockItem {
  /** Unique stock item ID */
  id: number;
  /** Reference to the item/product */
  item_id: number;
  /** Item number/SKU */
  item_number: string;
  /** Item name */
  item_name: string;
  /** Quantity in stock */
  quantity: number;
  /** Booked quantity (reserved) */
  booked_quantity: number;
  /** Available quantity (quantity - booked) */
  available_quantity: number;
  /** Unit cost */
  cost: number;
  /** Total value */
  total_value: number;
  /** Warehouse ID */
  warehouse_id: number;
  /** Warehouse name */
  warehouse_name: string;
  /** Stock lot ID (if lot tracking enabled) */
  lot_id?: number;
  /** Stock lot number */
  lot_number?: string;
}

/**
 * Customer order line item.
 */
export interface CustomerOrderItem {
  /** Line item ID */
  id: number;
  /** Item/product ID */
  item_id: number;
  /** Item number/SKU */
  item_number: string;
  /** Item name */
  item_name: string;
  /** Ordered quantity */
  quantity: number;
  /** Unit price */
  price: number;
  /** Line total */
  total: number;
  /** Delivered quantity */
  delivered_quantity: number;
}

/**
 * Customer order (sales order).
 */
export interface CustomerOrder {
  /** Unique order ID */
  id: number;
  /** Order number */
  number: string;
  /** Order status */
  status: string;
  /** Customer ID */
  customer_id: number;
  /** Customer name */
  customer_name: string;
  /** Order date (ISO string) */
  order_date: string;
  /** Requested delivery date (ISO string) */
  delivery_date: string;
  /** Actual ship date (ISO string, if shipped) */
  ship_date?: string;
  /** Order total */
  total: number;
  /** Currency code */
  currency: string;
  /** Order line items */
  items: CustomerOrderItem[];
  /** Additional notes */
  notes?: string;
}

/**
 * Manufacturing order (production order / work order).
 */
export interface ManufacturingOrder {
  /** Unique MO ID */
  id: number;
  /** MO number */
  number: string;
  /** MO status */
  status: string;
  /** Product ID being manufactured */
  product_id: number;
  /** Product number */
  product_number: string;
  /** Product name */
  product_name: string;
  /** Quantity to produce */
  quantity: number;
  /** Quantity already produced */
  produced_quantity: number;
  /** Planned start date (ISO string) */
  start_date: string;
  /** Planned finish date (ISO string) */
  finish_date: string;
  /** Actual finish date (ISO string, if completed) */
  actual_finish_date?: string;
  /** Linked customer order ID */
  customer_order_id?: number;
  /** Priority level */
  priority?: number;
  /** Additional notes */
  notes?: string;
}

/**
 * Bill of materials component.
 */
export interface BomItem {
  /** Component item ID */
  item_id: number;
  /** Component item number */
  item_number: string;
  /** Component item name */
  item_name: string;
  /** Quantity required per unit */
  quantity: number;
  /** Unit of measure */
  unit: string;
}

/**
 * Product (manufactured item with BOM).
 */
export interface Product {
  /** Unique product ID */
  id: number;
  /** Product number/SKU */
  number: string;
  /** Product name */
  name: string;
  /** Product description */
  description?: string;
  /** Product group/category */
  group?: string;
  /** Unit of measure */
  unit: string;
  /** Standard cost */
  cost: number;
  /** Sales price */
  price: number;
  /** Bill of materials */
  bom?: BomItem[];
  /** Active status */
  active: boolean;
}

/**
 * Item type enumeration.
 */
export type ItemType = 'product' | 'part' | 'material' | 'assembly';

/**
 * Base item for search results (simpler than full Product).
 */
export interface Item {
  /** Unique item ID */
  id: number;
  /** Item number/SKU */
  number: string;
  /** Item name */
  name: string;
  /** Item type */
  type: ItemType;
  /** Item group/category */
  group?: string;
  /** Active status */
  active: boolean;
}

// ============================================================================
// Request Parameter Types
// ============================================================================

/**
 * Stock items query parameters.
 */
export interface StockItemsParams extends PaginationParams {
  /** Filter by item ID */
  item_id?: number;
  /** Filter by warehouse ID */
  warehouse_id?: number;
  /** Filter by item number (partial match) */
  item_number?: string;
}

/**
 * Customer orders query parameters.
 */
export interface CustomerOrdersParams extends PaginationParams {
  /** Filter by status */
  status?: string;
  /** Filter by customer ID */
  customer_id?: number;
  /** Filter orders from date (ISO string) */
  from_date?: string;
  /** Filter orders to date (ISO string) */
  to_date?: string;
}

/**
 * Manufacturing orders query parameters.
 */
export interface ManufacturingOrdersParams extends PaginationParams {
  /** Filter by status */
  status?: string;
  /** Filter by product ID */
  product_id?: number;
  /** Filter orders from date (ISO string) */
  from_date?: string;
  /** Filter orders to date (ISO string) */
  to_date?: string;
}

/**
 * Products query parameters.
 */
export interface ProductsParams extends PaginationParams {
  /** Search by number or name (partial match) */
  search?: string;
  /** Filter by group */
  group?: string;
  /** Filter by active status */
  active?: boolean;
}

/**
 * Items query parameters (for general search).
 */
export interface ItemsParams extends PaginationParams {
  /** Search by number or name (partial match) */
  search?: string;
  /** Filter by item type */
  type?: ItemType;
  /** Filter by group */
  group?: string;
  /** Filter by active status */
  active?: boolean;
}
