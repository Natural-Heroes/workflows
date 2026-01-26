/**
 * Integration tests for MCP session protocol (INFRA-04)
 *
 * Tests that MCP clients can establish and maintain sessions correctly.
 * Uses supertest to test the Express app directly without starting a server.
 *
 * Note: The MCP SDK's StreamableHTTPServerTransport handles sessions asynchronously.
 * Session IDs are populated in the transports map via the onsessioninitialized callback
 * after the initialize request completes.
 */

// Set fake environment variables before importing app
process.env.INVENTORY_PLANNER_API_KEY = 'test-key';
process.env.INVENTORY_PLANNER_ACCOUNT_ID = 'test-account';

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, transports } from '../app.js';

/**
 * Required Accept header for MCP protocol.
 * The SDK requires clients to accept both application/json and text/event-stream.
 */
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
 * The session ID is obtained from the transports map after initialization.
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

  // Wait a tick for async session initialization to complete
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Get the newly created session ID from the transports map
  const sessionIds = Array.from(transports.keys());
  const newSessionId = sessionIds.find(
    (id) => !sessionIds.slice(0, sizeBefore).includes(id)
  );

  if (!newSessionId && sessionIds.length > 0) {
    // If we can't find a "new" one, just return the last one
    return sessionIds[sessionIds.length - 1];
  }

  return newSessionId || sessionIds[0];
}

describe('MCP Session Protocol', () => {
  beforeEach(() => {
    // Reset sessions between tests
    transports.clear();
  });

  describe('Session initialization', () => {
    it('POST /mcp with initialize request returns 200', async () => {
      const response = await request(app)
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

      expect(response.status).toBe(200);
    });

    it('session is created and stored in transports map', async () => {
      expect(transports.size).toBe(0);

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

      expect(transports.size).toBe(1);
      const sessionId = Array.from(transports.keys())[0];
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('response body contains protocolVersion and serverInfo', async () => {
      const response = await request(app)
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

      expect(response.status).toBe(200);

      // Parse SSE response format
      const data = parseSSEResponse(response.text);
      expect(data).toBeDefined();
      expect(data!.result).toBeDefined();

      const result = data!.result as Record<string, unknown>;
      expect(result.protocolVersion).toBeDefined();
      expect(result.serverInfo).toBeDefined();
      expect((result.serverInfo as Record<string, unknown>).name).toBe(
        'inventory-planner-mcp'
      );
    });
  });

  describe('Session rejection', () => {
    it('POST /mcp without session ID for non-initialize request returns 400', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        });

      expect(response.status).toBe(400);
    });

    it('error message mentions "Missing mcp-session-id header"', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        });

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('mcp-session-id');
    });

    it('POST /mcp with invalid session ID returns 400', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', 'invalid-session-id-12345')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        });

      expect(response.status).toBe(400);
    });

    it('error message mentions "Invalid session ID"', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', 'invalid-session-id-12345')
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        });

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid session ID');
    });
  });

  describe('Session maintenance', () => {
    it('can use session ID for tools/list after initialization', async () => {
      const sessionId = await initializeSession();
      expect(sessionId).toBeDefined();

      // Send initialized notification (required by MCP protocol)
      await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        });

      // Then, list tools using the session
      const toolsResponse = await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 2,
        });

      expect(toolsResponse.status).toBe(200);

      // Parse SSE response
      const data = parseSSEResponse(toolsResponse.text);
      expect(data).toBeDefined();
      expect(data!.result).toBeDefined();

      const result = data!.result as Record<string, unknown>;
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('tools/list returns array of available tools', async () => {
      const sessionId = await initializeSession();

      // Send initialized notification
      await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        });

      // List tools
      const toolsResponse = await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 2,
        });

      // Parse SSE response
      const data = parseSSEResponse(toolsResponse.text);
      const result = data!.result as Record<string, unknown>;
      const tools = result.tools as Array<{ name: string }>;

      expect(tools.length).toBeGreaterThan(0);

      // Check that ping tool exists
      const pingTool = tools.find((t) => t.name === 'ip_ping');
      expect(pingTool).toBeDefined();
    });

    it('multiple requests with same session ID work', async () => {
      const sessionId = await initializeSession();

      // Send initialized notification
      await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        });

      // Make multiple requests with the same session
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/mcp')
          .set('Accept', MCP_ACCEPT_HEADER)
          .set('mcp-session-id', sessionId)
          .send({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: i + 2,
          });

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Tool invocation', () => {
    it('can call ping tool and get "pong" response', async () => {
      const sessionId = await initializeSession();

      // Send initialized notification
      await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        });

      // Call ping tool
      const pingResponse = await request(app)
        .post('/mcp')
        .set('Accept', MCP_ACCEPT_HEADER)
        .set('mcp-session-id', sessionId)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'ip_ping',
            arguments: {},
          },
          id: 2,
        });

      expect(pingResponse.status).toBe(200);

      // Parse SSE response
      const data = parseSSEResponse(pingResponse.text);
      expect(data).toBeDefined();

      const result = data!.result as Record<string, unknown>;
      expect(result.content).toBeDefined();

      const content = result.content as Array<{ text: string }>;
      expect(content[0].text).toBe('pong');
    });
  });

  describe('Health endpoint', () => {
    it('GET /health returns 200', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
    });

    it('response includes status: "healthy"', async () => {
      const response = await request(app).get('/health');

      expect(response.body.status).toBe('healthy');
    });

    it('response includes sessions count', async () => {
      const response = await request(app).get('/health');

      expect(typeof response.body.sessions).toBe('number');
      expect(response.body.sessions).toBe(0); // No active sessions initially
    });

    it('sessions count reflects active sessions', async () => {
      // Initialize a session
      await initializeSession();

      // Check health - should show 1 session
      const response = await request(app).get('/health');

      expect(response.body.sessions).toBe(1);
    });
  });
});
