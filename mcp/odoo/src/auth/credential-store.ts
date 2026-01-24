/**
 * Encrypted credential store for Odoo API keys.
 *
 * Uses AES-256-GCM encryption with a PBKDF2-derived key to securely
 * store user API keys in a SQLite database. Each key is encrypted with
 * a unique IV and authenticated with a GCM auth tag.
 */

import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { logger } from '../lib/logger.js';

interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

interface CredentialRow {
  encrypted_api_key: string;
  iv: string;
  auth_tag: string;
}

export class CredentialStore {
  private readonly db: Database.Database;
  private readonly key: Buffer;

  constructor(options: { dbPath: string; masterKey: string }) {
    // Derive 256-bit encryption key using PBKDF2
    const salt = Buffer.from('odoo-mcp-credential-salt-v1', 'utf8');
    this.key = crypto.pbkdf2Sync(options.masterKey, salt, 100000, 32, 'sha256');

    // Initialize SQLite database with WAL mode
    this.db = new Database(options.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createSchema();

    logger.info('CredentialStore initialized', { dbPath: options.dbPath });
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY,
        encrypted_api_key TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  private encrypt(plaintext: string): EncryptedData {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  private decrypt(data: EncryptedData): string {
    try {
      const iv = Buffer.from(data.iv, 'base64');
      const authTag = Buffer.from(data.authTag, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(data.ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt credential', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stores or updates an encrypted API key for a user.
   */
  addOrUpdateUser(userId: string, apiKey: string): void {
    const encrypted = this.encrypt(apiKey);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO user_credentials (user_id, encrypted_api_key, iv, auth_tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        encrypted_api_key = excluded.encrypted_api_key,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        updated_at = excluded.updated_at
    `);

    stmt.run(userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now, now);
    logger.info('Credential stored', { userId });
  }

  /**
   * Retrieves and decrypts the API key for a user.
   * Returns null if user not found.
   */
  getApiKey(userId: string): string | null {
    const stmt = this.db.prepare(
      'SELECT encrypted_api_key, iv, auth_tag FROM user_credentials WHERE user_id = ?'
    );
    const row = stmt.get(userId) as CredentialRow | undefined;

    if (!row) {
      return null;
    }

    return this.decrypt({
      ciphertext: row.encrypted_api_key,
      iv: row.iv,
      authTag: row.auth_tag,
    });
  }

  /**
   * Deletes a user's stored credentials.
   * Returns true if a record was deleted, false if user not found.
   */
  deleteUser(userId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM user_credentials WHERE user_id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  /**
   * Checks whether credentials exist for a user.
   */
  userExists(userId: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM user_credentials WHERE user_id = ?');
    return stmt.get(userId) !== undefined;
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.db.close();
  }
}
