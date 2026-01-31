/**
 * Token storage for OAuth tokens
 * 
 * Uses a GLOBAL token store - all sessions share the same tokens.
 * This is suitable for internal/single-user deployments.
 * For multi-user, implement per-user token storage with proper auth.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../lib/logger.js';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type: string;
  scope?: string;
}

let tokenStorePath = '/tmp/gtm-tokens.json';

export function setTokenStorePath(path: string): void {
  tokenStorePath = path;
  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (e) {
      logger.warn('Could not create token storage directory', { dir, error: String(e) });
    }
  }
}

function loadTokens(): OAuthTokens | null {
  try {
    if (existsSync(tokenStorePath)) {
      const data = readFileSync(tokenStorePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn('Failed to load tokens', { error: String(error) });
  }
  return null;
}

function saveTokens(tokens: OAuthTokens): void {
  try {
    writeFileSync(tokenStorePath, JSON.stringify(tokens, null, 2));
    logger.info('Tokens saved successfully');
  } catch (error) {
    logger.error('Failed to save tokens', { error: String(error) });
  }
}

// Global token storage - ignores sessionId for single-user mode
export function getTokens(_sessionId?: string): OAuthTokens | null {
  return loadTokens();
}

export function setTokens(_sessionId: string, tokens: OAuthTokens): void {
  saveTokens(tokens);
}

export function deleteTokens(_sessionId?: string): void {
  try {
    if (existsSync(tokenStorePath)) {
      writeFileSync(tokenStorePath, '{}');
    }
    logger.info('Tokens deleted');
  } catch (error) {
    logger.error('Failed to delete tokens', { error: String(error) });
  }
}

export function hasValidTokens(_sessionId?: string): boolean {
  const tokens = loadTokens();
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
