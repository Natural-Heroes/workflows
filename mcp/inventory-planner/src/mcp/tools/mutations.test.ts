/**
 * Integration tests for mutation MCP tools (VAR-01).
 *
 * Tests the following tools:
 * - update_variant: Update variant planning parameters with preview/confirm modes
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

describe('Mutation Tools', () => {
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
  // update_variant tool (VAR-01)
  // ===========================================================================
  describe('update_variant tool', () => {
    // -------------------------------------------------------------------------
    // Preview mode tests
    // -------------------------------------------------------------------------
    describe('preview mode (confirm=false)', () => {
      it('returns preview object without making API call', async () => {
        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          lead_time: 14,
          confirm: false,
        });

        expect(result).toBeDefined();
        const data = result as Record<string, unknown>;
        expect(data.preview).toBe(true);
        expect(data.message).toContain('preview');
        expect(data.message).toContain('confirm=true');

        // Verify NO fetch was called during preview
        expect(fetchMocker.mock.calls).toHaveLength(0);
      });

      it('shows all proposed updates in preview', async () => {
        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          lead_time: 14,
          review_period: 30,
          safety_stock: 50,
          reorder_point: 100,
          active: false,
          confirm: false,
        });

        expect(result).toBeDefined();
        const data = result as Record<string, unknown>;
        const updates = data.updates as Record<string, unknown>;
        expect(updates.id).toBe('v1');
        expect(updates.lead_time).toBe(14);
        expect(updates.review_period).toBe(30);
        expect(updates.safety_stock).toBe(50);
        expect(updates.reorder_point).toBe(100);
        expect(updates.active).toBe(false);
      });

      it('preview with confirm=false is the default behavior', async () => {
        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          lead_time: 7,
          // confirm not provided, defaults to false
        });

        expect(result).toBeDefined();
        const data = result as Record<string, unknown>;
        expect(data.preview).toBe(true);

        // Verify NO fetch was called
        expect(fetchMocker.mock.calls).toHaveLength(0);
      });
    });

    // -------------------------------------------------------------------------
    // Confirm mode tests
    // -------------------------------------------------------------------------
    describe('confirm mode (confirm=true)', () => {
      it('updates variant and returns success', async () => {
        fetchMocker.mockResponseOnce(
          JSON.stringify({
            result: { status: 'success' },
            variant: {
              id: 'v1',
              sku: 'TEST-SKU-001',
              title: 'Test Product',
              full_title: 'Test Product - Size M',
              lead_time: 14,
              review_period: 30,
              safety_stock: 50,
              reorder_point: 100,
              active: true,
            },
          })
        );

        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          lead_time: 14,
          confirm: true,
        });

        expect(result).toBeDefined();
        const data = result as Record<string, unknown>;
        expect(data.success).toBe(true);
        expect(data.message).toContain('updated successfully');

        const variant = data.variant as Record<string, unknown>;
        expect(variant.id).toBe('v1');
        expect(variant.sku).toBe('TEST-SKU-001');
        expect(variant.leadTime).toBe(14);
      });

      it('can update lead_time', async () => {
        fetchMocker.mockResponseOnce(
          JSON.stringify({
            result: { status: 'success' },
            variant: {
              id: 'v1',
              sku: 'LEAD-TIME-TEST',
              lead_time: 21,
            },
          })
        );

        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          lead_time: 21,
          confirm: true,
        });

        const data = result as Record<string, unknown>;
        const variant = data.variant as Record<string, unknown>;
        expect(variant.leadTime).toBe(21);

        // Verify the PATCH request was made with correct body
        const fetchCall = fetchMocker.mock.calls[0];
        expect(fetchCall[0]).toContain('/variants/v1');
        const requestInit = fetchCall[1] as RequestInit;
        expect(requestInit.method).toBe('PATCH');
        const body = JSON.parse(requestInit.body as string);
        expect(body.lead_time).toBe(21);
      });

      it('can update review_period', async () => {
        fetchMocker.mockResponseOnce(
          JSON.stringify({
            result: { status: 'success' },
            variant: {
              id: 'v1',
              sku: 'REVIEW-PERIOD-TEST',
              review_period: 45,
            },
          })
        );

        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          review_period: 45,
          confirm: true,
        });

        const data = result as Record<string, unknown>;
        const variant = data.variant as Record<string, unknown>;
        expect(variant.reviewPeriod).toBe(45);

        const fetchCall = fetchMocker.mock.calls[0];
        const requestInit = fetchCall[1] as RequestInit;
        const body = JSON.parse(requestInit.body as string);
        expect(body.review_period).toBe(45);
      });

      it('can update safety_stock', async () => {
        fetchMocker.mockResponseOnce(
          JSON.stringify({
            result: { status: 'success' },
            variant: {
              id: 'v1',
              sku: 'SAFETY-STOCK-TEST',
              safety_stock: 75,
            },
          })
        );

        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          safety_stock: 75,
          confirm: true,
        });

        const data = result as Record<string, unknown>;
        const variant = data.variant as Record<string, unknown>;
        expect(variant.safetyStock).toBe(75);

        const fetchCall = fetchMocker.mock.calls[0];
        const requestInit = fetchCall[1] as RequestInit;
        const body = JSON.parse(requestInit.body as string);
        expect(body.safety_stock).toBe(75);
      });

      it('can update reorder_point', async () => {
        fetchMocker.mockResponseOnce(
          JSON.stringify({
            result: { status: 'success' },
            variant: {
              id: 'v1',
              sku: 'REORDER-POINT-TEST',
              reorder_point: 150,
            },
          })
        );

        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          reorder_point: 150,
          confirm: true,
        });

        const data = result as Record<string, unknown>;
        const variant = data.variant as Record<string, unknown>;
        expect(variant.reorderPoint).toBe(150);

        const fetchCall = fetchMocker.mock.calls[0];
        const requestInit = fetchCall[1] as RequestInit;
        const body = JSON.parse(requestInit.body as string);
        expect(body.reorder_point).toBe(150);
      });

      it('can update active status', async () => {
        fetchMocker.mockResponseOnce(
          JSON.stringify({
            result: { status: 'success' },
            variant: {
              id: 'v1',
              sku: 'ACTIVE-STATUS-TEST',
              active: false,
            },
          })
        );

        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          active: false,
          confirm: true,
        });

        const data = result as Record<string, unknown>;
        const variant = data.variant as Record<string, unknown>;
        expect(variant.active).toBe(false);

        const fetchCall = fetchMocker.mock.calls[0];
        const requestInit = fetchCall[1] as RequestInit;
        const body = JSON.parse(requestInit.body as string);
        expect(body.active).toBe(false);
      });

      it('can update multiple fields at once', async () => {
        fetchMocker.mockResponseOnce(
          JSON.stringify({
            result: { status: 'success' },
            variant: {
              id: 'v1',
              sku: 'MULTI-UPDATE-TEST',
              title: 'Multi Update Product',
              full_title: 'Multi Update Product - Full',
              lead_time: 10,
              review_period: 20,
              safety_stock: 30,
              reorder_point: 40,
              active: true,
            },
          })
        );

        const sessionId = await initializeSession();
        const { result } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          lead_time: 10,
          review_period: 20,
          safety_stock: 30,
          reorder_point: 40,
          active: true,
          confirm: true,
        });

        const data = result as Record<string, unknown>;
        expect(data.success).toBe(true);

        const variant = data.variant as Record<string, unknown>;
        expect(variant.leadTime).toBe(10);
        expect(variant.reviewPeriod).toBe(20);
        expect(variant.safetyStock).toBe(30);
        expect(variant.reorderPoint).toBe(40);
        expect(variant.active).toBe(true);

        // Verify all fields sent in PATCH body
        const fetchCall = fetchMocker.mock.calls[0];
        const requestInit = fetchCall[1] as RequestInit;
        const body = JSON.parse(requestInit.body as string);
        expect(body.lead_time).toBe(10);
        expect(body.review_period).toBe(20);
        expect(body.safety_stock).toBe(30);
        expect(body.reorder_point).toBe(40);
        expect(body.active).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // Error handling tests
    // -------------------------------------------------------------------------
    describe('error handling', () => {
      it('handles variant not found (404)', async () => {
        // 404 errors are not retried, so only need one mock
        fetchMocker.mockResponseOnce(
          JSON.stringify({ message: 'Variant not found' }),
          { status: 404 }
        );

        const sessionId = await initializeSession();
        const { result, isError } = await callTool(sessionId, 'update_variant', {
          id: 'nonexistent',
          lead_time: 10,
          confirm: true,
        });

        // Error responses are plain text, not JSON
        expect(isError).toBe(true);
        expect(typeof result).toBe('string');
        expect(result).toContain('not found');
      });

      it('handles unauthorized access (401)', async () => {
        // 401 errors are not retried, so only need one mock
        fetchMocker.mockResponseOnce(
          JSON.stringify({ message: 'Unauthorized' }),
          { status: 401 }
        );

        const sessionId = await initializeSession();
        const { result, isError } = await callTool(sessionId, 'update_variant', {
          id: 'v1',
          lead_time: 10,
          confirm: true,
        });

        // Error responses are plain text, not JSON
        expect(isError).toBe(true);
        expect(typeof result).toBe('string');
        expect(result).toContain('Authentication failed');
      });
    });
  });
});
