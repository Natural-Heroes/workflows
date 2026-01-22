/**
 * TypeScript types for Shopify Admin GraphQL API responses.
 */

// GraphQL response wrapper
export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: Record<string, unknown>;
}

// PageInfo for cursor-based pagination
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

// Connection pattern
export interface Connection<T> {
  edges: Array<{ node: T; cursor: string }>;
  pageInfo: PageInfo;
}

// Money type
export interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

// Product types
export interface Product {
  id: string;
  title: string;
  handle: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  vendor: string;
  productType: string;
  tags: string[];
  totalInventory: number;
  createdAt: string;
  updatedAt: string;
  variants: Connection<ProductVariant>;
  images: Connection<ProductImage>;
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  inventoryItem: {
    id: string;
  };
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

// Order types
export interface Order {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  totalPriceSet: { shopMoney: MoneyV2 };
  subtotalPriceSet: { shopMoney: MoneyV2 };
  totalShippingPriceSet: { shopMoney: MoneyV2 };
  totalTaxSet: { shopMoney: MoneyV2 };
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  tags: string[];
  note: string | null;
  customer: OrderCustomer | null;
  lineItems: Connection<OrderLineItem>;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  fulfillments: Fulfillment[];
}

export interface OrderCustomer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface OrderLineItem {
  id: string;
  title: string;
  quantity: number;
  sku: string | null;
  variant: { id: string; title: string } | null;
  originalUnitPriceSet: { shopMoney: MoneyV2 };
  discountedUnitPriceSet: { shopMoney: MoneyV2 };
  fulfillmentStatus: string;
}

export interface Fulfillment {
  id: string;
  status: string;
  createdAt: string;
  trackingInfo: Array<{
    number: string | null;
    url: string | null;
    company: string | null;
  }>;
}

export interface Address {
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
}

// Customer types
export interface Customer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  ordersCount: string;
  totalSpentV2: MoneyV2;
  tags: string[];
  state: string;
  createdAt: string;
  updatedAt: string;
  defaultAddress: Address | null;
  note: string | null;
}

// Collection types
export interface Collection {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  productsCount: { count: number };
  sortOrder: string;
  updatedAt: string;
}

// Shop types
export interface Shop {
  id: string;
  name: string;
  email: string;
  myshopifyDomain: string;
  primaryDomain: { url: string; host: string };
  currencyCode: string;
  plan: { displayName: string };
  timezoneAbbreviation: string;
  weightUnit: string;
  billingAddress: Address;
  shipsToCountries: string[];
}
