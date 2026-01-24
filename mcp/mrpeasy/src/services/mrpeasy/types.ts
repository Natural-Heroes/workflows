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
 * Stock item representing inventory from MRPeasy /items endpoint.
 * Field names match actual API response.
 */
export interface StockItem {
  /** Article ID (unique identifier) */
  article_id: number;
  /** Product ID */
  product_id: number;
  /** Item code/SKU */
  code: string;
  /** Item title/name */
  title: string;
  /** Quantity in stock */
  in_stock: number;
  /** Booked quantity (reserved) */
  booked: number;
  /** Available quantity */
  available: number;
  /** Average cost per unit */
  avg_cost: number | null;
  /** Selling price */
  selling_price: number;
  /** Product group ID */
  group_id: number;
  /** Product group code */
  group_code: string;
  /** Product group title */
  group_title: string;
  /** Is raw material */
  is_raw: boolean;
  /** Deleted flag */
  deleted: boolean;
  /** Expected total (future stock) */
  expected_total: number;
  /** Expected available */
  expected_available: number;
  /** Minimum quantity threshold */
  min_quantity: string;
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
  /** Filter by code (exact match) */
  code?: string;
}

/**
 * Customer orders query parameters.
 * Supports direct filtering by code, ID, and other fields.
 */
export interface CustomerOrdersParams extends PaginationParams {
  /** Filter by order code (e.g., "CO-01263") - exact match */
  code?: string;
  /** Filter by internal cust_ord_id */
  cust_ord_id?: number;
  /** Filter by order reference */
  reference?: string;
  /** Filter by status */
  status?: string;
  /** Filter by customer ID */
  customer_id?: number;
  /** Filter by customer code */
  customer_code?: string;
  /** Filter by customer name */
  customer_name?: string;
  /** Filter orders from date (ISO string) */
  from_date?: string;
  /** Filter orders to date (ISO string) */
  to_date?: string;
  /** Filter by creation date minimum */
  created_min?: string;
  /** Filter by creation date maximum */
  created_max?: string;
  /** Filter by delivery date minimum */
  delivery_date_min?: string;
  /** Filter by delivery date maximum */
  delivery_date_max?: string;
}

/**
 * Manufacturing orders query parameters.
 * Supports direct filtering by code, ID, and other fields.
 */
export interface ManufacturingOrdersParams extends PaginationParams {
  /** Filter by MO code (e.g., "MO-39509") - exact match */
  code?: string;
  /** Filter by internal man_ord_id */
  man_ord_id?: number;
  /** Filter by article ID (stock item reference) */
  article_id?: number;
  /** Filter by status */
  status?: string;
  /** Filter by product ID */
  product_id?: number;
  /** Filter by item code (part number) */
  item_code?: string;
  /** Filter by item title (product name) */
  item_title?: string;
  /** Filter orders from date (ISO string) */
  from_date?: string;
  /** Filter orders to date (ISO string) */
  to_date?: string;
  /** Filter by creation date minimum */
  created_min?: string;
  /** Filter by creation date maximum */
  created_max?: string;
  /** Filter by due date minimum */
  due_date_min?: string;
  /** Filter by due date maximum */
  due_date_max?: string;
  /** Filter by start date minimum */
  start_date_min?: string;
  /** Filter by start date maximum */
  start_date_max?: string;
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
  /** Filter by code (exact match) */
  code?: string;
}

// ============================================================================
// Shipment Types
// ============================================================================

/**
 * Shipment product/line item.
 */
export interface ShipmentProduct {
  /** Product/item ID */
  article_id?: number;
  /** Product code */
  item_code?: string;
  /** Product name */
  item_title?: string;
  /** Quantity shipped */
  quantity?: number;
  /** Unit of measure */
  unit?: string;
}

/**
 * Shipment record from MRPeasy /shipments endpoint.
 */
