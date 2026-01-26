/**
 * Integration tests for reference data tools (REF-01, REF-02)
 *
 * Tests list_warehouses and list_vendors MCP tools that extract
 * reference data from variant responses.
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

  // Wait for async session initialization
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
 */
async function callTool(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  // Send initialized notification first
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
    throw new Error('Failed to parse SSE response');
  }

  return data;
}

describe('Reference Data Tools', () => {
  beforeEach(() => {
    fetchMocker.enableMocks();
    fetchMocker.resetMocks();
    transports.clear();
    resetInventoryPlannerClient();
  });

  afterEach(() => {
    fetchMocker.disableMocks();
  });

  describe('list_warehouses tool (REF-01)', () => {
    it('returns warehouses from /api/v1/warehouses endpoint', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'warehouses', total: 3, count: 3, limit: 10 },
          warehouses: [
            { name: 'wh-1', display_name: 'Main Warehouse', type: 'warehouse', disabled: false },
            { name: 'wh-2', display_name: 'East Coast DC', type: 'warehouse', disabled: false },
            { name: 'wh-3', display_name: 'West Coast DC', type: 'warehouse', disabled: true },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_warehouses', {});

      expect(result.result).toBeDefined();
      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      // By default, disabled warehouses are filtered out
      expect(parsed.warehouses).toHaveLength(2);
      expect(parsed.warehouses).toContainEqual({
        id: 'wh-1',
        name: 'Main Warehouse',
        type: 'warehouse',
        disabled: false,
        connection: undefined,
      });
    });

    it('includes disabled warehouses when include_disabled=true', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'warehouses', total: 3, count: 3, limit: 10 },
          warehouses: [
            { name: 'wh-1', display_name: 'Active Warehouse', type: 'warehouse', disabled: false },
            { name: 'wh-2', display_name: 'Disabled Warehouse', type: 'warehouse', disabled: true },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_warehouses', { include_disabled: true });

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.warehouses).toHaveLength(2);
    });

    it('returns summary with active and disabled counts', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'warehouses', total: 4, count: 4, limit: 10 },
          warehouses: [
            { name: 'wh-1', display_name: 'Active 1', type: 'warehouse', disabled: false },
            { name: 'wh-2', display_name: 'Active 2', type: 'warehouse', disabled: false },
            { name: 'wh-3', display_name: 'Disabled 1', type: 'warehouse', disabled: true },
            { name: 'wh-4', display_name: 'Disabled 2', type: 'warehouse', disabled: true },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_warehouses', { include_disabled: true });

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.summary).toBe('4 warehouse(s) found. 2 active, 2 disabled.');
    });

    it('handles empty warehouses list', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'warehouses', total: 0, count: 0, limit: 10 },
          warehouses: [],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_warehouses', {});

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.warehouses).toHaveLength(0);
      expect(parsed.summary).toBe('0 warehouse(s) found. 0 active, 0 disabled.');
    });

    it('returns LLM-friendly error on API failure', async () => {
      // Use 401 (non-retryable) to avoid retry delays
      fetchMocker.mockResponseOnce(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      });

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_warehouses', {});

      const toolResult = result.result as Record<string, unknown>;
      expect(toolResult.isError).toBe(true);

      const content = toolResult.content as Array<{ text: string }>;
      expect(content[0].text).toContain('Authentication failed');
    });
  });

  describe('list_vendors tool (REF-02)', () => {
    it('returns unique vendors from vendor_id/vendor_name fields', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 3, count: 3, limit: 1000 },
          variants: [
            { vendor_id: 'v-1', vendor_name: 'Acme Corp' },
            { vendor_id: 'v-2', vendor_name: 'Widget Co' },
            { vendor_id: 'v-3', vendor_name: 'Supply Inc' },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', {});

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.vendors).toHaveLength(3);
      expect(parsed.vendors).toContainEqual({ id: 'v-1', name: 'Acme Corp' });
      expect(parsed.vendors).toContainEqual({ id: 'v-2', name: 'Widget Co' });
      expect(parsed.vendors).toContainEqual({ id: 'v-3', name: 'Supply Inc' });
    });

    it('extracts vendors from vendors array (multiple vendors per variant)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 1, count: 1, limit: 1000 },
          variants: [
            {
              vendor_id: 'v-1',
              vendor_name: 'Primary Vendor',
              vendors: [
                { id: 'v-1', name: 'Primary Vendor' },
                { id: 'v-2', name: 'Backup Supplier' },
                { id: 'v-3', name: 'Alternative Source' },
              ],
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', {});

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.vendors).toHaveLength(3);
      expect(parsed.vendors).toContainEqual({ id: 'v-1', name: 'Primary Vendor' });
      expect(parsed.vendors).toContainEqual({ id: 'v-2', name: 'Backup Supplier' });
      expect(parsed.vendors).toContainEqual({ id: 'v-3', name: 'Alternative Source' });
    });

    it('deduplicates vendors by ID across vendor_id and vendors array', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 2, count: 2, limit: 1000 },
          variants: [
            {
              vendor_id: 'v-1',
              vendor_name: 'Acme Corp',
              vendors: [
                { id: 'v-1', name: 'Acme Corp' },
                { id: 'v-2', name: 'Backup Supplier' },
              ],
            },
            {
              vendor_id: 'v-3',
              vendor_name: 'Widget Co',
              vendors: [
                { id: 'v-1', name: 'Acme Corp' }, // duplicate
              ],
            },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', {});

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      // v-1 appears 3 times but should be deduplicated to 1
      expect(parsed.vendors).toHaveLength(3);
    });

    it('respects limit parameter', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 5, count: 5, limit: 1000 },
          variants: [
            { vendor_id: 'v-1', vendor_name: 'Vendor 1' },
            { vendor_id: 'v-2', vendor_name: 'Vendor 2' },
            { vendor_id: 'v-3', vendor_name: 'Vendor 3' },
            { vendor_id: 'v-4', vendor_name: 'Vendor 4' },
            { vendor_id: 'v-5', vendor_name: 'Vendor 5' },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', { limit: 3 });

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.vendors).toHaveLength(3);
      expect(parsed.note).toContain('Results limited');
    });

    it('returns summary with count', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 2, count: 2, limit: 1000 },
          variants: [
            { vendor_id: 'v-1', vendor_name: 'Vendor 1' },
            { vendor_id: 'v-2', vendor_name: 'Vendor 2' },
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', {});

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.summary).toBe('2 vendor(s) found.');
    });

    it('handles empty variants (no vendors found)', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 0, count: 0, limit: 1000 },
          variants: [],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', {});

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      expect(parsed.vendors).toHaveLength(0);
      expect(parsed.summary).toBe('0 vendor(s) found.');
    });

    it('returns LLM-friendly error on API failure', async () => {
      // Use 404 (non-retryable) to avoid retry delays
      fetchMocker.mockResponseOnce(JSON.stringify({ error: 'Not found' }), {
        status: 404,
      });

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', {});

      const toolResult = result.result as Record<string, unknown>;
      expect(toolResult.isError).toBe(true);

      const content = toolResult.content as Array<{ text: string }>;
      expect(content[0].text.toLowerCase()).toContain('not found');
    });

    it('handles variants with missing vendor fields gracefully', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 4, count: 4, limit: 1000 },
          variants: [
            { vendor_id: 'v-1', vendor_name: 'Complete Vendor' },
            { vendor_id: 'v-2' }, // missing vendor_name
            { vendor_name: 'Missing ID Vendor' }, // missing vendor_id
            { sku: 'SKU123' }, // no vendor info at all
          ],
        })
      );

      const sessionId = await initializeSession();
      const result = await callTool(sessionId, 'list_vendors', {});

      const toolResult = result.result as Record<string, unknown>;
      const content = toolResult.content as Array<{ text: string }>;
      const parsed = JSON.parse(content[0].text);

      // Only the complete vendor should be included
      expect(parsed.vendors).toHaveLength(1);
      expect(parsed.vendors[0]).toEqual({ id: 'v-1', name: 'Complete Vendor' });
    });
  });

  describe('API request verification', () => {
    it('list_warehouses calls /api/v1/warehouses endpoint', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'warehouses', total: 0, count: 0, limit: 10 },
          warehouses: [],
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'list_warehouses', {});

      // Check the fetch was called with correct endpoint
      const calls = fetchMocker.mock.calls;
      const warehousesCall = calls.find((call) =>
        String(call[0]).includes('/api/v1/warehouses')
      );

      expect(warehousesCall).toBeDefined();
    });

    it('list_vendors requests vendor fields only', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({
          result: { status: 'success' },
          meta: { name: 'variants', total: 0, count: 0, limit: 1000 },
          variants: [],
        })
      );

      const sessionId = await initializeSession();
      await callTool(sessionId, 'list_vendors', {});

      // Check the fetch was called with correct parameters
      const calls = fetchMocker.mock.calls;
      const variantsCall = calls.find((call) =>
        String(call[0]).includes('/api/v1/variants')
      );

      expect(variantsCall).toBeDefined();
      const url = new URL(String(variantsCall![0]));
      expect(url.searchParams.get('fields')).toBe('vendor_id,vendor_name,vendors');
      expect(url.searchParams.get('limit')).toBe('1000');
    });
  });
});
