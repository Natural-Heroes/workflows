/**
 * OAuth 2.1 server provider for Odoo MCP.
 *
 * Implements the MCP SDK's OAuthServerProvider interface to handle the full
 * OAuth 2.1 authorization code flow with PKCE. Maps authenticated users to
 * their Odoo API keys stored in the encrypted credential store.
 *
 * Flow:
 * 1. authorize() -> redirect to /login with pending auth ID
 * 2. User submits login form -> validateOdooCredentials() verifies against Odoo
 * 3. completeAuthorization() -> issues auth code, redirects to client
 * 4. exchangeAuthorizationCode() -> issues access + refresh tokens
 * 5. verifyAccessToken() -> returns AuthInfo with userId and odooApiKey
 */

import { randomUUID } from 'crypto';
import { Response } from 'express';
import { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { CredentialStore } from './credential-store.js';
import { InMemoryClientsStore } from './clients-store.js';
import { OdooClient } from '../services/odoo/client.js';
import { logger } from '../lib/logger.js';

interface CodeData {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  userId: string;
  createdAt: number;
}

interface TokenData {
  clientId: string;
  userId: string;
  scopes: string[];
  expiresAt: number; // seconds since epoch
}

interface RefreshData {
  userId: string;
  clientId: string;
  scopes: string[];
}

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

export class OdooOAuthProvider implements OAuthServerProvider {
  private codes = new Map<string, CodeData>();
  private tokens = new Map<string, TokenData>();
  private refreshTokens = new Map<string, RefreshData>();
  private pendingAuths = new Map<string, PendingAuth>();
  private _clientsStore: InMemoryClientsStore;

  constructor(
    private readonly credentialStore: CredentialStore,
    private readonly odooUrl: string,
    private readonly odooDatabase: string,
  ) {
    this._clientsStore = new InMemoryClientsStore();
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  /**
   * Begins the authorization flow by redirecting to the login page.
   * Stores the pending authorization for later completion after user login.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const pendingId = randomUUID();
    this.pendingAuths.set(pendingId, { client, params });
    res.redirect('/login?pending=' + pendingId);
    logger.info('OAuth authorize: redirecting to login', { clientId: client.client_id });
  }

  /**
   * Retrieves a pending authorization by ID.
   * Used by the login form handler to access the authorization context.
   */
  getPendingAuth(pendingId: string): PendingAuth | undefined {
    return this.pendingAuths.get(pendingId);
  }

  /**
   * Removes a pending authorization.
   */
  deletePendingAuth(pendingId: string): void {
    this.pendingAuths.delete(pendingId);
  }

  /**
   * Completes the authorization after successful user login.
   * Generates an authorization code and returns the redirect URL.
   */
  async completeAuthorization(
    pendingId: string,
    userId: string,
  ): Promise<{ code: string; redirectUri: string; state?: string }> {
    const pending = this.pendingAuths.get(pendingId);
    if (!pending) {
      throw new Error('Pending authorization not found');
    }

    const code = randomUUID();
    this.codes.set(code, {
      client: pending.client,
      params: pending.params,
      userId,
      createdAt: Date.now(),
    });
    this.pendingAuths.delete(pendingId);

    const targetUrl = new URL(pending.params.redirectUri);
    targetUrl.searchParams.set('code', code);
    if (pending.params.state) {
      targetUrl.searchParams.set('state', pending.params.state);
    }

    logger.info('Authorization code issued', { userId, clientId: pending.client.client_id });

    return {
      code,
      redirectUri: targetUrl.toString(),
      state: pending.params.state,
    };
  }

  /**
   * Returns the PKCE code challenge for a given authorization code.
   * Required by the SDK for PKCE validation during token exchange.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error('Invalid authorization code');
    }
    return codeData.params.codeChallenge;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   * Validates that the code was issued to the requesting client.
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error('Invalid authorization code');
    }
    if (codeData.client.client_id !== client.client_id) {
      throw new Error('Code not issued to this client');
    }
    this.codes.delete(authorizationCode);

    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const expiresIn = 3600; // 1 hour

    this.tokens.set(accessToken, {
      clientId: client.client_id,
      userId: codeData.userId,
      scopes: codeData.params.scopes || [],
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    });

    this.refreshTokens.set(refreshToken, {
      userId: codeData.userId,
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
    });

    logger.info('Token issued', { userId: codeData.userId, clientId: client.client_id });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: (codeData.params.scopes || []).join(' '),
    };
  }

  /**
   * Exchanges a refresh token for a new access token.
   * Implements refresh token rotation (old token invalidated, new one issued).
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const data = this.refreshTokens.get(refreshToken);
    if (!data || data.clientId !== client.client_id) {
      throw new Error('Invalid refresh token');
    }

    // Rotate refresh token
    this.refreshTokens.delete(refreshToken);

    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();
    const expiresIn = 3600;
    const finalScopes = scopes || data.scopes;

    this.tokens.set(newAccessToken, {
      clientId: client.client_id,
      userId: data.userId,
      scopes: finalScopes,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    });

    this.refreshTokens.set(newRefreshToken, {
      userId: data.userId,
      clientId: client.client_id,
      scopes: finalScopes,
    });

    logger.info('Token refreshed', { userId: data.userId, clientId: client.client_id });

    return {
      access_token: newAccessToken,
      token_type: 'bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: finalScopes.join(' '),
    };
  }

  /**
   * Verifies an access token and returns authentication info.
   *
   * CRITICAL: expiresAt is in SECONDS since epoch (not milliseconds).
   * The SDK's requireBearerAuth middleware requires this format.
   *
   * Returns the user's Odoo API key in extra.odooApiKey for use in tool handlers.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const data = this.tokens.get(token);
    if (!data) {
      throw new Error('Invalid token');
    }

    if (data.expiresAt < Math.floor(Date.now() / 1000)) {
      this.tokens.delete(token);
      throw new Error('Token expired');
    }

    const apiKey = this.credentialStore.getApiKey(data.userId);
    if (!apiKey) {
      throw new Error('User credentials not found');
    }

    return {
      token,
      clientId: data.clientId,
      scopes: data.scopes,
      expiresAt: data.expiresAt,
      extra: {
        userId: data.userId,
        odooApiKey: apiKey,
      },
    };
  }

  /**
   * Revokes an access or refresh token.
   * Silently succeeds if the token is already revoked or invalid.
   */
  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    this.tokens.delete(request.token);
    this.refreshTokens.delete(request.token);
  }

  /**
   * Validates Odoo credentials by attempting to read the user record.
   * Calls the Odoo JSON-2 API with the provided API key to verify it
   * belongs to the claimed email address.
   *
   * @param email - The user's Odoo login email
   * @param apiKey - The user's Odoo API key
   * @returns The Odoo user ID as a string, or null if validation fails
   */
  async validateOdooCredentials(email: string, apiKey: string): Promise<string | null> {
    const client = new OdooClient(this.odooUrl, apiKey, this.odooDatabase);

    try {
      const result = await client.searchRead<{ id: number; login: string }>(
        'res.users',
        [['login', '=', email]],
        ['id', 'login'],
        { limit: 1 },
      );

      if (result.length > 0 && result[0].login === email) {
        return String(result[0].id);
      }

      logger.warn('Odoo credential validation: no matching user', { email });
      return null;
    } catch (error) {
      logger.warn('Odoo credential validation failed', {
        email,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
