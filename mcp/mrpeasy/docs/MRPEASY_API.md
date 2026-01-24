# MRPeasy REST API Reference

Official documentation: https://www.mrpeasy.com/resources/api

## Authentication

Basic access authentication via the `Authorization` header:

```
Authorization: Basic base64([api-key]:[api-secret])
```

Credentials are found in **Settings → Integration → API access**.

```bash
curl -X "GET" "https://api.mrpeasy.com/rest/v1/items" \
  -H 'content-type: application/json' \
  -u 'your-api-key:your-api-secret'
```

## Rate Limiting

- **One request per client at a time** (concurrent requests not allowed)
- **Maximum 100 requests per 10 seconds**
- Requests must be UTF-8 encoded
- Responses are JSON-encoded UTF-8

## Pagination (Range Headers)

MRPeasy ignores query string pagination (`page`, `per_page`, `offset`). Use HTTP Range headers instead.

**Default list size:** 100 objects
**Maximum per request:** 1,000 objects

When results exceed 1,000, the response includes HTTP status `206 Partial Content` with a `Content-Range` header.

### Range Header Format

```
Range: items=200          # Start from 201st item (0-indexed)
Range: items=10-14        # Request items 11-15 (indices 10-14)
Range: items=0-99         # First 100 items
```

### Response Header

```
Content-Range: items 0-99/3633
```

Format: `items {start}-{end}/{total}`

## HTTP Methods & Response Codes

| Method | Purpose | Success Code |
|--------|---------|--------------|
| GET | Retrieve object(s) | 200 or 206 |
| POST | Create new object | 201 |
| PUT | Update existing object | 202 |
| DELETE | Delete object | 204 |

### Error Codes

| Code | Meaning |
|------|---------|
| 400 | Validation failure |
| 401 | Unauthorized |
| 404 | Not found |
| 429 | Rate limit exceeded |
| 503 | Maintenance mode |

---

## Manufacturing Orders

**Endpoint:** `GET /manufacturing-orders`

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `code` | Unique MO number (e.g., "MO-39509") |
| `man_ord_id` | Internal database identifier |
| `article_id` | Stock item reference |
| `product_id` | Product database ID |
| `item_code` | Part number |
| `item_title` | Product name |
| `group_id`, `group_code`, `group_title` | Product group filters |
| `status[]` | Order status array |
| `assigned_id` | Responsible user |
| `quantity_min`, `quantity_max` | Quantity range |
| `created_min`, `created_max` | Creation date range |
| `due_date_min`, `due_date_max` | Due date range |
| `start_date_min`, `start_date_max` | Start date range |
| `finish_date_min`, `finish_date_max` | Completion date range |
| `item_cost_min`, `item_cost_max` | Cost per unit range |
| `total_cost_min`, `total_cost_max` | Total cost range |

### Status Codes

| Code | Status |
|------|--------|
| 10 | New |
| 15 | Not Scheduled |
| 20 | Scheduled |
| 30 | In Progress |
| 35 | Paused |
| 40 | Done |
| 50 | Shipped |
| 60 | Closed |
| 70 | Cancelled |

### Response Fields

| Field | Description |
|-------|-------------|
| `man_ord_id` | Internal ID |
| `code` | MO number (e.g., "MO-39509") |
| `article_id` | Stock item ID |
| `item_code` | Part number |
| `item_title` | Product name |
| `quantity` | Ordered quantity |
| `status` | Status code |
| `created` | Creation timestamp (Unix) |
| `due_date` | Due date timestamp |
| `start_date` | Start date timestamp |
| `finish_date` | Finish date timestamp |
| `item_cost` | Cost per unit |
| `total_cost` | Total cost |

### Get Single MO

```
GET /manufacturing-orders/{man_ord_id}
```

### Create MO

```
POST /manufacturing-orders
```

Required fields: `article_id`, `quantity`, `assigned_id`
Optional fields: `due_date`, `start_date`, `notes`

### Update MO

```
PUT /manufacturing-orders/{man_ord_id}
```

Optional fields: `code`, `quantity`, `due_date`, `start_date`, `assigned_id`, `notes`

---

## Customer Orders

