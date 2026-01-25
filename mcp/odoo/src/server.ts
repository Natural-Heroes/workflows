/**
 * Odoo MCP Server
 *
 * HTTP server with OAuth 2.1 authentication and StreamableHTTPServerTransport
 * for MCP communication. Implements session-based architecture with per-user
 * isolation via OAuth tokens that resolve to encrypted Odoo API keys.
 */

import express, { Request, Response, Router } from 'express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Server } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { logger } from './lib/logger.js';
import { validateEnv, getEnv } from './lib/env.js';
import { createIpAllowlistMiddleware } from './lib/ip-allowlist.js';
import { createMcpServer } from './mcp/index.js';
import { OdooClientManager } from './services/odoo/client-manager.js';
import { CredentialStore } from './auth/credential-store.js';
import { OdooOAuthProvider } from './auth/provider.js';
import { OAuthStore } from './auth/oauth-store.js';
import { renderLoginPage } from './auth/login-page.js';

// --- Environment validation (fail fast) ---

try {
  validateEnv();
} catch (error) {
  logger.error('Failed to start server: environment validation failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

const env = getEnv();

// --- Auth infrastructure ---

mkdirSync(dirname(env.DB_PATH), { recursive: true });

const credentialStore = new CredentialStore({
  dbPath: env.DB_PATH,
  masterKey: env.ENCRYPTION_KEY,
});

const oauthStore = new OAuthStore(env.DB_PATH);

const oauthProvider = new OdooOAuthProvider(
  credentialStore,
  oauthStore,
  env.ODOO_URL,
  env.ODOO_DATABASE,
  env.BASE_PATH,
);

const mcpServerUrl = new URL(env.MCP_SERVER_URL);
const issuerUrl = new URL(env.BASE_PATH || '/', mcpServerUrl.origin);

// --- Session store ---

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
}

const sessions = new Map<string, SessionEntry>();

// --- Session TTL sweep ---

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 60 * 1000; // 60 seconds

const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      logger.info('Evicting expired session', { sessionId: id });
      session.transport.close();
      sessions.delete(id);
    }
  }
}, SWEEP_INTERVAL_MS);

sweepInterval.unref();

function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

// --- OdooClientManager ---

const clientManager = new OdooClientManager(env.ODOO_URL, env.ODOO_DATABASE);

// --- Express app ---

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Router for all endpoints (mounted on BASE_PATH) ---

const router = Router();

// --- OAuth router (mounts /authorize, /token, /register, /revoke, /.well-known/*) ---

router.use(mcpAuthRouter({
  provider: oauthProvider,
  issuerUrl,
  baseUrl: issuerUrl,
  resourceServerUrl: mcpServerUrl,
  scopesSupported: [],
  resourceName: 'Odoo MCP Server',
}));

// --- Bearer auth middleware ---

const bearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

// --- IP allowlist + OAuth combined middleware ---
// Trusted IPs bypass OAuth, others fall through to bearerAuth
const mcpAuth = createIpAllowlistMiddleware(env.ALLOWED_IPS, bearerAuth);

// --- Health check (no auth) ---

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    version: '0.1.0',
    sessions: sessions.size,
    clients: clientManager.size,
  });
});

// --- Login endpoints ---

router.get('/login', (req: Request, res: Response) => {
  const pendingId = req.query.pending as string;
  if (!pendingId) {
    res.status(400).send('Missing pending authorization');
    return;
  }

  const pending = oauthProvider.getPendingAuth(pendingId);
  if (!pending) {
    res.status(400).send('Invalid or expired authorization request');
    return;
  }

  res.type('html').send(renderLoginPage(pendingId, undefined, env.BASE_PATH));
});

router.post('/login', async (req: Request, res: Response) => {
  const { pending, email, api_key } = req.body;

  if (!pending || !email || !api_key) {
    res.status(400).type('html').send(
      renderLoginPage(pending || '', 'All fields are required.', env.BASE_PATH)
    );
    return;
  }

  const pendingAuth = oauthProvider.getPendingAuth(pending);
  if (!pendingAuth) {
    res.status(400).type('html').send(
      renderLoginPage(pending, 'Authorization request expired. Please try again.', env.BASE_PATH)
    );
    return;
  }

  const userId = await oauthProvider.validateOdooCredentials(email, api_key);
  if (!userId) {
    res.type('html').send(
      renderLoginPage(pending, 'Invalid credentials. Check your email and API key.', env.BASE_PATH)
    );
    return;
  }

  // Store encrypted API key
  credentialStore.addOrUpdateUser(userId, api_key);

  // Complete the authorization flow
  const { redirectUri } = await oauthProvider.completeAuthorization(pending, userId);
  res.redirect(redirectUri);
});

// --- MCP endpoints (OAuth protected) ---

router.post('/mcp', mcpAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  logger.debug('Received MCP POST request', { sessionId: sessionId || 'none' });

  try {
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      touchSession(sessionId);
      await session.transport.handleRequest(req, res, req.body);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      logger.info('Initializing new MCP session');

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server, lastActivity: Date.now() });
          logger.info('Session initialized', { sessionId: id });
        },
      });

      transport.onclose = () => {
        for (const [id, entry] of sessions.entries()) {
          if (entry.transport === transport) {
            sessions.delete(id);
            logger.info('Session closed', { sessionId: id });
            break;
          }
        }
      };

      const server = createMcpServer(clientManager);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else if (sessionId && !sessions.has(sessionId)) {
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
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

router.get('/mcp', mcpAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
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
  const session = sessions.get(sessionId)!;
  touchSession(sessionId);
  await session.transport.handleRequest(req, res);
});

router.delete('/mcp', mcpAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
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
  const session = sessions.get(sessionId)!;
  await session.transport.handleRequest(req, res);
  sessions.delete(sessionId);
});

// --- Root-level health check for Docker (before router mount) ---

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    version: '0.1.0',
    sessions: sessions.size,
  });
});

// --- Mount router on BASE_PATH ---

app.use(env.BASE_PATH || '/', router);

// --- Graceful shutdown ---

function setupGracefulShutdown(httpServer: Server): void {
  const shutdown = () => {
    logger.info('Shutting down Odoo MCP server...');

    httpServer.close();

    for (const [id, session] of sessions.entries()) {
      logger.debug('Closing session during shutdown', { sessionId: id });
      session.transport.close();
      sessions.delete(id);
    }

    clearInterval(sweepInterval);
    clientManager.clear();
    oauthStore.close();
    credentialStore.close();

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// --- Start server ---

const httpServer = app.listen(env.PORT, () => {
  logger.info('Odoo MCP server started', {
    port: env.PORT,
    basePath: env.BASE_PATH || '/',
    env: env.NODE_ENV,
  });
});

setupGracefulShutdown(httpServer);
