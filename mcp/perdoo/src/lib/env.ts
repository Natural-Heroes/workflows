/**
 * Environment variable validation using Zod.
 *
 * Validates required environment variables at startup and provides
 * a typed configuration object. Fails fast with clear error messages
 * if required variables are missing or invalid.
 */

import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Environment variable schema.
 *
 * Required:
 * - PERDOO_API_TOKEN: Bearer token for Perdoo GraphQL API
 *
 * Optional (with defaults):
 * - PORT: Server port (default: 3001)
 * - NODE_ENV: Environment mode (default: development)
 */
const envSchema = z.object({
  PERDOO_API_TOKEN: z
    .string({ required_error: 'PERDOO_API_TOKEN is required' })
    .min(1, 'PERDOO_API_TOKEN cannot be empty'),

  PORT: z
    .string()
    .default('3001')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns typed config.
 *
 * @throws Error with detailed message if validation fails
 * @returns Validated and typed environment configuration
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');

    logger.error('Environment validation failed', {
      errors: result.error.errors.map((e) => ({
        path: e.path,
        message: e.message,
      })),
    });

    throw new Error(`Environment validation failed:\n${errors}`);
  }

  logger.info('Environment validated successfully', {
    port: result.data.PORT,
    env: result.data.NODE_ENV,
  });

  return result.data;
}

/**
 * Lazily initialized environment configuration.
 * Call validateEnv() at startup to populate this.
 */
let _env: Env | null = null;

/**
 * Gets the validated environment configuration.
 * Must call validateEnv() first or this will throw.
 *
 * @throws Error if validateEnv() hasn't been called
 * @returns Validated environment configuration
 */
export function getEnv(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}
