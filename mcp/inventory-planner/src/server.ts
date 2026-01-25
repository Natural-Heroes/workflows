/**
 * Inventory Planner MCP Server
 *
 * Entry point that validates environment and starts the HTTP server.
 * The Express app is defined in app.ts for testability.
 */

import { logger } from './lib/logger.js';
import { validateEnv, getEnv } from './lib/env.js';
import { app } from './app.js';

// Validate environment variables at startup (fail fast)
try {
  validateEnv();
} catch (error) {
  logger.error('Failed to start server: environment validation failed');
  process.exit(1);
}

const env = getEnv();

// Start server
app.listen(env.PORT, () => {
  logger.info('Inventory Planner MCP server started', {
    port: env.PORT,
    env: env.NODE_ENV,
  });
});
