/**
 * Integration tests for purchase order MCP tools (PO-01 through PO-05).
 *
 * Tests the following tools:
 * - get_purchase_orders: List purchase orders with filtering (PO-01)
 * - get_'purchase-order': Get single PO with full details (PO-02)
 * - create_'purchase-order': Create new PO with preview/confirm (PO-03)
 * - update_'purchase-order': Update PO status/dates/notes (PO-04)
 * - update_received_qty: Record received quantities (PO-05)
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

describe('Purchase Order Tools', () => {
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
  // get_purchase_orders tool (PO-01)
  // ===========================================================================
  describe('get_purchase_orders tool', () => {
    it('returns paginated list with status summary and total value (PO-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'purchase-orders', total: 3, count: 3, limit: 50 },
          'purchase-orders': [
            {
              id: 'po-1',
              number: 'PO-001',
              type: 'purchase_order',
              status: 'open',
              vendor_id: 'v-1',
              vendor_name: 'Acme Corp',
              warehouse_id: 'wh-1',
              warehouse_name: 'Main Warehouse',
              order_date: '2026-01-20',
              expected_date: '2026-01-30',
              total: 5000,
              currency: 'USD',
              items: [{ id: 'item-1' }, { id: 'item-2' }],
            },
            {
              id: 'po-2',
              number: 'PO-002',
              type: 'purchase_order',
              status: 'open',
              vendor_id: 'v-2',
              vendor_name: 'Beta Inc',
              warehouse_id: 'wh-1',
              warehouse_name: 'Main Warehouse',
              order_date: '2026-01-21',
              expected_date: '2026-02-01',
              total: 3000,
              currency: 'USD',
              items: [{ id: 'item-3' }],
            },
            {
              id: 'po-3',
              number: 'PO-003',
              type: 'purchase_order',
              status: 'received',
              vendor_id: 'v-1',
              vendor_name: 'Acme Corp',
              warehouse_id: 'wh-1',
              warehouse_name: 'Main Warehouse',
              order_date: '2026-01-15',
              expected_date: '2026-01-25',
              received_date: '2026-01-24',
              total: 2000,
              currency: 'USD',
              items: [{ id: 'item-4' }],
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_orders', {});

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.orders).toBeDefined();
      const orders = data.orders as Array<Record<string, unknown>>;
      expect(orders).toHaveLength(3);

      // Check status summary in summary text
      expect(data.summary).toContain('3 of 3 orders');
      expect(data.summary).toContain('2 open');
      expect(data.summary).toContain('1 received');
      expect(data.summary).toContain('$10,000');

      // Check pagination
      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.showing).toBe(3);
      expect(pagination.total).toBe(3);
    });

    it('filters by status (PO-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'purchase-orders', total: 1, count: 1, limit: 50 },
          'purchase-orders': [
            {
              id: 'po-1',
              number: 'PO-001',
              status: 'open',
              total: 1000,
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_orders', {
        status: 'open',
      });

      expect(result).toBeDefined();
      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('status=open');
    });

    it('filters by vendor_id (PO-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'purchase-orders', total: 2, count: 2, limit: 50 },
          'purchase-orders': [
            { id: 'po-1', vendor_id: 'v-123', total: 1000 },
            { id: 'po-2', vendor_id: 'v-123', total: 2000 },
          ],
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_get_purchase_orders', {
        vendor_id: 'v-123',
      });

      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('vendor_id=v-123');
    });

    it('filters by warehouse_id (PO-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'purchase-orders', total: 1, count: 1, limit: 50 },
          'purchase-orders': [
            { id: 'po-1', warehouse_id: 'wh-specific', total: 1500 },
          ],
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_get_purchase_orders', {
        warehouse_id: 'wh-specific',
      });

      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('warehouse_id=wh-specific');
    });

    it('filters by date range (expected_date_gt, expected_date_lt) (PO-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'purchase-orders', total: 1, count: 1, limit: 50 },
          'purchase-orders': [
            { id: 'po-1', expected_date: '2026-01-28', total: 3000 },
          ],
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_get_purchase_orders', {
        expected_date_gt: '2026-01-25',
        expected_date_lt: '2026-01-31',
      });

      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('expected_date_gt=2026-01-25');
      expect(fetchCall[0]).toContain('expected_date_lt=2026-01-31');
    });

    it('filters by type (purchase_order, transfer, assembly) (PO-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'purchase-orders', total: 1, count: 1, limit: 50 },
          'purchase-orders': [
            { id: 'po-1', type: 'transfer', total: 500 },
          ],
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_get_purchase_orders', {
        type: 'transfer',
      });

      const fetchCall = fetchMocker.mock.calls[0];
      expect(fetchCall[0]).toContain('type=transfer');
    });

    it('returns empty result message when no orders match (PO-01)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'purchase-orders', total: 0, count: 0, limit: 50 },
          'purchase-orders': [],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_orders', {
        status: 'cancelled',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.summary).toContain('No purchase orders found');
      expect(data.orders).toEqual([]);
      const pagination = data.pagination as Record<string, unknown>;
      expect(pagination.showing).toBe(0);
      expect(pagination.total).toBe(0);
    });

    it('handles API auth errors (401)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Unauthorized' }),
        { status: 401 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(
        sessionId,
        'ip_get_purchase_orders',
        {}
      );

      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('Authentication failed');
    });
  });

  // ===========================================================================
  // get_purchase_order tool (PO-02)
  // ===========================================================================
  describe('get_purchase_order tool', () => {
    it('returns full order details with line items (PO-02)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            number: 'PO-001',
            type: 'purchase_order',
            status: 'open',
            vendor_id: 'v-1',
            vendor_name: 'Acme Corp',
            warehouse_id: 'wh-1',
            warehouse_name: 'Main Warehouse',
            order_date: '2026-01-20',
            expected_date: '2026-01-30',
            total: 5000,
            currency: 'USD',
            shipping_cost: 100,
            notes: 'Rush order',
            reference: 'REF-123',
            created_at: '2026-01-20T10:00:00Z',
            updated_at: '2026-01-21T12:00:00Z',
            items: [
              {
                id: 'item-1',
                variant_id: 'var-1',
                sku: 'SKU-001',
                title: 'Widget A',
                quantity: 100,
                received_quantity: 0,
                cost: 25,
                total: 2500,
              },
              {
                id: 'item-2',
                variant_id: 'var-2',
                sku: 'SKU-002',
                title: 'Widget B',
                quantity: 50,
                received_quantity: 0,
                cost: 50,
                total: 2500,
              },
            ],
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_order', {
        id: 'po-1',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.id).toBe('po-1');
      expect(data.number).toBe('PO-001');
      expect(data.status).toBe('open');
      expect(data.items).toHaveLength(2);
    });

    it('includes vendor/warehouse info (PO-02)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            vendor_id: 'v-1',
            vendor_name: 'Acme Corp',
            warehouse_id: 'wh-1',
            warehouse_name: 'Main Warehouse',
            items: [],
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_order', {
        id: 'po-1',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const vendor = data.vendor as Record<string, unknown>;
      expect(vendor.id).toBe('v-1');
      expect(vendor.name).toBe('Acme Corp');
      const warehouse = data.warehouse as Record<string, unknown>;
      expect(warehouse.id).toBe('wh-1');
      expect(warehouse.name).toBe('Main Warehouse');
    });

    it('includes dates (order, expected, received) (PO-02)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            order_date: '2026-01-20',
            expected_date: '2026-01-30',
            received_date: '2026-01-29',
            created_at: '2026-01-20T10:00:00Z',
            updated_at: '2026-01-29T15:00:00Z',
            items: [],
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_order', {
        id: 'po-1',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const dates = data.dates as Record<string, unknown>;
      expect(dates.orderDate).toBe('2026-01-20');
      expect(dates.expectedDate).toBe('2026-01-30');
      expect(dates.receivedDate).toBe('2026-01-29');
      expect(dates.createdAt).toBe('2026-01-20T10:00:00Z');
      expect(dates.updatedAt).toBe('2026-01-29T15:00:00Z');
    });

    it('includes financial data (total, currency, shipping) (PO-02)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            total: 5000,
            currency: 'USD',
            shipping_cost: 150,
            items: [],
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_order', {
        id: 'po-1',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const financial = data.financial as Record<string, unknown>;
      expect(financial.total).toBe(5000);
      expect(financial.currency).toBe('USD');
      expect(financial.shippingCost).toBe(150);
    });

    it('returns items with ordered and received quantities (PO-02)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            items: [
              {
                id: 'item-1',
                variant_id: 'var-1',
                sku: 'SKU-001',
                title: 'Widget A',
                quantity: 100,
                received_quantity: 75,
                cost: 25,
                total: 2500,
              },
            ],
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_get_purchase_order', {
        id: 'po-1',
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;
      expect(items[0].quantityOrdered).toBe(100);
      expect(items[0].quantityReceived).toBe(75);
      expect(items[0].sku).toBe('SKU-001');
      expect(items[0].variantId).toBe('var-1');
    });

    it('handles not found errors (404) (PO-02)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Purchase order not found' }),
        { status: 404 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(sessionId, 'ip_get_purchase_order', {
        id: 'nonexistent',
      });

      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('not found');
    });
  });

  // ===========================================================================
  // create_purchase_order tool (PO-03)
  // ===========================================================================
  describe('create_purchase_order tool', () => {
    it('preview mode returns preview object without API call (PO-03)', async () => {
      // Do NOT mock API - preview should not call it
      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_create_purchase_order', {
        vendor_id: 'v-1',
        warehouse_id: 'wh-1',
        items: [
          { variant_id: 'var-1', quantity: 50 },
          { variant_id: 'var-2', quantity: 30 },
        ],
        confirm: false,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.preview).toBe(true);
      expect(data.message).toContain('Set confirm=true');

      // Verify NO fetch was called (only the initialize creates a session)
      expect(fetchMocker.mock.calls.length).toBe(0);
    });

    it('preview shows itemCount and totalQuantity (PO-03)', async () => {
      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_create_purchase_order', {
        vendor_id: 'v-1',
        warehouse_id: 'wh-1',
        items: [
          { variant_id: 'var-1', quantity: 50 },
          { variant_id: 'var-2', quantity: 30 },
          { variant_id: 'var-3', quantity: 20 },
        ],
        confirm: false,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const order = data.order as Record<string, unknown>;
      expect(order.itemCount).toBe(3);
      expect(order.totalQuantity).toBe(100);
    });

    it('confirm mode creates order and returns success (PO-03)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-new',
            number: 'PO-999',
            status: 'draft',
            vendor_name: 'Acme Corp',
            warehouse_name: 'Main Warehouse',
            total: 2500,
            items: [
              { id: 'item-1', variant_id: 'var-1', quantity: 50 },
              { id: 'item-2', variant_id: 'var-2', quantity: 30 },
            ],
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_create_purchase_order', {
        vendor_id: 'v-1',
        warehouse_id: 'wh-1',
        items: [
          { variant_id: 'var-1', quantity: 50 },
          { variant_id: 'var-2', quantity: 30 },
        ],
        confirm: true,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.success).toBe(true);
      expect(data.message).toContain('PO-999');
      expect(data.message).toContain('created successfully');

      const order = data.order as Record<string, unknown>;
      expect(order.id).toBe('po-new');
      expect(order.number).toBe('PO-999');
    });

    it('confirm order includes vendor_id, warehouse_id, items (PO-03)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-new',
            number: 'PO-999',
            status: 'draft',
            items: [],
          },
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_create_purchase_order', {
        vendor_id: 'v-specific',
        warehouse_id: 'wh-specific',
        items: [{ variant_id: 'var-1', quantity: 100 }],
        expected_date: '2026-02-15',
        notes: 'Test order',
        confirm: true,
      });

      // Verify the API was called with correct body
      const fetchCall = fetchMocker.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      expect(requestBody.vendor_id).toBe('v-specific');
      expect(requestBody.warehouse_id).toBe('wh-specific');
      expect(requestBody.items).toHaveLength(1);
      expect(requestBody.items[0].variant_id).toBe('var-1');
    });

    it('handles API errors on creation (PO-03)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Invalid vendor ID' }),
        { status: 400 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(
        sessionId,
        'ip_create_purchase_order',
        {
          vendor_id: 'invalid-vendor',
          warehouse_id: 'wh-1',
          items: [{ variant_id: 'var-1', quantity: 50 }],
          confirm: true,
        }
      );

      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('rejected');
    });
  });

  // ===========================================================================
  // update_purchase_order tool (PO-04)
  // ===========================================================================
  describe('update_purchase_order tool', () => {
    it('preview mode returns preview of changes without API call (PO-04)', async () => {
      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_update_purchase_order', {
        id: 'po-1',
        status: 'sent',
        confirm: false,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.preview).toBe(true);
      expect(data.message).toContain('Set confirm=true');

      const updates = data.updates as Record<string, unknown>;
      expect(updates.id).toBe('po-1');
      expect(updates.status).toBe('sent');

      // Verify NO fetch was called
      expect(fetchMocker.mock.calls.length).toBe(0);
    });

    it('confirm mode updates order and returns success (PO-04)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            number: 'PO-001',
            status: 'sent',
            expected_date: '2026-02-01',
          },
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_update_purchase_order', {
        id: 'po-1',
        status: 'sent',
        confirm: true,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.success).toBe(true);
      expect(data.message).toContain('PO-001');
      expect(data.message).toContain('updated successfully');
    });

    it('can update status (PO-04)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            number: 'PO-001',
            status: 'received',
          },
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_update_purchase_order', {
        id: 'po-1',
        status: 'received',
        confirm: true,
      });

      const fetchCall = fetchMocker.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      expect(requestBody.status).toBe('received');
    });

    it('can update expected_date (PO-04)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            number: 'PO-001',
            expected_date: '2026-02-15',
          },
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_update_purchase_order', {
        id: 'po-1',
        expected_date: '2026-02-15',
        confirm: true,
      });

      const fetchCall = fetchMocker.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      expect(requestBody.expected_date).toBe('2026-02-15');
    });

    it('can update notes and reference (PO-04)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          'purchase-order': {
            id: 'po-1',
            number: 'PO-001',
          },
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'ip_update_purchase_order', {
        id: 'po-1',
        notes: 'Updated notes',
        reference: 'NEW-REF-456',
        confirm: true,
      });

      const fetchCall = fetchMocker.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      expect(requestBody.notes).toBe('Updated notes');
      expect(requestBody.reference).toBe('NEW-REF-456');
    });

    it('handles not found errors (404) (PO-04)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Purchase order not found' }),
        { status: 404 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(
        sessionId,
        'ip_update_purchase_order',
        {
          id: 'nonexistent',
          status: 'sent',
          confirm: true,
        }
      );

      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('not found');
    });
  });

  // ===========================================================================
  // update_received_qty tool (PO-05)
  // ===========================================================================
  describe('update_received_qty tool', () => {
    it('preview mode returns preview without API call (PO-05)', async () => {
      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_update_received_qty', {
        order_id: 'po-1',
        items: [
          { id: 'item-1', received_quantity: 50 },
          { id: 'item-2', received_quantity: 25 },
        ],
        confirm: false,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.preview).toBe(true);
      expect(data.message).toContain('Set confirm=true');

      const updates = data.updates as Record<string, unknown>;
      expect(updates.order_id).toBe('po-1');
      const items = updates.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);

      // Verify NO fetch was called
      expect(fetchMocker.mock.calls.length).toBe(0);
    });

    it('confirm mode updates received quantities (PO-05)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          items: [
            {
              id: 'item-1',
              sku: 'SKU-001',
              quantity: 100,
              received_quantity: 75,
            },
            {
              id: 'item-2',
              sku: 'SKU-002',
              quantity: 50,
              received_quantity: 50,
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_update_received_qty', {
        order_id: 'po-1',
        items: [
          { id: 'item-1', received_quantity: 75 },
          { id: 'item-2', received_quantity: 50 },
        ],
        confirm: true,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      expect(data.success).toBe(true);
      expect(data.message).toContain('2 items');
    });

    it('returns updated items with ordered vs received (PO-05)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          items: [
            {
              id: 'item-1',
              sku: 'SKU-001',
              quantity: 100,
              received_quantity: 80,
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const { result } = await callTool(sessionId, 'ip_update_received_qty', {
        order_id: 'po-1',
        items: [{ id: 'item-1', received_quantity: 80 }],
        confirm: true,
      });

      expect(result).toBeDefined();
      const data = result as Record<string, unknown>;
      const items = data.items as Array<Record<string, unknown>>;
      expect(items[0].quantityOrdered).toBe(100);
      expect(items[0].quantityReceived).toBe(80);
      expect(items[0].sku).toBe('SKU-001');
    });

    it('handles order not found errors (PO-05)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Purchase order not found' }),
        { status: 404 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(sessionId, 'ip_update_received_qty', {
        order_id: 'nonexistent',
        items: [{ id: 'item-1', received_quantity: 50 }],
        confirm: true,
      });

      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('not found');
    });

    it('handles item not found errors (PO-05)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({ message: 'Item not found in order' }),
        { status: 404 }
      );

      const sessionId = await initializeSession();
      const { result, isError } = await callTool(sessionId, 'ip_update_received_qty', {
        order_id: 'po-1',
        items: [{ id: 'nonexistent-item', received_quantity: 50 }],
        confirm: true,
      });

      expect(isError).toBe(true);
      expect(typeof result).toBe('string');
      expect(result).toContain('not found');
    });
  });
});
