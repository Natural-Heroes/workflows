/**
 * Google OAuth 2.0 client for GTM API access
 */

import { google } from 'googleapis';
import { getEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { getTokens, setTokens, OAuthTokens } from './token-store.js';

let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getOAuth2Client() {
  if (!oauth2Client) {
    const env = getEnv();
    oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_CALLBACK_URL
    );
  }
  return oauth2Client;
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  
  logger.info('Successfully exchanged code for tokens');
  
  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
    token_type: tokens.token_type || 'Bearer',
    scope: tokens.scope || undefined,
  };
}

export async function refreshAccessToken(sessionId: string): Promise<OAuthTokens | null> {
  const tokens = getTokens(sessionId);
  if (!tokens?.refresh_token) {
    logger.warn('No refresh token available for session', { sessionId });
    return null;
  }

  const client = getOAuth2Client();
  client.setCredentials({
    refresh_token: tokens.refresh_token,
  });

  try {
    const { credentials } = await client.refreshAccessToken();
    
    const newTokens: OAuthTokens = {
      access_token: credentials.access_token!,
      refresh_token: credentials.refresh_token || tokens.refresh_token,
      expiry_date: credentials.expiry_date || undefined,
      token_type: credentials.token_type || 'Bearer',
      scope: credentials.scope || tokens.scope,
    };
    
    setTokens(sessionId, newTokens);
    logger.info('Successfully refreshed access token', { sessionId });
    
    return newTokens;
  } catch (error) {
    logger.error('Failed to refresh access token', { 
      sessionId, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
}

export function getTagManagerClient(tokens: OAuthTokens) {
  // Check if token is expired
  if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
    throw new Error('Access token has expired. Please re-authenticate.');
  }

  return google.tagmanager({
    version: 'v2',
    headers: {
      Authorization: 'Bearer ' + tokens.access_token,
    },
  });
}
