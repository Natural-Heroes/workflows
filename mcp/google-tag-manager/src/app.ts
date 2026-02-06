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
import { setTokens, hasValidTokens, exchangeCodeForTokens } from './oauth/index.js';

const app = express();
const env = getEnv();

// Token verification cache to avoid hitting Google's tokeninfo endpoint on every request.
// Without caching, concurrent requests during MCP session setup can get rate-limited by Google,
// causing intermittent "invalid_token" / "Invalid Value" 400 errors.
const tokenVerificationCache = new Map<string, { result: { token: string; clientId: string; scopes: string[]; expiresAt?: number }; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 60_000; // Cache verification result for 60 seconds

// Trust proxy - required when running behind reverse proxy (nginx, cloud load balancer)
// This allows express-rate-limit to correctly identify clients via X-Forwarded-For
app.set('trust proxy', 1);

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  const hasAuth = !!req.headers.authorization;
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    hasAuth,
    sessionId: req.headers['mcp-session-id'] || 'none'
  });
  next();
});

// Session store: Map<sessionId, transport>
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

// Derive base URL from callback URL
const baseUrl = new URL(env.GOOGLE_CALLBACK_URL.replace('/callback', ''));

// Google OAuth scopes for GTM (must match client.ts)
const GTM_SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish',
];

