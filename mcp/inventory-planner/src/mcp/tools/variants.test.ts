/**
 * Integration tests for variant MCP tools (READ-01 through READ-05).
 *
 * Tests the following tools:
 * - get_variants: List variants with filtering (READ-01, READ-02, READ-04)
 * - get_variant: Get single variant with full metrics (READ-01, READ-05)
 * - get_replenishment: Get items needing reorder (READ-03)
 *
 * Uses vitest-fetch-mock to mock Inventory Planner API responses.
 */

// Set fake environment variables before importing app
process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import request from 'supertest';
import { app, transports } from '../../app.js';
import { resetInventoryPlannerClient } from '../../services/inventory-planner/index.js';

const fetchMocker = createFetchMock(vi);
const MCP_ACCEPT_HEADER = 'application/json, text/event-stream';

/**
 * Parse SSE (Server-Sent Events) response text to extract JSON data.
 * SSE format: "event: message\ndata: {...}\n\n"
 */
function parseSSEResponse(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Helper to initialize an MCP session and return the session ID.
 */
async function initializeSession(): Promise<string> {
  const sizeBefore = transports.size;

  await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT_HEADER)
    .send({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
      id: 1,
    });

  // Wait a tick for async session initialization
  await new Promise((resolve) => setTimeout(resolve, 10));

  const sessionIds = Array.from(transports.keys());
  const newSessionId = sessionIds.find(
    (id) => !sessionIds.slice(0, sizeBefore).includes(id)
  );

  if (!newSessionId && sessionIds.length > 0) {
    return sessionIds[sessionIds.length - 1];
  }

  return newSessionId || sessionIds[0];
}

/**
 * Helper to call an MCP tool and return the parsed result.
 * Returns { result, isError } where isError indicates if the tool returned an error response.
 */
async function callTool(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ result?: unknown; isError?: boolean; error?: unknown }> {
  // Send initialized notification
  await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT_HEADER)
    .set('mcp-session-id', sessionId)
    .send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

  // Call the tool
  const response = await request(app)
    .post('/mcp')
    .set('Accept', MCP_ACCEPT_HEADER)
    .set('mcp-session-id', sessionId)
    .send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
      id: 2,
    });

  const data = parseSSEResponse(response.text);
  if (!data) {
    return { error: 'Failed to parse SSE response' };
  }

  if (data.error) {
    return { error: data.error };
  }

  const result = data.result as Record<string, unknown>;
  if (result?.content) {
    const content = result.content as Array<{ type: string; text: string }>;
    const isError = result.isError === true;
    if (content[0]?.text) {
      try {
        return { result: JSON.parse(content[0].text), isError };
      } catch {
        // Error messages are plain text, not JSON
        return { result: content[0].text, isError };
      }
    }
  }

  return { result };
}

