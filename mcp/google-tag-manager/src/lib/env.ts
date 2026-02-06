/**
 * Environment variable validation for GTM MCP server
 */

import { z } from 'zod';
import { logger } from './logger.js';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_CALLBACK_URL: z.string().url('GOOGLE_CALLBACK_URL must be a valid URL'),
  // Token storage file path (for persisting OAuth tokens)
  TOKEN_STORAGE_PATH: z.string().default('/tmp/gtm-tokens.json'),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => e.path.join('.') + ': ' + e.message);
    logger.error('Environment validation failed', { errors });
    throw new Error('Missing required environment variables: ' + errors.join(', '));
  }
  
  cachedEnv = result.data;
  logger.info('Environment validated successfully');
}

export function getEnv(): Env {
  if (!cachedEnv) {
    validateEnv();
  }
  return cachedEnv!;
}