// Allowed redirect URI patterns for dynamic client registration
const ALLOWED_REDIRECT_PATTERNS = [
  /^https:\/\/claude\.ai\//,
  /^https:\/\/claude\.com\//,
  /^http:\/\/localhost(:\d+)?\//,
  /^http:\/\/127\.0\.0\.1(:\d+)?\//,
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
  allowDynamicLocalhost?: boolean;
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
    logger.info('Verifying access token with Google', { tokenPrefix: token.substring(0, 10) + '...' });

    // Check cache first to avoid rate-limiting from concurrent Google tokeninfo calls
    const cached = tokenVerificationCache.get(token);
    if (cached && Date.now() < cached.expiresAt) {
      logger.info('Token verified from cache', { expiresAt: cached.result.expiresAt, scopeCount: cached.result.scopes.length });
      // Still update the token store so tools have access
      setTokens('global', {
        access_token: token,
        token_type: 'Bearer',
        expiry_date: cached.result.expiresAt ? cached.result.expiresAt * 1000 : undefined,
        scope: cached.result.scopes.join(' '),
      });
      return cached.result;
    }

    try {
      // Validate the token with Google's tokeninfo endpoint
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Token validation failed', { status: response.status, error: errorText });
        throw new Error('Invalid or expired token');
      }

      const tokenInfo = await response.json();
      logger.info('Token info received', {
        aud: tokenInfo.aud,
        azp: tokenInfo.azp,
        scope: tokenInfo.scope,
        expiresIn: tokenInfo.expires_in
      });

      // Verify the token was issued for our client
      if (tokenInfo.aud !== env.GOOGLE_CLIENT_ID && tokenInfo.azp !== env.GOOGLE_CLIENT_ID) {
        logger.error('Token client ID mismatch', {
          expected: env.GOOGLE_CLIENT_ID,
          got: tokenInfo.aud || tokenInfo.azp
        });
        throw new Error('Token was not issued for this application');
      }

      // Store the Google access token for GTM tools to use
      // Include expiry calculated from expires_in
      const expiryDate = tokenInfo.expires_in
        ? Date.now() + (parseInt(tokenInfo.expires_in, 10) * 1000)
        : undefined;

      setTokens('global', {
        access_token: token,
        token_type: 'Bearer',
        expiry_date: expiryDate,
        scope: tokenInfo.scope,
      });

      const scopes = tokenInfo.scope ? tokenInfo.scope.split(' ') : GTM_SCOPES;
      const expiresAt = expiryDate ? Math.floor(expiryDate / 1000) : undefined;

      logger.info('Token verified successfully', {
        expiresIn: tokenInfo.expires_in,
        expiresAt,
        scopeCount: scopes.length
      });

      const result = {
        token,
        clientId: env.GOOGLE_CLIENT_ID,
        scopes,
        expiresAt, // Required by MCP SDK's requireBearerAuth
      };

      // Cache the result - use the shorter of TOKEN_CACHE_TTL or token expiry
      const cacheTtl = expiryDate
        ? Math.min(TOKEN_CACHE_TTL_MS, expiryDate - Date.now())
        : TOKEN_CACHE_TTL_MS;
      if (cacheTtl > 0) {
        tokenVerificationCache.set(token, { result, expiresAt: Date.now() + cacheTtl });
      }

      return result;
    } catch (error) {
      logger.error('Token verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  /**
   * Return client configuration for OAuth.
   *
   * For dynamically registered clients (Claude), we return Claude's registered secret
   * so the token endpoint validation passes. The actual Google credentials are
   * substituted in the overridden exchangeAuthorizationCode method below.
   */
  async getClient(clientId: string) {
    logger.debug('Getting client configuration', { clientId });

    // Check if this is a dynamically registered client (from Claude)
    if (registeredClients.has(clientId)) {
      const client = registeredClients.get(clientId)!;
      logger.debug('Found dynamically registered client', { clientId, allowDynamicLocalhost: client.allowDynamicLocalhost });

      // Return Claude's registered secret so validation passes
      // The upstream request will use Google credentials (substituted in exchangeAuthorizationCode)
      // Note: localhost redirect URIs are dynamically added by the /authorize interceptor
      return {
        client_id: env.GOOGLE_CLIENT_ID,           // Use Google client ID for upstream OAuth
        client_secret: client.client_secret,       // Use Claude's secret for validation
        redirect_uris: client.redirect_uris,       // Includes dynamically added localhost URIs
        grant_types: client.grant_types,
      };
    }

    // Default client configuration - uses Google credentials
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

// Override exchangeAuthorizationCode to always use Google credentials for upstream
const originalExchangeAuthorizationCode = oauthProvider.exchangeAuthorizationCode.bind(oauthProvider);
oauthProvider.exchangeAuthorizationCode = async (client, authorizationCode, codeVerifier, redirectUri, resource) => {
  logger.debug('Exchanging authorization code with Google credentials');
  // Substitute Google credentials for the upstream request
  const googleClient = {
    ...client,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  };
  return originalExchangeAuthorizationCode(googleClient, authorizationCode, codeVerifier, redirectUri, resource);
};

// Override exchangeRefreshToken to always use Google credentials for upstream
const originalExchangeRefreshToken = oauthProvider.exchangeRefreshToken.bind(oauthProvider);
oauthProvider.exchangeRefreshToken = async (client, refreshToken, scopes, resource) => {
  logger.debug('Refreshing token with Google credentials');
  // Substitute Google credentials for the upstream request
  const googleClient = {
    ...client,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  };
  return originalExchangeRefreshToken(googleClient, refreshToken, scopes, resource);
};

/**
 * Validate that a redirect URI matches allowed patterns.
 */
function isAllowedRedirectUri(uri: string): boolean {
  return ALLOWED_REDIRECT_PATTERNS.some(pattern => pattern.test(uri));
}

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
        // Validate redirect URIs against allowed patterns
        const invalidUris = clientInfo.redirect_uris.filter(uri => !isAllowedRedirectUri(uri));
        if (invalidUris.length > 0) {
          logger.warn('Client registration rejected: invalid redirect URIs', { invalidUris });
          throw new Error(`Invalid redirect_uri(s): ${invalidUris.join(', ')}. Only Claude and localhost URLs are allowed.`);
        }

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

        // For localhost redirect URIs, store a flexible set to handle dynamic ports
        // Claude Desktop uses dynamic ports, so we need to allow any localhost port
        const expandedRedirectUris = [...clientInfo.redirect_uris];
        const hasLocalhostUri = clientInfo.redirect_uris.some(uri =>
          uri.startsWith('http://localhost') || uri.startsWith('http://127.0.0.1')
        );
        if (hasLocalhostUri) {
          // Add common localhost patterns to handle port changes
          logger.info('Expanding localhost redirect URIs for desktop client');
        }

        registeredClients.set(clientId, {
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uris: expandedRedirectUris,
          grant_types: clientInfo.grant_types || ['authorization_code', 'refresh_token'],
          // Store flag to allow dynamic localhost matching
          allowDynamicLocalhost: hasLocalhostUri,
        });

        logger.info('Registered new OAuth client', { clientId, clientName: clientInfo.client_name });
        return client;
      },
    };
  },
});

const bearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  // Don't require specific scopes - let the tools handle scope errors gracefully
  // The token validation already verifies it was issued for our client
  requiredScopes: [],
  resourceMetadataUrl: new URL('.well-known/oauth-authorization-server', baseUrl).toString(),
});

