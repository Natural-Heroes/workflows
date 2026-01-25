# External Integrations

**Analysis Date:** 2026-01-25

## APIs & External Services

**MRPeasy ERP:**
- Service: MRPeasy REST API v1
- What it's used for: Manufacturing ERP data (inventory, orders, BOMs, routings, purchase orders, stock lots, reports)
- SDK/Client: Native fetch with `MrpEasyClient` in `src/services/mrpeasy/client.ts`
- Base URL: `https://api.mrpeasy.com/rest/v1`
- Auth: HTTP Basic Auth (base64-encoded apiKey:apiSecret)
  - Headers: `Authorization: Basic {base64(apiKey:apiSecret)}`
- Methods: GET, POST, PUT
- Pagination: Range headers (e.g., `Range: items=0-99`) with `Content-Range` responses
- Tools exported: Located in `src/mcp/tools/`
  - Inventory: `get_inventory`, `get_product`, `search_items`
  - Customer Orders (Sales): `get_customer_orders`, `get_customer_order_details`, `create_customer_order`, `update_customer_order`
  - Manufacturing Orders (Production): `get_manufacturing_orders`, `get_manufacturing_order_details`, `create_manufacturing_order`, `update_manufacturing_order`
  - Items: `create_item`, `update_item`
  - Bills of Materials: `get_boms`, `get_bom_details`, `create_bom`, `update_bom`
  - Routings: `get_routings`, `get_routing_details`, `create_routing`, `update_routing`
  - Stock Lots: `get_stock_lots`, `get_stock_lot_details`
  - Purchase Orders: `get_purchase_orders`, `get_purchase_order_details` (read-only)
  - Shipments: `get_shipments`, `get_shipment_details`
  - Reports: `get_report` (inventory_summary, inventory_movements, procurement, production)

**Inventory Planner:**
- Service: Inventory Planner Public API
- What it's used for: Demand forecasting, replenishment metrics, stock level management
- SDK/Client: Native fetch with `InventoryPlannerClient` in `src/services/inventory-planner/client.ts`
- Base URL: `https://app.inventory-planner.com`
- Auth: API Key + Account ID headers
  - Headers: `Authorization: {apiKey}`, `Account: {accountId}`
- Methods: GET, POST, PATCH, PUT
- Response format: JSON with pagination metadata
- Tools exported: Located in `src/mcp/inventory-planner/src/mcp/tools/`
  - Variants (core entity): `get_variants`, `update_variant`
  - Purchase Orders: `get_purchase_orders`, `create_purchase_order`, `update_purchase_order`, `update_received_quantity`

## Data Storage

**Databases:**
- No persistent database integration in current servers
- Session store: In-memory `Map<sessionId, transport>` in `src/server.ts` (MCP servers)
- No external database clients (no Prisma, Sequelize, etc.)

**File Storage:**
- Local filesystem only (no S3, cloud storage)
- No file upload/download features in current implementation

**Caching:**
- No external caching layer (Redis, Memcached)
- In-memory token bucket for rate limiting: `src/services/*/rate-limiter.ts`
- No request response caching

## Authentication & Identity

**Auth Provider:**
- Custom API Key / Account ID authentication
- MRPeasy: HTTP Basic Auth (RFC 7617 standard)
- Inventory Planner: Custom Authorization header

**Implementation:**
- `src/lib/env.ts` - Validates API credentials at startup
- `src/services/*/client.ts` - Adds auth headers to all requests
- No OAuth, JWT, or third-party identity provider

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, etc.)

**Logs:**
- Custom logger in `src/lib/logger.ts`
- Output: stderr only (critical for MCP protocol integrity)
- Format: ISO timestamp, log level, message, JSON data
- Levels: debug, info, warn, error
- No external logging service integration

**Metrics:**
- None detected in current implementation

## CI/CD & Deployment

**Hosting:**
- Container-based (Docker)
- Multi-stage Docker build in `Dockerfile` (both servers)
  - Build stage: Installs deps, compiles TypeScript
  - Runtime stage: Lightweight Alpine base, production deps only
- Image base: `node:20-alpine`
- Port: 3000 (exposed)

**CI Pipeline:**
- None detected in current codebase (see `.github/workflows/` in parent directory)

## Environment Configuration

**Required env vars:**
- MRPeasy server: `MRPEASY_API_KEY`, `MRPEASY_API_SECRET`
- Inventory Planner server: `INVENTORY_PLANNER_API_KEY`, `INVENTORY_PLANNER_ACCOUNT_ID`

**Optional env vars:**
- `PORT=3000` (default)
- `NODE_ENV=development` (default; allowed: development, production, test)

**Secrets location:**
- `.env` files (created from `.env.example`)
- MRPeasy: `.env.example` provided in `mcp/mrpeasy/`
- Inventory Planner: No `.env.example` found (build in progress)

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## Resilience & Rate Limiting

**Rate Limiting:**
- MRPeasy: Token bucket (100 request capacity, 10 tokens/second refill rate)
  - Located in `src/services/mrpeasy/rate-limiter.ts`
  - Capacity: 100 tokens, Refill: 7.5 tokens/second = 75 requests per 10 seconds
- Inventory Planner: Token bucket (conservative defaults, API limits not documented)
  - Located in `src/services/inventory-planner/rate-limiter.ts`

**Retry Strategy:**
- Exponential backoff with `withRetry()` in `src/services/*/retry.ts`
- Retryable status codes: 429 (rate limited), 503 (service unavailable), 408 (timeout), 502 (bad gateway), 504 (gateway timeout)
- Non-retryable: 4xx client errors (except 429), 401/403 (auth errors)
- Max retries: 3 (configurable in client config)

**Circuit Breaker:**
- Pattern: Circuit Breaker with states CLOSED → OPEN → HALF_OPEN
- Located in `src/services/*/circuit-breaker.ts`
- Configuration:
  - Failure threshold: 5 consecutive failures → OPEN
  - Success threshold: 2 successes in HALF_OPEN → back to CLOSED
  - Timeout: 30 seconds (OPEN → HALF_OPEN transition)
- Trip condition: Server errors (5xx) and network errors
- Excluded from trip: 4xx client errors (indicate bad requests, not service degradation)

**Request Queue:**
- Single-threaded serialization: max 1 concurrent request
- Located in `src/services/*/request-queue.ts`
- Prevents overwhelming external APIs

## Resilience Stack Order

**MRPeasy and Inventory Planner both use identical stack:**
1. Request Queue (max 1 concurrent)
2. Circuit Breaker (protects against sustained failures)
3. Retry with exponential backoff (handles transient failures)
4. Rate Limiter (token bucket)
5. Native fetch (actual HTTP request)

Example call chain in `src/services/mrpeasy/client.ts` lines 174-208:
```
queue.enqueue()
  → circuitBreaker.execute()
    → withRetry()
      → rateLimiter.waitForToken()
        → fetch()
```

---

*Integration audit: 2026-01-25*