**Endpoint:** `GET /customer-orders`

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `code` | Unique order number (e.g., "CO-01263") |
| `cust_ord_id` | Internal database identifier |
| `reference` | Order reference |
| `customer_id`, `customer_code`, `customer_name` | Customer filters |
| `status[]` | Order status array |
| `part_status[]` | Product booking status |
| `invoice_status[]` | Invoice tracking status |
| `payment_status[]` | Payment tracking status |
| `created_min`, `created_max` | Creation date range |
| `delivery_date_min`, `delivery_date_max` | Delivery date range |
| `actual_delivery_date_min`, `actual_delivery_date_max` | Actual delivery range |
| `total_price_min`, `total_price_max` | Price range |
| `total_cost_min`, `total_cost_max` | Cost range |

### Status Codes

| Code | Status |
|------|--------|
| 10 | Quotation |
| 20 | Waiting for confirmation |
| 30 | Confirmed |
| 40 | Waiting for production |
| 50 | In production |
| 60 | Ready for shipment |
| 70 | Shipped |
| 80 | Delivered |
| 85 | Archived |
| 90 | Cancelled |

### Response Fields

| Field | Description |
|-------|-------------|
| `cust_ord_id` | Internal ID |
| `code` | Order number (e.g., "CO-01263") |
| `reference` | Order reference |
| `customer_id` | Customer ID |
| `customer_code` | Customer code |
| `customer_name` | Customer name |
| `status` | Status code |
| `created` | Creation timestamp |
| `delivery_date` | Requested delivery date |
| `actual_delivery_date` | Actual delivery date |
| `total_price` | Order total |
| `currency` | Currency code |

### Get Single CO

```
GET /customer-orders/{cust_ord_id}
```

### Create CO

```
POST /customer-orders
```

Required fields: `customer_id`, `products[]` (each with `article_id`, `quantity`, `total_price_cur`)
Optional fields: `delivery_date`, `reference`, `notes`

### Update CO

```
PUT /customer-orders/{cust_ord_id}
```

Optional fields: `status`, `delivery_date`, `reference`, `notes`

---

## Stock Items

**Endpoint:** `GET /items`

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `article_id` | Stock item identifier |
| `product_id` | Product database ID |
| `code` | Part number (exact match) |
| `title` | Item name |
| `group_id`, `group_code`, `group_title` | Product group filters |
| `is_raw` | Material vs finished good (0/1) |
| `selling_price_min`, `selling_price_max` | Price range |
| `avg_cost_min`, `avg_cost_max` | Cost range |
| `in_stock_min`, `in_stock_max` | Total quantity range |
| `available_min`, `available_max` | Free stock range |
| `booked_min`, `booked_max` | Reserved stock range |
| `deleted` | Include archived items (0/1) |

### Response Fields

| Field | Description |
|-------|-------------|
| `article_id` | Stock item ID |
| `product_id` | Product ID |
| `code` | Part number/SKU |
| `title` | Item name |
| `in_stock` | Total physical quantity |
| `available` | Freely available quantity |
| `booked` | Allocated/reserved quantity |
| `avg_cost` | Calculated item cost |
| `selling_price` | Sales price |
| `group_id`, `group_code`, `group_title` | Product group info |
| `is_raw` | Material flag |
| `deleted` | Archived flag |

### Get Single Item

```
GET /items/{article_id}
```

### Create Item

```
POST /items
```

Required fields: `title`, `unit_id`, `group_id`, `is_raw`
Optional fields: `code`, `selling_price`, `min_quantity`, `description`

### Update Item

```
PUT /items/{article_id}
```

Optional fields: `title`, `code`, `selling_price`, `min_quantity`, `group_id`, `unit_id`, `description`

---

## Shipments

**Endpoint:** `GET /shipments`

Shipments are **read-only** (only GET method supported).

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `shipment_id` | Internal database identifier |
| `code` | Unique shipment code (e.g., "SH-00123") |
| `tracking_number` | Carrier tracking number |
| `customer_order_id` | Filter by associated customer order ID |
| `rma_order_id` | Filter by associated RMA order |
| `purchase_order_id` | Filter by associated purchase order |
| `status[]` | Shipment status array |
| `created_min`, `created_max` | Creation date range |
| `delivery_date_min`, `delivery_date_max` | Delivery date range |

### Status Codes

| Code | Status |
|------|--------|
| 10 | New |
| 15 | Ready for shipment |
| 20 | Shipped |
| 30 | Cancelled |

### Response Fields

| Field | Description |
|-------|-------------|
| `shipment_id` | Internal ID |
| `code` | Shipment code |
| `status` | Status code |
| `tracking_number` | Carrier tracking number |
| `created` | Creation timestamp |
| `delivery_date` | Delivery date |
| `products` | Array of shipped products |
| `shipping_address` | Shipping address (text or array) |
| `packing_notes` | Packing/waybill notes |

