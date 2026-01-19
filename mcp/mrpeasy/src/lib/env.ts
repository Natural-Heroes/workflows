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
 * - MRPEASY_API_KEY: API key from MRPeasy account
 * - MRPEASY_API_SECRET: API secret from MRPeasy account
 *
 * Optional (with defaults):
 * - PORT: Server port (default: 3000)
 * - NODE_ENV: Environment mode (default: development)
 */
const envSchema = z.object({
  MRPEASY_API_KEY: z
    .string({ required_error: 'MRPEASY_API_KEY is required' })
    .min(1, 'MRPEASY_API_KEY cannot be empty'),

  MRPEASY_API_SECRET: z
    .string({ required_error: 'MRPEASY_API_SECRET is required' })
    .min(1, 'MRPEASY_API_SECRET cannot be empty'),

  PORT: z
    .string()
    .default('3000')
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
