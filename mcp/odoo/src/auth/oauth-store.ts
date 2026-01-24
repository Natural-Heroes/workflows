/**
 * SQLite-backed OAuth state persistence.
 *
 * Stores OAuth client registrations, access tokens, and refresh tokens
 * in SQLite so they survive container restarts. Uses the same database
 * as the credential store.
 */

import Database from 'better-sqlite3';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { logger } from '../lib/logger.js';

export interface StoredTokenData {
  clientId: string;
  userId: string;
  scopes: string[];
  expiresAt: number;
}

export interface StoredRefreshData {
  userId: string;
  clientId: string;
  scopes: string[];
}

export class OAuthStore implements OAuthRegisteredClientsStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createSchema();
    this.cleanupExpiredTokens();
    logger.info('OAuthStore initialized', { dbPath });
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_tokens (
        token TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        scopes TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
        token TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  private cleanupExpiredTokens(): void {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db.prepare(
      'DELETE FROM oauth_tokens WHERE expires_at < ?'
    ).run(now);
    if (result.changes > 0) {
      logger.info('Cleaned up expired tokens on startup', { count: result.changes });
    }
  }

  // --- OAuthRegisteredClientsStore interface ---

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = this.db.prepare(
      'SELECT client_data FROM oauth_clients WHERE client_id = ?'
    ).get(clientId) as { client_data: string } | undefined;

    if (!row) return undefined;
    return JSON.parse(row.client_data) as OAuthClientInformationFull;
  }

  async registerClient(
    client: OAuthClientInformationFull
  ): Promise<OAuthClientInformationFull> {
    this.db.prepare(`
      INSERT INTO oauth_clients (client_id, client_data, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET
        client_data = excluded.client_data
    `).run(client.client_id, JSON.stringify(client), Date.now());

    logger.info('OAuth client registered (persistent)', { clientId: client.client_id });
    return client;
  }

  // --- Token persistence ---

  getToken(token: string): StoredTokenData | undefined {
    const row = this.db.prepare(
      'SELECT client_id, user_id, scopes, expires_at FROM oauth_tokens WHERE token = ?'
    ).get(token) as { client_id: string; user_id: string; scopes: string; expires_at: number } | undefined;

    if (!row) return undefined;

    // Check expiry
    if (row.expires_at < Math.floor(Date.now() / 1000)) {
      this.deleteToken(token);
      return undefined;
    }

    return {
      clientId: row.client_id,
      userId: row.user_id,
      scopes: JSON.parse(row.scopes),
      expiresAt: row.expires_at,
    };
  }

  setToken(token: string, data: StoredTokenData): void {
    this.db.prepare(`
      INSERT INTO oauth_tokens (token, client_id, user_id, scopes, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        client_id = excluded.client_id,
        user_id = excluded.user_id,
        scopes = excluded.scopes,
        expires_at = excluded.expires_at
    `).run(token, data.clientId, data.userId, JSON.stringify(data.scopes), data.expiresAt);
  }

  deleteToken(token: string): void {
    this.db.prepare('DELETE FROM oauth_tokens WHERE token = ?').run(token);
  }

  // --- Refresh token persistence ---

  getRefreshToken(token: string): StoredRefreshData | undefined {
    const row = this.db.prepare(
      'SELECT client_id, user_id, scopes FROM oauth_refresh_tokens WHERE token = ?'
    ).get(token) as { client_id: string; user_id: string; scopes: string } | undefined;

    if (!row) return undefined;

    return {
      clientId: row.client_id,
      userId: row.user_id,
      scopes: JSON.parse(row.scopes),
    };
  }

  setRefreshToken(token: string, data: StoredRefreshData): void {
    this.db.prepare(`
      INSERT INTO oauth_refresh_tokens (token, client_id, user_id, scopes, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        client_id = excluded.client_id,
        user_id = excluded.user_id,
        scopes = excluded.scopes
    `).run(token, data.clientId, data.userId, JSON.stringify(data.scopes), Date.now());
  }

  deleteRefreshToken(token: string): void {
    this.db.prepare('DELETE FROM oauth_refresh_tokens WHERE token = ?').run(token);
  }

  close(): void {
    this.db.close();
  }
}