### Get Single Shipment

```
GET /shipments/{shipment_id}
```

### Get Shipments for Customer Order

```
GET /shipments?customer_order_id=1276
```

---

## Bills of Materials (BOMs)

**Endpoint:** `GET /boms`

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `product_id` | Filter by product ID |
| `item_code` | Filter by item code/SKU |

### Response Fields

| Field | Description |
|-------|-------------|
| `id` | BOM ID |
| `code` | BOM code |
| `title` | BOM title |
| `product_id` | Product ID this BOM belongs to |
| `item_code` | Product item code |
| `item_title` | Product item name |
| `components` | Array of BOM components |
| `routings` | Array of linked routings |

### Get Single BOM

```
GET /boms/{id}
```

### Create BOM

```
POST /boms
```

Required fields: `product_id`, `components[]` (each with `article_id`, `quantity`)

### Update BOM

```
PUT /boms/{id}
```

Optional fields: `title`, `code`, `components[]`

---

## Routings

**Endpoint:** `GET /routings`

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `product_id` | Filter by product ID |
| `item_code` | Filter by item code/SKU |

### Response Fields

| Field | Description |
|-------|-------------|
| `id` | Routing ID |
| `code` | Routing code |
| `title` | Routing title |
| `product_id` | Product ID this routing belongs to |
| `item_code` | Product item code |
| `item_title` | Product item name |
| `operations` | Array of routing operations |

### Get Single Routing

```
GET /routings/{id}
```

### Create Routing

```
POST /routings
```

Required fields: `product_id`, `operations[]` (each with `type_id`, `ord`, `variable_time`)

### Update Routing

```
PUT /routings/{id}
```

Optional fields: `title`, `code`, `operations[]`

---

## Stock Lots

**Endpoint:** `GET /lots`

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `article_id` | Filter by article/item ID |
| `item_code` | Filter by item code/SKU |
| `lot_number` | Filter by lot number |
| `warehouse_id` | Filter by warehouse ID |

### Response Fields

| Field | Description |
|-------|-------------|
| `id` | Lot ID |
| `lot_number` | Lot number/code |
| `article_id` | Article/item ID |
| `item_code` | Item code |
| `item_title` | Item name |
| `quantity` | Total quantity |
| `available` | Available quantity |
| `expiry_date` | Expiry date (Unix timestamp) |
| `locations` | Array of storage locations |

### Get Single Lot

```
GET /lots/{id}
```

---

## Purchase Orders

**Endpoint:** `GET /purchase-orders`

Purchase orders are **read-only** (POST/PUT explicitly disabled by the API).

### Filter Parameters

| Parameter | Description |
|-----------|-------------|
| `code` | Filter by PO code (e.g., "PO-00123") |
| `vendor_id` | Filter by vendor/supplier ID |
| `status` | Filter by status code |
| `created_min`, `created_max` | Creation date range |
| `expected_date_min`, `expected_date_max` | Expected delivery date range |

### Response Fields

| Field | Description |
|-------|-------------|
| `id` | Purchase order ID |
| `code` | PO code |
| `status` | Status code |
| `vendor_id` | Vendor/supplier ID |
| `vendor_name` | Vendor name |
| `order_date` | Order date (Unix timestamp) |
| `expected_date` | Expected delivery date |
| `total_price` | Total price |
| `currency` | Currency code |
| `products` | Array of line items |
| `invoices` | Array of invoices |

### Get Single PO

```
GET /purchase-orders/{id}
```

---

## Reports

**Endpoint:** `GET /report/{type}`

### Report Types

| Type | Description |
|------|-------------|
| `inventory_summary` | Current stock summary |
| `inventory_movements` | Stock movements over period |
| `procurement` | Procurement/purchasing report |
| `production` | Production/manufacturing report |

### Required Parameters

| Parameter | Description |
|-----------|-------------|
| `from` | Start date (YYYY-MM-DD) |
| `to` | End date (YYYY-MM-DD) |

### Optional Parameters

| Parameter | Description |
|-----------|-------------|
| `article_id` | Filter by article/item ID |
| `warehouse_id` | Filter by warehouse ID |

---

## Implementation Notes

### Code Lookups

To find an order by code (e.g., "MO-39509"), use the `code` filter parameter:

```
GET /manufacturing-orders?code=MO-39509
```

This returns 1 result (or empty if not found), avoiding expensive pagination through 30k+ orders.

### Timestamps

All timestamps use Unix format (seconds since epoch).

### Wildcard Filtering

String fields support wildcard filtering where applicable.
