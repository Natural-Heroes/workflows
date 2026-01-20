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
| 20 | Scheduled |
| 30 | In Progress |
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
| 30 | Confirmed |
| 70 | Shipped |
| 80 | Delivered |
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
