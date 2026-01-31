/**
 * GTM MCP Tools Registration
 * 
 * Registers tools for interacting with Google Tag Manager API.
 * Each tool requires a valid OAuth session.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { getTagManagerClient, getTokens, hasValidTokens, refreshAccessToken } from '../oauth/index.js';
import type { OAuthTokens } from '../oauth/index.js';

// Session ID is passed via request context
let currentSessionId: string | null = null;

export function setCurrentSession(sessionId: string | null) {
  currentSessionId = sessionId;
}

async function getClientForSession(): Promise<ReturnType<typeof getTagManagerClient>> {
  if (!currentSessionId) {
    throw new Error('No active session. Please authenticate first by visiting /auth');
  }

  let tokens = getTokens(currentSessionId);
  
  if (!tokens) {
    throw new Error('No tokens found for session. Please authenticate first by visiting /auth');
  }

  // Check if token needs refresh
  if (!hasValidTokens(currentSessionId)) {
    logger.info('Token expired, attempting refresh', { sessionId: currentSessionId });
    const refreshedTokens = await refreshAccessToken(currentSessionId);
    if (!refreshedTokens) {
      throw new Error('Token expired and refresh failed. Please re-authenticate by visiting /auth');
    }
    tokens = refreshedTokens;
  }

  return getTagManagerClient(tokens);
}

function createErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Tool error', { error: message });
  return {
    content: [{ type: 'text' as const, text: 'Error: ' + message }],
    isError: true,
  };
}

export function registerTools(server: McpServer) {
  // Account tools
  server.tool(
    'gtm_list_accounts',
    'List all GTM accounts accessible to the authenticated user',
    {},
    async () => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.list();
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'gtm_get_account',
    'Get details of a specific GTM account',
    {
      accountId: z.string().describe('The GTM account ID'),
    },
    async ({ accountId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.get({
          path: 'accounts/' + accountId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Container tools
  server.tool(
    'gtm_list_containers',
    'List all containers in a GTM account',
    {
      accountId: z.string().describe('The GTM account ID'),
    },
    async ({ accountId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.list({
          parent: 'accounts/' + accountId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'gtm_get_container',
    'Get details of a specific container',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
    },
    async ({ accountId, containerId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.get({
          path: 'accounts/' + accountId + '/containers/' + containerId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Workspace tools
  server.tool(
    'gtm_list_workspaces',
    'List all workspaces in a container',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
    },
    async ({ accountId, containerId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.list({
          parent: 'accounts/' + accountId + '/containers/' + containerId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Tag tools
  server.tool(
    'gtm_list_tags',
    'List all tags in a workspace',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
    },
    async ({ accountId, containerId, workspaceId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.tags.list({
          parent: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'gtm_get_tag',
    'Get details of a specific tag',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
      tagId: z.string().describe('The tag ID'),
    },
    async ({ accountId, containerId, workspaceId, tagId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.tags.get({
          path: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId + '/tags/' + tagId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'gtm_create_tag',
    'Create a new tag in a workspace',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
      name: z.string().describe('The tag name'),
      type: z.string().describe('The tag type (e.g., "html", "img", "ua", "gaawc")'),
      parameter: z.array(z.object({
        key: z.string(),
        type: z.string(),
        value: z.string().optional(),
      })).optional().describe('Tag parameters'),
      firingTriggerId: z.array(z.string()).optional().describe('Trigger IDs that fire this tag'),
    },
    async ({ accountId, containerId, workspaceId, name, type, parameter, firingTriggerId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.tags.create({
          parent: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId,
          requestBody: {
            name,
            type,
            parameter,
            firingTriggerId,
          },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Trigger tools
  server.tool(
    'gtm_list_triggers',
    'List all triggers in a workspace',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
    },
    async ({ accountId, containerId, workspaceId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.triggers.list({
          parent: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'gtm_get_trigger',
    'Get details of a specific trigger',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
      triggerId: z.string().describe('The trigger ID'),
    },
    async ({ accountId, containerId, workspaceId, triggerId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.triggers.get({
          path: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId + '/triggers/' + triggerId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Variable tools
  server.tool(
    'gtm_list_variables',
    'List all variables in a workspace',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
    },
    async ({ accountId, containerId, workspaceId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.variables.list({
          parent: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'gtm_get_variable',
    'Get details of a specific variable',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
      variableId: z.string().describe('The variable ID'),
    },
    async ({ accountId, containerId, workspaceId, variableId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.workspaces.variables.get({
          path: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId + '/variables/' + variableId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // Version tools
  server.tool(
    'gtm_list_versions',
    'List all versions in a container',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
    },
    async ({ accountId, containerId }) => {
      try {
        const client = await getClientForSession();
        const response = await client.accounts.containers.version_headers.list({
          parent: 'accounts/' + accountId + '/containers/' + containerId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  server.tool(
    'gtm_publish_version',
    'Publish a container version (make it live)',
    {
      accountId: z.string().describe('The GTM account ID'),
      containerId: z.string().describe('The GTM container ID'),
      workspaceId: z.string().describe('The GTM workspace ID'),
      versionName: z.string().optional().describe('Optional version name'),
      versionNotes: z.string().optional().describe('Optional version notes'),
    },
    async ({ accountId, containerId, workspaceId, versionName, versionNotes }) => {
      try {
        const client = await getClientForSession();
        // First create a version from the workspace
        const createResponse = await client.accounts.containers.workspaces.create_version({
          path: 'accounts/' + accountId + '/containers/' + containerId + '/workspaces/' + workspaceId,
          requestBody: {
            name: versionName,
            notes: versionNotes,
          },
        });
        
        if (!createResponse.data.containerVersion?.containerVersionId) {
          throw new Error('Failed to create version');
        }
        
        // Then publish it
        const publishResponse = await client.accounts.containers.versions.publish({
          path: 'accounts/' + accountId + '/containers/' + containerId + '/versions/' + createResponse.data.containerVersion.containerVersionId,
        });
        
        return {
          content: [{ type: 'text', text: JSON.stringify(publishResponse.data, null, 2) }],
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  logger.info('GTM tools registered');
}
