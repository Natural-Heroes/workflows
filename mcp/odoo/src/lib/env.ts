/**
 * Environment variable validation using Zod.
 *
 * Validates required environment variables at startup and provides
 * a typed configuration object. Fails fast with clear error messages
 * if required variables are missing or invalid.
 */

import 'dotenv/config';
import { z } from 'zod';
import { logger } from './logger.js';

const envSchema = z.object({
  ODOO_URL: z
    .string({ required_error: 'ODOO_URL is required' })
    .url('ODOO_URL must be a valid URL'),

  ODOO_DATABASE: z
    .string({ required_error: 'ODOO_DATABASE is required' })
    .min(1, 'ODOO_DATABASE cannot be empty'),

  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  ENCRYPTION_KEY: z
    .string({ required_error: 'ENCRYPTION_KEY is required' })
    .min(16, 'ENCRYPTION_KEY must be at least 16 characters'),

  MCP_SERVER_URL: z
    .string({ required_error: 'MCP_SERVER_URL is required' })
    .url('MCP_SERVER_URL must be a valid URL'),

  DB_PATH: z.string().default('./data/credentials.db'),

  BASE_PATH: z
    .string()
    .default('')
    .transform((val) => {
      if (!val) return '';
      let p = val.startsWith('/') ? val : '/' + val;
      if (p.endsWith('/')) p = p.slice(0, -1);
      return p;
    }),

  ODOO_WEB_URL: z
    .string()
    .url()
    .optional()
    .describe('Base URL for Odoo web UI links (e.g. https://odoo.naturalheroes.nl)'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((err) => '  - ' + err.path.join('.') + ': ' + err.message)
      .join('\n');

    logger.error('Environment validation failed', {
      errors: result.error.errors.map((e) => ({
        path: e.path,
        message: e.message,
      })),
    });

    throw new Error('Environment validation failed:\n' + errors);
  }

  logger.info('Environment validated successfully', {
    port: result.data.PORT,
    env: result.data.NODE_ENV,
    logLevel: result.data.LOG_LEVEL,
  });

  return result.data;
}

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}
