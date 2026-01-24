/**
 * In-memory OAuth registered clients store.
 *
 * Implements the MCP SDK's OAuthRegisteredClientsStore interface for
 * dynamic client registration. Clients are stored in memory and lost
 * on restart, which is acceptable for an embedded OAuth provider.
 */

import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { logger } from '../lib/logger.js';

export class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    client: OAuthClientInformationFull
  ): Promise<OAuthClientInformationFull> {
    this.clients.set(client.client_id, client);
    logger.info('OAuth client registered', { clientId: client.client_id });
    return client;
  }
}