// Wrap auth middleware to debug
const authMiddleware: typeof bearerAuth = (req, res, next) => {
  logger.info('Auth middleware starting', { path: req.path });

  // Intercept res.json and res.end to capture response body
  const originalJson = res.json.bind(res);
  const originalEnd = res.end.bind(res);
  let responseSent = false;

  res.json = ((body: unknown) => {
    responseSent = true;
    logger.info('Auth middleware sent JSON response', {
      path: req.path,
      statusCode: res.statusCode,
      body: JSON.stringify(body).substring(0, 500),
    });
    return originalJson(body);
  }) as typeof res.json;

  res.end = ((...args: Parameters<typeof originalEnd>) => {
    if (!responseSent) {
      responseSent = true;
      logger.info('Auth middleware sent response', {
        path: req.path,
        statusCode: res.statusCode,
        body: args[0] ? String(args[0]).substring(0, 500) : 'empty',
      });
    }
    return originalEnd(...args);
  }) as typeof res.end;

  bearerAuth(req, res, (err?: unknown) => {
    if (err) {
      logger.error('Auth middleware error', { error: err });
    } else if (!responseSent) {
      logger.info('Auth middleware passed, calling next');
    }
    next(err);
  });
};

// Intercept /authorize to handle dynamic localhost ports for Claude Desktop
// Also handles case where client was registered before server restart (mcp-remote persists client_id)
app.use('/authorize', (req, _res, next) => {
  const clientId = req.query.client_id as string | undefined;
  const redirectUri = req.query.redirect_uri as string | undefined;

  if (clientId && redirectUri && isAllowedRedirectUri(redirectUri)) {
    // Check if client exists
    if (registeredClients.has(clientId)) {
      const client = registeredClients.get(clientId)!;
      if (client.allowDynamicLocalhost && !client.redirect_uris.includes(redirectUri)) {
        client.redirect_uris.push(redirectUri);
        logger.info('Dynamically added localhost redirect URI', { clientId, redirectUri });
      }
    } else if (clientId.startsWith('claude-')) {
      // Client was registered before server restart - recreate registration
      // mcp-remote persists client_id but server loses registeredClients on restart
      const isLocalhostUri = redirectUri.startsWith('http://localhost') || redirectUri.startsWith('http://127.0.0.1');
      logger.info('Recreating registration for persisted Claude client', { clientId, redirectUri });
      registeredClients.set(clientId, {
        client_id: clientId,
        client_secret: undefined, // Will be validated via token exchange
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        allowDynamicLocalhost: isLocalhostUri,
      });
    }
  }
  next();
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
 * OAuth callback endpoint - handles Google's redirect after authorization
 * This is used for direct browser testing and legacy OAuth flows.
 */
app.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    logger.error('OAuth callback received error', { error });
    res.status(400).send(
      '<html><head><title>Authentication Error</title></head><body>' +
        '<h1>Authentication Failed</h1>' +
        '<p>Error: ' + error + '</p>' +
        '<p><a href="/">Return to home</a></p>' +
        '</body></html>'
    );
    return;
  }

  if (!code) {
    logger.warn('OAuth callback missing authorization code');
    res.status(400).send(
      '<html><head><title>Missing Code</title></head><body>' +
        '<h1>Missing Authorization Code</h1>' +
        '<p>No authorization code was provided.</p>' +
        '<p><a href="/">Return to home</a></p>' +
        '</body></html>'
    );
    return;
  }

  try {
    logger.info('Exchanging authorization code for tokens');
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens globally for MCP tools to use
    setTokens('global', tokens);

    logger.info('Successfully authenticated via OAuth callback');

    res.send(
      '<html><head><title>Authentication Successful</title></head><body>' +
        '<h1>Authentication Successful!</h1>' +
        '<p style="color: green;">&#10004; You are now authenticated with Google Tag Manager.</p>' +
        '<p>You can close this window and use the MCP tools.</p>' +
        '<p><a href="/">Return to home</a></p>' +
        '</body></html>'
    );
  } catch (err) {
    logger.error('Failed to exchange authorization code', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).send(
      '<html><head><title>Authentication Error</title></head><body>' +
        '<h1>Authentication Failed</h1>' +
        '<p>Failed to exchange authorization code for tokens.</p>' +
        '<p>Error: ' + (err instanceof Error ? err.message : String(err)) + '</p>' +
        '<p><a href="/">Return to home</a></p>' +
        '</body></html>'
    );
  }
});

/**
 * MCP POST endpoint - handles requests and initializes new sessions
 */
app.post('/mcp', authMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const method = req.body?.method;
  const isInit = isInitializeRequest(req.body);

  logger.info('Received MCP POST request', {
    sessionId: sessionId || 'none',
    method: method || 'unknown',
    isInitializeRequest: isInit,
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });

  try {
    if (sessionId && transports.has(sessionId)) {
      // Existing session - reuse transport
      const transport = transports.get(sessionId)!;
      logger.debug('Reusing existing session', { sessionId });
      await transport.handleRequest(req, res, req.body);
    } else if (!sessionId && isInit) {
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