export interface Shipment {
  /** Internal shipment ID */
  shipment_id: number;
  /** Shipment code (e.g., "SH-00123") */
  code: string;
  /** Shipment status code */
  status: number;
  /** Carrier tracking number */
  tracking_number?: string;
  /** Creation timestamp (Unix) */
  created?: number;
  /** Delivery date timestamp (Unix) */
  delivery_date?: number;
  /** Associated customer order ID */
  customer_order_id?: number;
  /** Associated customer order code */
  customer_order_code?: string;
  /** Shipping address (text or structured) */
  shipping_address?: string | Record<string, unknown>;
  /** Packing/waybill notes */
  packing_notes?: string;
  /** Products in shipment */
  products?: ShipmentProduct[];
}

/**
 * Shipments query parameters.
 */
export interface ShipmentsParams extends PaginationParams {
  /** Filter by shipment ID */
  shipment_id?: number;
  /** Filter by shipment code (e.g., "SH-00123") */
  code?: string;
  /** Filter by tracking number */
  tracking_number?: string;
  /** Filter by associated customer order ID */
  customer_order_id?: number;
  /** Filter by associated RMA order ID */
  rma_order_id?: number;
  /** Filter by associated purchase order ID */
  purchase_order_id?: number;
  /** Filter by status */
  status?: number;
  /** Filter by creation date minimum (Unix timestamp) */
  created_min?: number;
  /** Filter by creation date maximum (Unix timestamp) */
  created_max?: number;
  /** Filter by delivery date minimum (Unix timestamp) */
  delivery_date_min?: number;
  /** Filter by delivery date maximum (Unix timestamp) */
  delivery_date_max?: number;
}

// ============================================================================
// Mutation Payloads
// ============================================================================

/**
 * Product line item for creating a customer order.
 */
export interface CustomerOrderProductPayload {
  /** Article/item ID */
  article_id: number;
  /** Quantity ordered */
  quantity: number;
  /** Total price in currency */
  total_price_cur: number;
}

/**
 * Payload for creating a customer order.
 */
export interface CreateCustomerOrderPayload {
  /** Customer ID */
  customer_id: number;
  /** Products to order */
  products: CustomerOrderProductPayload[];
  /** Delivery date (ISO string) */
  delivery_date?: string;
  /** Order reference */
  reference?: string;
  /** Notes */
  notes?: string;
}

/**
 * Payload for updating a customer order.
 */
export interface UpdateCustomerOrderPayload {
  /** New status code */
  status?: number;
  /** New delivery date (ISO string) */
  delivery_date?: string;
  /** New reference */
  reference?: string;
  /** Notes */
  notes?: string;
}

/**
 * Payload for creating a manufacturing order.
 */
export interface CreateManufacturingOrderPayload {
  /** Article/product ID to manufacture */
  article_id: number;
  /** Quantity to produce */
  quantity: number;
  /** Assigned user ID */
  assigned_id: number;
  /** Due date (ISO string) */
  due_date?: string;
  /** Start date (ISO string) */
  start_date?: string;
  /** Notes */
  notes?: string;
}

/**
 * Payload for updating a manufacturing order.
 */
export interface UpdateManufacturingOrderPayload {
  /** MO code override */
  code?: string;
  /** New quantity */
  quantity?: number;
  /** New due date (ISO string) */
  due_date?: string;
  /** New start date (ISO string) */
  start_date?: string;
  /** Assigned user ID */
  assigned_id?: number;
  /** Notes */
  notes?: string;
}

/**
 * Payload for creating an item.
 */
export interface CreateItemPayload {
  /** Item title/name */
  title: string;
  /** Unit ID */
  unit_id: number;
  /** Group ID */
  group_id: number;
  /** Is raw material */
  is_raw: boolean;
  /** Item code/SKU (auto-generated if not provided) */
  code?: string;
  /** Selling price */
  selling_price?: number;
  /** Minimum quantity threshold */
  min_quantity?: number;
  /** Description */
  description?: string;
}

/**
 * Payload for updating an item.
 */
export interface UpdateItemPayload {
  /** New title */
  title?: string;
  /** New code/SKU */
  code?: string;
  /** New selling price */
  selling_price?: number;
  /** New minimum quantity */
  min_quantity?: number;
  /** New group ID */
  group_id?: number;
  /** New unit ID */
  unit_id?: number;
  /** Description */
  description?: string;
}

