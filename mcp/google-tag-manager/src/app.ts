/**
 * GTM MCP Application
 *
 * Express app with:
 * - MCP SDK OAuth 2.0 integration (works with Claude's Connect button)
 * - Proxied Google OAuth for GTM API access
 * - StreamableHTTPServerTransport for MCP communication
 */

import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { logger } from './lib/logger.js';
import { getEnv } from './lib/env.js';
import { createMcpServer } from './mcp/index.js';
import { setTokens, hasValidTokens } from './oauth/index.js';

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

// Claude's OAuth callback URLs (must be allowed for the OAuth flow to work)
const CLAUDE_CALLBACK_URLS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

// Store for dynamically registered clients
const registeredClients = new Map<string, {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  grant_types: string[];
}>();

/**
 * Set up MCP OAuth with Google as the upstream provider.
 * When Claude clicks "Connect", this handles the OAuth flow.
 */
const oauthProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revocationUrl: 'https://oauth2.googleapis.com/revoke',
  },

  /**
   * Verify access tokens from Claude.
   * Called on each MCP request to validate the token.
   * The token is the Google access token from the OAuth flow.
   */
  async verifyAccessToken(token: string) {
    logger.debug('Verifying access token');

    // Store the Google access token for GTM tools to use
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
   *
   * IMPORTANT: Always return Google OAuth credentials for upstream requests.
   * The clientId parameter is the MCP client's ID (e.g., from Claude's dynamic registration),
   * but we need to use our pre-registered Google OAuth credentials when talking to Google.
   */
  async getClient(clientId: string) {
    logger.debug('Getting client configuration', { clientId });

    // Check if this is a dynamically registered client (from Claude)
    if (registeredClients.has(clientId)) {
      const client = registeredClients.get(clientId)!;
      logger.debug('Found dynamically registered client, using Google credentials for upstream', { clientId });

      // Return Google OAuth credentials for upstream, but keep the registered redirect_uris
      // so Claude's callback URL is accepted
      return {
        client_id: env.GOOGLE_CLIENT_ID,           // Use Google client ID for upstream OAuth
        client_secret: env.GOOGLE_CLIENT_SECRET,   // Use Google client secret for upstream OAuth
        redirect_uris: client.redirect_uris,       // Use Claude's registered redirect URIs
        grant_types: client.grant_types,
      };
    }

    // Default client configuration - also uses Google credentials
    logger.debug('Using default Google client configuration');
    return {
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uris: [...CLAUDE_CALLBACK_URLS, env.GOOGLE_CALLBACK_URL],
      grant_types: ['authorization_code', 'refresh_token'],
    };
  },
});

// Skip local PKCE validation since Google handles it
oauthProvider.skipLocalPkceValidation = true;

// Override clientsStore to add dynamic client registration support
// This allows Claude Desktop to register as a client
const originalGetClient = oauthProvider.clientsStore.getClient.bind(oauthProvider.clientsStore);
Object.defineProperty(oauthProvider, 'clientsStore', {
  get() {
    return {
      getClient: originalGetClient,
      registerClient: async (clientInfo: {
        redirect_uris: string[];
        grant_types?: string[];
        client_name?: string;
        client_uri?: string;
        logo_uri?: string;
        scope?: string;
      }) => {
        const clientId = `claude-${randomUUID()}`;
        const clientSecret = randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const client = {
          client_id: clientId,
          client_secret: clientSecret,
          client_id_issued_at: now,
          client_secret_expires_at: 0, // Never expires
          redirect_uris: clientInfo.redirect_uris,
          grant_types: clientInfo.grant_types || ['authorization_code', 'refresh_token'],
          client_name: clientInfo.client_name,
          client_uri: clientInfo.client_uri,
          logo_uri: clientInfo.logo_uri,
          scope: clientInfo.scope,
        };

        registeredClients.set(clientId, {
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uris: clientInfo.redirect_uris,
          grant_types: clientInfo.grant_types || ['authorization_code', 'refresh_token'],
        });

        logger.info('Registered new OAuth client', { clientId, clientName: clientInfo.client_name });
        return client;
      },
    };
  },
});

const authMiddleware = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: GTM_SCOPES,
  resourceMetadataUrl: baseUrl.toString() + '.well-known/oauth-authorization-server',
});

// Mount the MCP OAuth router
// This adds /.well-known/oauth-authorization-server, /authorize, /token, etc.
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: baseUrl,
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
        : '<p style="color: orange;">&#9888; Not authenticated. Connect via Claude to authenticate.</p>') +
      '<h2>Connection</h2>' +
      '<p>Add this URL to Claude as a remote MCP server:</p>' +
      '<pre>' + baseUrl.toString() + 'mcp</pre>' +
      '<p>Click "Connect" in Claude to authenticate with Google.</p>' +
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
 * Legacy /auth endpoint - shows instructions
 */
app.get('/auth', (_req: Request, res: Response) => {
  res.send(
    '<html><head><title>Authentication</title></head><body>' +
      '<h1>Authentication via Claude</h1>' +
      '<p>This server uses MCP OAuth integration.</p>' +
      '<p>To authenticate:</p>' +
      '<ol>' +
      '<li>Add this MCP server to Claude (Settings → Connectors)</li>' +
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
app.post('/mcp', authMiddleware, async (req: Request, res: Response) => {
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
app.get('/mcp', authMiddleware, async (req: Request, res: Response) => {
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
app.delete('/mcp', authMiddleware, async (req: Request, res: Response) => {
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
