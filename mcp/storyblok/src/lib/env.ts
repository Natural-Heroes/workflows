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
 * - STORYBLOK_MANAGEMENT_TOKEN: Personal access token for Management API
 * - STORYBLOK_SPACE_ID: Numeric space ID
 *
 * Optional (with defaults):
 * - STORYBLOK_REGION: API region (eu, us, ca, ap, cn)
 * - PORT: Server port (default: 3001)
 * - NODE_ENV: Environment mode (default: development)
 * - BASE_PATH: URL prefix for all endpoints
 */
const envSchema = z.object({
  STORYBLOK_MANAGEMENT_TOKEN: z
    .string({ required_error: 'STORYBLOK_MANAGEMENT_TOKEN is required' })
    .min(1, 'STORYBLOK_MANAGEMENT_TOKEN cannot be empty'),

  STORYBLOK_SPACE_ID: z
    .string({ required_error: 'STORYBLOK_SPACE_ID is required' })
    .min(1, 'STORYBLOK_SPACE_ID cannot be empty')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'STORYBLOK_SPACE_ID must be a positive number',
    }),

  STORYBLOK_DEFAULT_PUBLIC_TOKEN: z
    .string()
    .optional()
    .describe('Public/preview token for read-only access'),

  STORYBLOK_REGION: z
    .enum(['eu', 'us', 'ca', 'ap', 'cn'])
    .default('eu'),

  PORT: z
    .string()
    .default('3001')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  BASE_PATH: z
    .string()
    .default('')
    .transform((val) => {
      if (!val) return '';
      let p = val.startsWith('/') ? val : '/' + val;
      if (p.endsWith('/')) p = p.slice(0, -1);
      return p;
    }),
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
    spaceId: result.data.STORYBLOK_SPACE_ID,
    region: result.data.STORYBLOK_REGION,
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