// ============================================================================
// BOM Types
// ============================================================================

/**
 * BOM component for create/update.
 */
export interface BomComponentPayload {
  /** Article/item ID */
  article_id: number;
  /** Quantity required per unit */
  quantity: number;
}

/**
 * BOM component in response.
 */
export interface BomComponent {
  /** Component ID */
  id?: number;
  /** Article/item ID */
  article_id: number;
  /** Item code */
  item_code?: string;
  /** Item title */
  item_title?: string;
  /** Quantity per unit */
  quantity: number;
  /** Unit of measure */
  unit?: string;
}

/**
 * BOM routing in response.
 */
export interface BomRouting {
  /** Routing ID */
  id?: number;
  /** Title */
  title?: string;
  /** Code */
  code?: string;
}

/**
 * Bill of Materials from /boms endpoint.
 */
export interface Bom {
  /** BOM ID */
  id: number;
  /** BOM code */
  code?: string;
  /** BOM title */
  title?: string;
  /** Product ID this BOM belongs to */
  product_id: number;
  /** Item code of the product */
  item_code?: string;
  /** Item title of the product */
  item_title?: string;
  /** Components list */
  components?: BomComponent[];
  /** Linked routings */
  routings?: BomRouting[];
  /** Creation timestamp */
  created?: number;
}

/**
 * BOM list query parameters.
 */
export interface BomListParams extends PaginationParams {
  /** Filter by product ID */
  product_id?: number;
  /** Filter by item code */
  item_code?: string;
}

/**
 * Payload for creating a BOM.
 */
export interface CreateBomPayload {
  /** Product ID */
  product_id: number;
  /** Components list */
  components: BomComponentPayload[];
  /** BOM title */
  title?: string;
  /** BOM code */
  code?: string;
}

/**
 * Payload for updating a BOM.
 */
export interface UpdateBomPayload {
  /** New title */
  title?: string;
  /** New code */
  code?: string;
  /** Updated components list */
  components?: BomComponentPayload[];
}

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Routing operation for create/update.
 */
export interface RoutingOperationPayload {
  /** Operation type ID */
  type_id: number;
  /** Order/sequence number */
  ord: number;
  /** Variable time per unit (minutes) */
  variable_time: number;
  /** Setup time (minutes) */
  setup_time?: number;
  /** Workstation ID */
  workstation_id?: number;
}

/**
 * Routing operation in response.
 */
export interface RoutingOperation {
  /** Operation ID */
  id?: number;
  /** Operation type ID */
  type_id?: number;
  /** Operation name/title */
  name?: string;
  /** Order/sequence number */
  ord?: number;
  /** Variable time per unit (minutes) */
  variable_time?: number;
  /** Setup time (minutes) */
  setup_time?: number;
  /** Workstation ID */
  workstation_id?: number;
  /** Workstation name */
  workstation_name?: string;
}

/**
 * Routing from /routings endpoint.
 */
export interface Routing {
  /** Routing ID */
  id: number;
  /** Routing code */
  code?: string;
  /** Routing title */
  title?: string;
  /** Product ID this routing belongs to */
  product_id: number;
  /** Item code of the product */
  item_code?: string;
  /** Item title of the product */
  item_title?: string;
  /** Operations list */
  operations?: RoutingOperation[];
  /** Creation timestamp */
  created?: number;
}

/**
 * Routing list query parameters.
 */
export interface RoutingListParams extends PaginationParams {
  /** Filter by product ID */
  product_id?: number;
  /** Filter by item code */
  item_code?: string;
}

/**
 * Payload for creating a routing.
 */
export interface CreateRoutingPayload {
  /** Product ID */
  product_id: number;
  /** Operations list */
  operations: RoutingOperationPayload[];
  /** Routing title */
  title?: string;
  /** Routing code */
  code?: string;
}

/**
 * Payload for updating a routing.
 */
export interface UpdateRoutingPayload {
  /** New title */
  title?: string;
  /** New code */
  code?: string;
  /** Updated operations list */
  operations?: RoutingOperationPayload[];
}

