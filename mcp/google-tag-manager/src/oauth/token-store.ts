/**
 * Token storage for OAuth tokens
 * 
 * Stores tokens in a JSON file for persistence across restarts.
 * In production, consider using Redis or a database.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { logger } from '../lib/logger.js';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type: string;
  scope?: string;
}

interface TokenStore {
  [sessionId: string]: OAuthTokens;
}

let tokenStorePath = '/tmp/gtm-tokens.json';

export function setTokenStorePath(path: string): void {
  tokenStorePath = path;
}

function loadStore(): TokenStore {
  try {
    if (existsSync(tokenStorePath)) {
      const data = readFileSync(tokenStorePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn('Failed to load token store', { error: String(error) });
  }
  return {};
}

function saveStore(store: TokenStore): void {
  try {
    writeFileSync(tokenStorePath, JSON.stringify(store, null, 2));
  } catch (error) {
    logger.error('Failed to save token store', { error: String(error) });
  }
}

export function getTokens(sessionId: string): OAuthTokens | null {
  const store = loadStore();
  return store[sessionId] || null;
}

export function setTokens(sessionId: string, tokens: OAuthTokens): void {
  const store = loadStore();
  store[sessionId] = tokens;
  saveStore(store);
  logger.debug('Tokens saved for session', { sessionId });
}

export function deleteTokens(sessionId: string): void {
  const store = loadStore();
  delete store[sessionId];
  saveStore(store);
  logger.debug('Tokens deleted for session', { sessionId });
}

export function hasValidTokens(sessionId: string): boolean {
  const tokens = getTokens(sessionId);
  if (!tokens) return false;
  
  // Check if token is expired (with 5 minute buffer)
  if (tokens.expiry_date) {
    const buffer = 5 * 60 * 1000; // 5 minutes
    if (Date.now() >= tokens.expiry_date - buffer) {
      return false;
    }
  }
  
  return !!tokens.access_token;
}
