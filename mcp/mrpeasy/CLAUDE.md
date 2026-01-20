# MRPeasy MCP Server

Model Context Protocol server for MRPeasy ERP integration.

## Overview

This MCP server provides tools for querying MRPeasy data:
- Stock/inventory items
- Customer orders (sales orders)
- Manufacturing orders (production orders)

## Project Structure

```
src/
├── mcp/                    # MCP server implementation
│   ├── server.ts           # Server setup and initialization
│   └── tools/              # Tool implementations
│       ├── inventory.ts    # get_stock_items, search_items, get_item_details
│       ├── orders.ts       # get_customer_orders, get_manufacturing_orders,
│       │                   # get_customer_order_details, get_manufacturing_order_details
│       └── error-handler.ts
├── services/
│   └── mrpeasy/            # MRPeasy API client
│       ├── client.ts       # HTTP client with resilience features
│       ├── types.ts        # TypeScript types for API
│       ├── rate-limiter.ts # Token bucket (100 req/10s)
│       ├── retry.ts        # Exponential backoff
│       ├── circuit-breaker.ts
│       └── request-queue.ts # Single concurrent request
└── lib/
    └── logger.ts           # Structured logging
```

## API Reference

See [docs/MRPEASY_API.md](docs/MRPEASY_API.md) for MRPeasy REST API documentation.

### Key Implementation Details

1. **Pagination**: MRPeasy ignores query string pagination. Use Range headers:
   ```
   Range: items=0-99
   Content-Range: items 0-99/3633
   ```

2. **Code Lookups**: Use the `code` filter for efficient lookups:
   ```
   GET /manufacturing-orders?code=MO-39509  # 1 API call
   GET /customer-orders?code=CO-01263       # 1 API call
   ```

3. **Rate Limiting**: Token bucket (75 capacity, 7.5 tokens/second refill)

4. **Resilience Stack**: queue → circuit breaker → retry → rate limiter → fetch

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MRPEASY_API_KEY` | API key from MRPeasy Settings → Integration |
| `MRPEASY_API_SECRET` | API secret from MRPeasy Settings → Integration |

## MCP Tools

### Inventory
- `get_stock_items` - Query stock with filters (code, warehouse, quantity)
- `search_items` - Search items by name/code
- `get_item_details` - Get single item by ID or code

### Orders
- `get_customer_orders` - List customer orders with filters
- `get_customer_order_details` - Get CO by ID or code
- `get_manufacturing_orders` - List MOs with filters
- `get_manufacturing_order_details` - Get MO by ID or code
