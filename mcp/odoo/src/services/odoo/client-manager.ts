/**
 * Per-user OdooClient manager with LRU caching.
 *
 * Maintains a cache of OdooClient instances keyed by API key.
 * Clients are evicted after TTL expiry or when cache reaches max size.
 * This avoids recreating clients on every request while bounding memory.
 */

import { LRUCache } from 'lru-cache';
import { logger } from '../../lib/logger.js';
import { OdooClient } from './client.js';

export interface OdooClientManagerOptions {
  /** Maximum number of cached clients (default: 50) */
  maxSize?: number;
  /** Time-to-live in milliseconds (default: 30 minutes) */
  ttlMs?: number;
}

export class OdooClientManager {
  private readonly odooUrl: string;
  private readonly odooDb: string;
  private readonly cache: LRUCache<string, OdooClient>;

  constructor(odooUrl: string, odooDb: string, options?: OdooClientManagerOptions) {
    this.odooUrl = odooUrl;
    this.odooDb = odooDb;

    this.cache = new LRUCache<string, OdooClient>({
      max: options?.maxSize ?? 50,
      ttl: options?.ttlMs ?? 30 * 60 * 1000, // 30 minutes
      dispose: (_value, key) => {
        const truncatedKey = key.substring(0, 8);
        logger.debug('Evicting OdooClient from cache', { keyPrefix: truncatedKey });
      },
    });
  }

  /**
   * Gets or creates an OdooClient for the given API key.
   *
   * If a client exists in cache and hasn't expired, it is returned.
   * Otherwise a new client is created, cached, and returned.
   *
   * @param apiKey - User's Odoo API key
   * @returns OdooClient instance
   */
  getClient(apiKey: string): OdooClient {
    const existing = this.cache.get(apiKey);
    if (existing) {
      logger.debug('OdooClient cache hit', { keyPrefix: apiKey.substring(0, 8) });
      return existing;
    }

    logger.debug('OdooClient cache miss, creating new client', {
      keyPrefix: apiKey.substring(0, 8),
    });
    const client = new OdooClient(this.odooUrl, apiKey, this.odooDb);
    this.cache.set(apiKey, client);
    return client;
  }

  /** Number of currently cached clients */
  get size(): number {
    return this.cache.size;
  }

  /** Clear all cached clients */
  clear(): void {
    this.cache.clear();
    logger.info('OdooClient cache cleared');
  }
}
