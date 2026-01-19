/**
 * MRPeasy MCP Server
 *
 * HTTP server with StreamableHTTPServerTransport for MCP communication.
 * Implements session-based architecture with in-memory session store.
 */

import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './lib/logger.js';
import { validateEnv, getEnv } from './lib/env.js';
import { createMcpServer } from './mcp/index.js';

// Validate environment variables at startup (fail fast)
try {
  validateEnv();
} catch (error) {
  logger.error('Failed to start server: environment validation failed');
  process.exit(1);
}

const env = getEnv();
const app = express();

// Middleware
app.use(express.json());

// Session store: Map<sessionId, transport>
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    version: '0.1.0',
    sessions: transports.size,
  });
});

/**
 * MCP POST endpoint - handles requests and initializes new sessions
 */
app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  logger.debug('Received MCP POST request', { sessionId: sessionId || 'none' });

  try {
    if (sessionId && transports.has(sessionId)) {
      // Existing session - reuse transport
      const transport = transports.get(sessionId)!;
      logger.debug('Reusing existing session', { sessionId });
      await transport.handleRequest(req, res, req.body);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session - create transport and server
      logger.info('Initializing new MCP session');

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
          logger.info('Session initialized', { sessionId: id });
        },
      });

      // Handle session close
      transport.onclose = () => {
        // Find and remove this transport from the map
        for (const [id, t] of transports.entries()) {
          if (t === transport) {
            transports.delete(id);
            logger.info('Session closed', { sessionId: id });
            break;
          }
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else if (sessionId && !transports.has(sessionId)) {
      // Invalid session ID
      logger.warn('Invalid session ID provided', { sessionId });
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid session ID. Session may have expired.',
        },
        id: null,
      });
    } else {
      // Missing session ID for non-initialize request
      logger.warn('Missing session ID for non-initialize request');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Missing mcp-session-id header. Initialize session first.',
        },
        id: null,
      });
    }
  } catch (error) {
    logger.error('Error handling MCP request', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error',
      },
      id: null,
    });
  }
});

/**
 * MCP GET endpoint - Server-Sent Events for server-to-client notifications
 */
app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports.has(sessionId)) {
    logger.warn('SSE request with invalid session', { sessionId: sessionId || 'none' });
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Invalid or missing session ID',
      },
      id: null,
    });
    return;
  }

  logger.debug('SSE connection established', { sessionId });
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

/**
 * MCP DELETE endpoint - explicit session termination
 */
app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports.has(sessionId)) {
    logger.warn('DELETE request with invalid session', { sessionId: sessionId || 'none' });
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Invalid or missing session ID',
      },
      id: null,
    });
    return;
  }

  logger.info('Terminating session via DELETE', { sessionId });
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
  transports.delete(sessionId);
});

// Start server
app.listen(env.PORT, () => {
  logger.info('MRPeasy MCP server started', {
    port: env.PORT,
    env: env.NODE_ENV,
  });
});
