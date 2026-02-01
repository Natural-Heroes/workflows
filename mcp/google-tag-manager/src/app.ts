/**
 * GTM MCP Application
 *
 * Express app with:
 * - MCP SDK OAuth 2.0 integration (works with Claude Desktop's Connect button)
 * - Proxied Google OAuth for GTM API access
 * - StreamableHTTPServerTransport for MCP communication
 */

import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { logger } from './lib/logger.js';
import { getEnv } from './lib/env.js';
import { createMcpServer } from './mcp/index.js';
import { setTokens, hasValidTokens, getTokens } from './oauth/index.js';

const app = express();
const env = getEnv();

// Middleware
app.use(express.json());

// Session store: Map<sessionId, transport>
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

// Derive base URL from callback URL
const baseUrl = new URL(env.GOOGLE_CALLBACK_URL.replace('/callback', ''));

// Google OAuth scopes for GTM
const GTM_SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.publish',
];

/**
 * Set up MCP OAuth with Google as the upstream provider.
 * When Claude Desktop clicks "Connect", this handles the OAuth flow.
 */
const oauthProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revocationUrl: 'https://oauth2.googleapis.com/revoke',
  },

  /**
   * Verify access tokens from Claude Desktop.
   * Called on each MCP request to validate the token.
   * We store the token globally for GTM tools to use.
   */
  async verifyAccessToken(token: string) {
    logger.debug('Verifying access token');

    // Store the token globally for GTM tools to use
    // The token is the Google access token from the OAuth flow
    setTokens('global', {
      access_token: token,
      token_type: 'Bearer',
    });

    return {
      token,
      clientId: env.GOOGLE_CLIENT_ID,
      scopes: GTM_SCOPES,
    };
  },

  /**
   * Return client configuration for OAuth.
   * Claude Desktop uses this to know how to authenticate.
   */
  async getClient(clientId: string) {
    // Accept any client ID for dynamic registration
    // The actual Google OAuth uses our configured credentials
    return {
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uris: [env.GOOGLE_CALLBACK_URL],
      grant_types: ['authorization_code', 'refresh_token'],
    };
  },
});

// Skip PKCE validation since Google handles it
oauthProvider.skipLocalPkceValidation = true;

// Mount the MCP OAuth router
// This adds /.well-known/oauth-authorization-server, /authorize, /token, etc.
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: baseUrl, // We are the issuer (proxying to Google)
    baseUrl,
    serviceDocumentationUrl: new URL('https://developers.google.com/tag-platform/tag-manager'),
    scopesSupported: GTM_SCOPES,
  })
);

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    version: '0.1.0',
    sessions: transports.size,
    authenticated: hasValidTokens(),
  });
});

/**
 * Home page - shows auth status and connection info
 */
app.get('/', (_req: Request, res: Response) => {
  const authenticated = hasValidTokens();

  res.send(
    '<html><head><title>GTM MCP Server</title></head><body>' +
      '<h1>Google Tag Manager MCP Server</h1>' +
      '<p>This server provides MCP access to Google Tag Manager API.</p>' +
      (authenticated
        ? '<p style="color: green;">&#10004; Authenticated! MCP tools are ready to use.</p>'
        : '<p style="color: orange;">&#9888; Not authenticated. Connect via Claude Desktop to authenticate.</p>') +
      '<h2>Connection</h2>' +
      '<p>Add this URL to Claude Desktop as a remote MCP server:</p>' +
      '<pre>' + baseUrl.toString() + 'mcp</pre>' +
      '<p>Click "Connect" in Claude Desktop to authenticate with Google.</p>' +
      '<h2>Endpoints</h2>' +
      '<ul>' +
      '<li><code>/mcp</code> - MCP endpoint</li>' +
      '<li><code>/.well-known/oauth-authorization-server</code> - OAuth discovery</li>' +
      '<li><code>/health</code> - Health check</li>' +
      '</ul>' +
      '</body></html>'
  );
});

/**
 * Legacy /auth endpoint - redirect to OAuth discovery
 */
app.get('/auth', (_req: Request, res: Response) => {
  res.send(
    '<html><head><title>Authentication</title></head><body>' +
      '<h1>Authentication via Claude Desktop</h1>' +
      '<p>This server uses MCP OAuth integration.</p>' +
      '<p>To authenticate:</p>' +
      '<ol>' +
      '<li>Add this MCP server to Claude Desktop</li>' +
      '<li>Click the "Connect" button</li>' +
      '<li>Complete the Google OAuth flow</li>' +
      '</ol>' +
      '<p>MCP Server URL: <code>' + baseUrl.toString() + 'mcp</code></p>' +
      '</body></html>'
  );
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