// ============================================================================
// Stock Lot Types
// ============================================================================

/**
 * Stock lot location.
 */
export interface StockLotLocation {
  /** Location ID */
  id?: number;
  /** Location name */
  name?: string;
  /** Warehouse ID */
  warehouse_id?: number;
  /** Warehouse name */
  warehouse_name?: string;
  /** Quantity at this location */
  quantity?: number;
}

/**
 * Stock lot from /lots endpoint.
 */
export interface StockLot {
  /** Lot ID */
  id: number;
  /** Lot number/code */
  lot_number?: string;
  /** Article/item ID */
  article_id?: number;
  /** Item code */
  item_code?: string;
  /** Item title */
  item_title?: string;
  /** Total quantity */
  quantity?: number;
  /** Available quantity */
  available?: number;
  /** Expiry date (Unix timestamp) */
  expiry_date?: number;
  /** Locations/warehouses */
  locations?: StockLotLocation[];
  /** Creation timestamp */
  created?: number;
}

/**
 * Stock lots query parameters.
 */
export interface StockLotsParams extends PaginationParams {
  /** Filter by article/item ID */
  article_id?: number;
  /** Filter by item code */
  item_code?: string;
  /** Filter by lot number */
  lot_number?: string;
  /** Filter by warehouse ID */
  warehouse_id?: number;
}

// ============================================================================
// Purchase Order Types
// ============================================================================

/**
 * Purchase order product/line item.
 */
export interface PurchaseOrderProduct {
  /** Article/item ID */
  article_id?: number;
  /** Item code */
  item_code?: string;
  /** Item title */
  item_title?: string;
  /** Quantity ordered */
  quantity?: number;
  /** Quantity received */
  received_quantity?: number;
  /** Unit price */
  unit_price?: number;
  /** Total price */
  total_price?: number;
  /** Unit */
  unit?: string;
}

/**
 * Purchase order invoice.
 */
export interface PurchaseOrderInvoice {
  /** Invoice ID */
  id?: number;
  /** Invoice number */
  number?: string;
  /** Invoice date */
  date?: number;
  /** Total amount */
  total?: number;
  /** Status */
  status?: string;
}

/**
 * Purchase order from /purchase-orders endpoint.
 */
export interface PurchaseOrder {
  /** PO ID */
  id: number;
  /** PO code */
  code?: string;
  /** Status code */
  status?: number;
  /** Vendor/supplier ID */
  vendor_id?: number;
  /** Vendor name */
  vendor_name?: string;
  /** Order date (Unix timestamp) */
  order_date?: number;
  /** Expected delivery date (Unix timestamp) */
  expected_date?: number;
  /** Total price */
  total_price?: number;
  /** Currency */
  currency?: string;
  /** Products/line items */
  products?: PurchaseOrderProduct[];
  /** Invoices */
  invoices?: PurchaseOrderInvoice[];
  /** Notes */
  notes?: string;
  /** Creation timestamp */
  created?: number;
}

/**
 * Purchase orders query parameters.
 */
export interface PurchaseOrdersParams extends PaginationParams {
  /** Filter by PO code */
  code?: string;
  /** Filter by vendor ID */
  vendor_id?: number;
  /** Filter by status */
  status?: number;
  /** Filter by creation date minimum (Unix timestamp) */
  created_min?: number;
  /** Filter by creation date maximum (Unix timestamp) */
  created_max?: number;
  /** Filter by expected date minimum */
  expected_date_min?: number;
  /** Filter by expected date maximum */
  expected_date_max?: number;
}

// ============================================================================
// Report Types
// ============================================================================

/**
 * Report type options.
 */
export type ReportType = 'inventory_summary' | 'inventory_movements' | 'procurement' | 'production';

/**
 * Report query parameters.
 */
export interface ReportParams {
  /** Start date (ISO string YYYY-MM-DD) */
  from: string;
  /** End date (ISO string YYYY-MM-DD) */
  to: string;
  /** Optional article/item ID filter */
  article_id?: number;
  /** Optional warehouse ID filter */
  warehouse_id?: number;
}