describe('Variant Tools', () => {
  beforeEach(() => {
    fetchMocker.enableMocks();
    fetchMocker.resetMocks();
    transports.clear();
    resetInventoryPlannerClient();
  });

  afterEach(() => {
    fetchMocker.disableMocks();
  });

  // ===========================================================================
  // get_variants tool (READ-01, READ-02, READ-04)
  // ===========================================================================
  describe('get_variants tool', () => {
    it('returns variants with stock metrics (READ-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 100 },
          variants: [
            {
              id: 'v1',
              sku: 'TEST-SKU-001',
              title: 'Test Product',
              stock_on_hand: 100,
              stock_available: 90,
              stock_incoming: 20,
              replenishment: 50,
              oos: 14,
              days_of_stock: 30,
              inventory_value: 1500.0,
              vendor_name: 'Acme Corp',
              warehouse_name: 'Main Warehouse',
              forecast_daily: 3.0,
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {});

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.variants).toBeDefined();
      const variants = data.variants as Array<Record<string, unknown>>;
      expect(variants).toHaveLength(1);
      expect(variants[0].sku).toBe('TEST-SKU-001');
      expect(variants[0].stockOnHand).toBe(100);
      expect(variants[0].stockAvailable).toBe(90);
      expect(variants[0].stockIncoming).toBe(20);
    });

    it('filters by SKU parameter (READ-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 100 },
          variants: [
            {
              id: 'v1',
              sku: 'SPECIFIC-SKU',
              title: 'Specific Product',
              stock_on_hand: 50,
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {
        sku: 'SPECIFIC-SKU',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const variants = data.variants as Array<Record<string, unknown>>;
      expect(variants).toHaveLength(1);
      expect(variants[0].sku).toBe('SPECIFIC-SKU');

      // Verify the API was called with the SKU parameter
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('sku_eqi=SPECIFIC-SKU'); // Case-insensitive filter
    });

    it('filters by warehouse_id parameter', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 2, count: 2, limit: 100 },
          variants: [
            { id: 'v1', sku: 'WH-SKU-001', warehouse_id: 'wh-1' },
            { id: 'v2', sku: 'WH-SKU-002', warehouse_id: 'wh-1' },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {
        warehouse_id: 'wh-1',
      });

      expect(result).toBeDefined();
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('warehouse_id=wh-1');
    });

    it('filters by vendor_id parameter', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 100 },
          variants: [
            { id: 'v1', sku: 'VENDOR-SKU', vendor_id: 'vendor-123' },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {
        vendor_id: 'vendor-123',
      });

      expect(result).toBeDefined();
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('vendor_id=vendor-123');
    });

    it('filters by stock_on_hand_lt for low stock (READ-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 100 },
          variants: [
            { id: 'v1', sku: 'LOW-STOCK', stock_on_hand: 5 },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {
        stock_on_hand_lt: 10,
      });

      expect(result).toBeDefined();
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('stock_on_hand_lt=10');
    });

    it('filters by oos_lt for stockout risk (READ-02)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 2, count: 2, limit: 100 },
          variants: [
            { id: 'v1', sku: 'URGENT-1', oos: 3 },
            { id: 'v2', sku: 'URGENT-2', oos: 5 },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {
        oos_lt: 7,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const variants = data.variants as Array<Record<string, unknown>>;
      expect(variants).toHaveLength(2);

      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('oos_lt=7');
    });

    it('returns inventory_value for value breakdowns (READ-04)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 2, count: 2, limit: 100 },
          variants: [
            { id: 'v1', sku: 'VALUE-1', inventory_value: 5000.0 },
            { id: 'v2', sku: 'VALUE-2', inventory_value: 3000.0 },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {});

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const variants = data.variants as Array<Record<string, unknown>>;
      expect(variants[0].inventoryValue).toBe(5000.0);
      expect(variants[1].inventoryValue).toBe(3000.0);

      // Summary should include total value
      expect(data.summary).toContain('$8,000');
    });

    it('handles empty results', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 0, count: 0, limit: 100 },
          variants: [],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {
        sku: 'NONEXISTENT',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.summary).toContain('No variants found');
      expect(data.variants).toEqual([]);
      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.showing).toBe(0);
      expect(pagination.total).toBe(0);
    });

    it('returns pagination metadata', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 250, count: 100, limit: 100 },
          variants: Array(100)
            .fill(null)
            .map((_, i) => ({ id: `v${i}`, sku: `SKU-${i}` })),
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variants', {
        page: 1,
        limit: 100,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.showing).toBe(100);
      expect(pagination.total).toBe(250);
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(100);
    });

    it('returns LLM-friendly error on auth failure (401)', async () => {
      // 401 errors are not retried, so only need one mock
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Unauthorized' }),
        { status: 401 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(sessionId, 'get_variants', {});

      // Error responses are plain text, not JSON
      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('Authentication failed');
    });

    it('returns LLM-friendly error on validation failure (400)', async () => {
      // 400 errors are not retried, so only need one mock
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Invalid parameter: limit must be positive' }),
        { status: 400 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(sessionId, 'get_variants', {});

      // Error responses are plain text, not JSON
      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('Inventory Planner API rejected the request');
    });
  });

  // ===========================================================================
  // get_variant tool (READ-01, READ-05)
  // ===========================================================================
  describe('get_variant tool', () => {
    it('returns single variant with full metrics (READ-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          variant: {
            id: 'v1',
            sku: 'TEST-SKU-001',
            title: 'Test Product',
            full_title: 'Test Product - Size M',
            product_id: 'p1',
            stock_on_hand: 100,
            stock_available: 90,
            stock_incoming: 20,
            stock_reserved: 10,
            replenishment: 50,
            oos: 14,
            days_of_stock: 30,
            reorder_point: 25,
            safety_stock: 10,
            lead_time: 7,
            review_period: 14,
            forecast_daily: 3.0,
            forecast_weekly: 21.0,
            forecast_monthly: 90.0,
            velocity_daily: 2.8,
            velocity_weekly: 19.6,
            avg_cost: 15.0,
            price: 29.99,
            inventory_value: 1500.0,
            under_value: 0,
            over_value: 200.0,
            vendor_id: 'vendor-1',
            vendor_name: 'Acme Corp',
            warehouse_id: 'wh-1',
            warehouse_name: 'Main Warehouse',
            product_type: 'Widgets',
            abc_class: 'A',
            xyz_class: 'X',
            tags: ['bestseller'],
            active: true,
            updated_at: '2026-01-25T12:00:00Z',
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variant', { id: 'v1' });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.id).toBe('v1');
      expect(data.sku).toBe('TEST-SKU-001');
      expect(data.title).toBe('Test Product - Size M');
    });

    it('returns stock object (onHand, available, incoming, reserved)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          variant: {
            id: 'v1',
            stock_on_hand: 100,
            stock_available: 90,
            stock_incoming: 20,
            stock_reserved: 10,
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variant', { id: 'v1' });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const stock = data.stock as Record<string, unknown>;
      expect(stock.onHand).toBe(100);
      expect(stock.available).toBe(90);
      expect(stock.incoming).toBe(20);
      expect(stock.reserved).toBe(10);
    });

    it('returns replenishment metrics', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          variant: {
            id: 'v1',
            replenishment: 50,
            oos: 14,
            days_of_stock: 30,
            reorder_point: 25,
            safety_stock: 10,
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variant', { id: 'v1' });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const replenishment = data.replenishment as Record<string, unknown>;
      expect(replenishment.quantity).toBe(50);
      expect(replenishment.daysUntilOOS).toBe(14);
      expect(replenishment.daysOfStock).toBe(30);
      expect(replenishment.reorderPoint).toBe(25);
      expect(replenishment.safetyStock).toBe(10);
    });

    it('returns forecast data (READ-05)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          variant: {
            id: 'v1',
            forecast_daily: 3.0,
            forecast_weekly: 21.0,
            forecast_monthly: 90.0,
            velocity_daily: 2.8,
            velocity_weekly: 19.6,
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variant', { id: 'v1' });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const forecast = data.forecast as Record<string, unknown>;
      expect(forecast.daily).toBe(3.0);
      expect(forecast.weekly).toBe(21.0);
      expect(forecast.monthly).toBe(90.0);
      expect(forecast.velocityDaily).toBe(2.8);
      expect(forecast.velocityWeekly).toBe(19.6);
    });

    it('returns financial data', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          variant: {
            id: 'v1',
            avg_cost: 15.0,
            price: 29.99,
            inventory_value: 1500.0,
            under_value: 0,
            over_value: 200.0,
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variant', { id: 'v1' });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const financial = data.financial as Record<string, unknown>;
      expect(financial.avgCost).toBe(15.0);
      expect(financial.price).toBe(29.99);
      expect(financial.inventoryValue).toBe(1500.0);
      expect(financial.underValue).toBe(0);
      expect(financial.overValue).toBe(200.0);
    });

    it('returns classification (warehouse, vendor, abcClass)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          variant: {
            id: 'v1',
            warehouse_id: 'wh-1',
            warehouse_name: 'Main Warehouse',
            vendor_id: 'vendor-1',
            vendor_name: 'Acme Corp',
            abc_class: 'A',
            xyz_class: 'X',
            product_type: 'Widgets',
            tags: ['bestseller'],
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_variant', { id: 'v1' });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const classification = data.classification as Record<string, unknown>;
      expect(classification.warehouse).toBe('Main Warehouse');
      expect(classification.warehouseId).toBe('wh-1');
      expect(classification.abcClass).toBe('A');
      expect(classification.xyzClass).toBe('X');
      expect(classification.productType).toBe('Widgets');
      expect(classification.tags).toEqual(['bestseller']);
    });

    it('returns LLM-friendly error for not found (404)', async () => {
      // 404 errors are not retried, so only need one mock
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Resource not found' }),
        { status: 404 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(sessionId, 'get_variant', {
        id: 'nonexistent',
      });

      // Error responses are plain text, not JSON
      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('not found');
    });
  });

  // ===========================================================================
  // get_replenishment tool (READ-03)
  // ===========================================================================
  describe('get_replenishment tool', () => {
    it('returns only items with replenishment > 0 (READ-03)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 2, count: 2, limit: 100 },
          variants: [
            {
              id: 'v1',
              sku: 'REORDER-1',
              title: 'Needs Reorder 1',
              stock_on_hand: 10,
              stock_incoming: 0,
              replenishment: 50,
              oos: 5,
              lead_time: 7,
              vendor_name: 'Acme Corp',
              warehouse_name: 'Main Warehouse',
            },
            {
              id: 'v2',
              sku: 'REORDER-2',
              title: 'Needs Reorder 2',
              stock_on_hand: 5,
              stock_incoming: 10,
              replenishment: 30,
              oos: 10,
              lead_time: 5,
              vendor_name: 'Acme Corp',
              warehouse_name: 'Main Warehouse',
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_replenishment', {});

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.items).toBeDefined();
      const items = data.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(items[0].replenishmentQty).toBe(50);
      expect(items[1].replenishmentQty).toBe(30);

      // Verify replenishment_gt=0 filter was sent
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('replenishment_gt=0');
    });

    it('filters by warehouse_id', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 100 },
          variants: [
            {
              id: 'v1',
              sku: 'WH-REORDER',
              replenishment: 25,
              warehouse_id: 'wh-specific',
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_replenishment', {
        warehouse_id: 'wh-specific',
      });

      expect(result).toBeDefined();
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('warehouse_id=wh-specific');
      expect(fetchCall[0]).toContain('replenishment_gt=0');
    });

    it('filters by vendor_id', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 100 },
          variants: [
            {
              id: 'v1',
              sku: 'VENDOR-REORDER',
              replenishment: 40,
              vendor_id: 'vendor-specific',
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_replenishment', {
        vendor_id: 'vendor-specific',
      });

      expect(result).toBeDefined();
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('vendor_id=vendor-specific');
    });

    it('returns replenishment quantities and urgency (daysUntilOOS)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 100 },
          variants: [
            {
              id: 'v1',
              sku: 'URGENT-ITEM',
              title: 'Urgent Reorder',
              stock_on_hand: 5,
              stock_incoming: 0,
              replenishment: 100,
              oos: 3,
              lead_time: 10,
              vendor_name: 'Fast Vendor',
              vendor_id: 'vendor-1',
              warehouse_name: 'Main Warehouse',
              warehouse_id: 'wh-1',
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_replenishment', {});

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;
      expect(items[0].replenishmentQty).toBe(100);
      expect(items[0].daysUntilOOS).toBe(3);
      expect(items[0].leadTime).toBe(10);
      expect(items[0].vendor).toBe('Fast Vendor');
      expect(items[0].vendorId).toBe('vendor-1');
      expect(items[0].warehouse).toBe('Main Warehouse');
      expect(items[0].warehouseId).toBe('wh-1');
    });

    it('calculates urgent count (oos < 7 days)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 3, count: 3, limit: 100 },
          variants: [
            { id: 'v1', sku: 'URGENT-1', replenishment: 50, oos: 3 },
            { id: 'v2', sku: 'URGENT-2', replenishment: 30, oos: 5 },
            { id: 'v3', sku: 'NOT-URGENT', replenishment: 20, oos: 14 },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_replenishment', {});

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      // Summary should mention 2 urgent items
      expect(data.summary).toContain('2 urgent');
    });

    it('handles empty results', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 0, count: 0, limit: 100 },
          variants: [],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_replenishment', {});

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.summary).toContain('No items currently need replenishment');
      expect(data.items).toEqual([]);
      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.showing).toBe(0);
      expect(pagination.total).toBe(0);
    });

    it('returns LLM-friendly error on auth failure (403)', async () => {
      // 403 errors are not retried, so only need one mock
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Forbidden' }),
        { status: 403 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(sessionId, 'get_replenishment', {});

      // Error responses are plain text, not JSON
      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('Authentication failed');
    });

    it('returns pagination metadata', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 150, count: 50, limit: 50 },
          variants: Array(50)
            .fill(null)
            .map((_, i) => ({ id: `v${i}`, sku: `SKU-${i}`, replenishment: 10 })),
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'get_replenishment', {
        page: 1,
        limit: 50,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.showing).toBe(50);
      expect(pagination.total).toBe(150);
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(50);
    });
  });
});
