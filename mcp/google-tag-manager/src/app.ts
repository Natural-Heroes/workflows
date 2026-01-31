/**
 * GTM MCP Application
 * 
 * Express app with:
 * - OAuth 2.0 authentication flow
 * - StreamableHTTPServerTransport for MCP communication
 * - Session-based architecture with in-memory session store
 */

import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './lib/logger.js';
import { createMcpServer } from './mcp/index.js';
import { setCurrentSession } from './mcp/tools.js';
import { getAuthUrl, exchangeCodeForTokens, setTokens, hasValidTokens } from './oauth/index.js';

const app = express();

// Middleware
app.use(express.json());

// Session store: Map<sessionId, transport>
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

// Pending OAuth states: Map<state, {sessionId, redirectUri}>
const pendingOAuthStates: Map<string, { sessionId: string; redirectUri: string }> = new Map();

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
 * Home page - shows auth status and links
 */
app.get('/', (req: Request, res: Response) => {
  const sessionId = req.query.session as string | undefined;
  const authenticated = sessionId ? hasValidTokens(sessionId) : false;
  
  res.send('<html><head><title>GTM MCP Server</title></head><body>' +
    '<h1>Google Tag Manager MCP Server</h1>' +
    '<p>This server provides MCP access to Google Tag Manager API.</p>' +
    (authenticated 
      ? '<p style="color: green;">Authenticated! You can now use MCP tools.</p>'
      : '<p><a href="/auth">Click here to authenticate with Google</a></p>') +
    '<h2>Endpoints</h2>' +
    '<ul>' +
    '<li><code>/mcp</code> - MCP endpoint (POST/GET/DELETE)</li>' +
    '<li><code>/auth</code> - Start OAuth flow</li>' +
    '<li><code>/callback</code> - OAuth callback</li>' +
    '<li><code>/health</code> - Health check</li>' +
    '</ul>' +
    '</body></html>');
});

/**
 * OAuth: Start authentication flow
 */
app.get('/auth', (req: Request, res: Response) => {
  const sessionId = req.query.session as string || randomUUID();
  const redirectUri = req.query.redirect as string || '/';
  
  // Generate a state parameter for security
  const state = randomUUID();
  pendingOAuthStates.set(state, { sessionId, redirectUri });
  
  // Clean up old states after 10 minutes
  setTimeout(() => pendingOAuthStates.delete(state), 10 * 60 * 1000);
  
  const authUrl = getAuthUrl(state);
  logger.info('Starting OAuth flow', { sessionId, state });
  
  res.redirect(authUrl);
});

/**
 * OAuth: Callback from Google
 */
app.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  
  if (error) {
    logger.error('OAuth error', { error });
    res.status(400).send('<html><body><h1>Authentication Failed</h1><p>' + error + '</p></body></html>');
    return;
  }
  
  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    res.status(400).send('<html><body><h1>Invalid Request</h1><p>Missing code or state</p></body></html>');
    return;
  }
  
  const pendingState = pendingOAuthStates.get(state);
  if (!pendingState) {
    res.status(400).send('<html><body><h1>Invalid State</h1><p>OAuth state expired or invalid</p></body></html>');
    return;
  }
  
  pendingOAuthStates.delete(state);
  
  try {
    const tokens = await exchangeCodeForTokens(code);
    setTokens(pendingState.sessionId, tokens);
    
    logger.info('OAuth completed successfully', { sessionId: pendingState.sessionId });
    
    res.send('<html><head><title>Success</title></head><body>' +
      '<h1>Authentication Successful!</h1>' +
      '<p>You can now close this window and use the GTM MCP tools.</p>' +
      '<p>Session ID: <code>' + pendingState.sessionId + '</code></p>' +
      '<p><a href="/?session=' + pendingState.sessionId + '">Back to home</a></p>' +
      '</body></html>');
  } catch (err) {
    logger.error('Failed to exchange code for tokens', { 
      error: err instanceof Error ? err.message : String(err) 
    });
    res.status(500).send('<html><body><h1>Authentication Failed</h1><p>Failed to exchange code for tokens</p></body></html>');
  }
});

/**
 * MCP POST endpoint - handles requests and initializes new sessions
 */
app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  logger.debug('Received MCP POST request', { sessionId: sessionId || 'none' });

  // Set the current session for tools to use
  setCurrentSession(sessionId || null);

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
      logger.warn('Invalid session ID provided', { sessionId });
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid session ID. Session may have expired.' },
        id: null,
      });
    } else {
      logger.warn('Missing session ID for non-initialize request');
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Missing mcp-session-id header. Initialize session first.' },
        id: null,
      });
    }
  } catch (error) {
    logger.error('Error handling MCP request', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: null,
    });
  } finally {
    setCurrentSession(null);
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
      error: { code: -32000, message: 'Invalid or missing session ID' },
      id: null,
    });
    return;
  }

  setCurrentSession(sessionId);
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
      error: { code: -32000, message: 'Invalid or missing session ID' },
      id: null,
    });
    return;
  }

  logger.info('Terminating session via DELETE', { sessionId });
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
  transports.delete(sessionId);
});

export { app, transports };
