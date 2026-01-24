/**
 * Environment variable validation for multi-store Shopify configuration.
 *
 * Supports dynamic store configuration via environment variables:
 * - SHOPIFY_STORES: comma-separated list of store identifiers
 * - SHOPIFY_STORE_{ID}_DOMAIN: myshopify.com domain for each store
 * - SHOPIFY_STORE_{ID}_TOKEN: Admin API access token for each store
 * - SHOPIFY_DEFAULT_STORE: default store when none specified
 */

import { z } from 'zod';
import { logger } from './logger.js';

export interface StoreConfig {
  id: string;
  domain: string;
  token: string;
}

export interface Env {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  BASE_PATH: string;
  stores: StoreConfig[];
  defaultStore: string;
}

/**
 * Parses multi-store configuration from environment variables.
 *
 * Expected format:
 *   SHOPIFY_STORES=nl,dev
 *   SHOPIFY_STORE_NL_DOMAIN=natural-heroes-nl.myshopify.com
 *   SHOPIFY_STORE_NL_TOKEN=shpat_xxx
 *   SHOPIFY_STORE_DEV_DOMAIN=dev-test-xxx.myshopify.com
 *   SHOPIFY_STORE_DEV_TOKEN=shpat_yyy
 *   SHOPIFY_DEFAULT_STORE=nl
 */
export function validateEnv(): Env {
  const errors: string[] = [];

  // Parse base config
  const portStr = process.env.PORT ?? '3001';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('PORT must be a valid port number (1-65535)');
  }

  const nodeEnv = (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, production, or test');
  }

  // Parse BASE_PATH (optional, e.g., '/shopify')
  let basePath = process.env.BASE_PATH ?? '';
  if (basePath && !basePath.startsWith('/')) {
    basePath = '/' + basePath;
  }
  // Remove trailing slash
  if (basePath.endsWith('/')) {
    basePath = basePath.slice(0, -1);
  }

  // Parse store identifiers
  const storesStr = process.env.SHOPIFY_STORES;
  if (!storesStr || storesStr.trim().length === 0) {
    errors.push('SHOPIFY_STORES is required (comma-separated store IDs, e.g., "nl,dev")');
  }

  const storeIds = (storesStr ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (storeIds.length === 0 && !errors.length) {
    errors.push('SHOPIFY_STORES must contain at least one store identifier');
  }

  // Parse each store's config
  const stores: StoreConfig[] = [];
  for (const id of storeIds) {
    const upper = id.toUpperCase();
    const domain = process.env[`SHOPIFY_STORE_${upper}_DOMAIN`];
    const token = process.env[`SHOPIFY_STORE_${upper}_TOKEN`];

    if (!domain || domain.trim().length === 0) {
      errors.push(`SHOPIFY_STORE_${upper}_DOMAIN is required for store "${id}"`);
    }
    if (!token || token.trim().length === 0) {
      errors.push(`SHOPIFY_STORE_${upper}_TOKEN is required for store "${id}"`);
    }

    if (domain && token) {
      stores.push({ id, domain: domain.trim(), token: token.trim() });
    }
  }

  // Parse default store
  const defaultStore = process.env.SHOPIFY_DEFAULT_STORE ?? storeIds[0] ?? '';
  if (defaultStore && storeIds.length > 0 && !storeIds.includes(defaultStore)) {
    errors.push(`SHOPIFY_DEFAULT_STORE "${defaultStore}" is not in SHOPIFY_STORES list`);
  }

  if (errors.length > 0) {
    const errorMsg = errors.map((e) => `  - ${e}`).join('\n');
    logger.error('Environment validation failed', { errors });
    throw new Error(`Environment validation failed:\n${errorMsg}`);
  }

  logger.info('Environment validated successfully', {
    port,
    env: nodeEnv,
    stores: storeIds,
    defaultStore,
  });

  return { PORT: port, NODE_ENV: nodeEnv, BASE_PATH: basePath, stores, defaultStore };
}

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}
