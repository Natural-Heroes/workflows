/**
 * GTM MCP Server Entry Point
 * 
 * Validates environment and starts the HTTP server.
 */

import { logger } from './lib/logger.js';
import { validateEnv, getEnv } from './lib/env.js';
import { setTokenStorePath } from './oauth/index.js';
import { app } from './app.js';

// Validate environment variables at startup
try {
  validateEnv();
} catch (error) {
  logger.error('Failed to start server: environment validation failed');
  process.exit(1);
}

const env = getEnv();

// Configure token storage path
setTokenStorePath(env.TOKEN_STORAGE_PATH);

// Start server
app.listen(parseInt(env.PORT), '0.0.0.0', () => {
  logger.info('GTM MCP server started', {
    port: env.PORT,
    env: env.NODE_ENV,
    callbackUrl: env.GOOGLE_CALLBACK_URL,
  });
  logger.info('Visit /auth to authenticate with Google');
});
