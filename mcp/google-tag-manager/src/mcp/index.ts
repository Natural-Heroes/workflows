/**
 * MCP Module Entry Point
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../lib/logger.js';
import { registerTools } from './tools.js';

const SERVER_DESCRIPTION = 
  'Google Tag Manager MCP server for managing GTM containers, tags, triggers, and variables. ' +
  'Requires OAuth authentication - visit /auth to authenticate with Google.';

const INSTRUCTIONS_RESOURCE = `# Google Tag Manager MCP Server

This server provides access to Google Tag Manager API for managing containers, tags, triggers, and variables.

## Authentication

Before using any tools, you must authenticate with Google:
1. Visit the /auth endpoint in your browser
2. Complete the Google OAuth flow
3. Return to use the MCP tools

## Available Tools

### Account Management
- **gtm_list_accounts**: List all GTM accounts
- **gtm_get_account**: Get account details

### Container Management
- **gtm_list_containers**: List containers in an account
- **gtm_get_container**: Get container details

### Workspace Management
- **gtm_list_workspaces**: List workspaces in a container

### Tag Management
- **gtm_list_tags**: List tags in a workspace
- **gtm_get_tag**: Get tag details
- **gtm_create_tag**: Create a new tag

### Trigger Management
- **gtm_list_triggers**: List triggers in a workspace
- **gtm_get_trigger**: Get trigger details

### Variable Management
- **gtm_list_variables**: List variables in a workspace
- **gtm_get_variable**: Get variable details

### Version Management
- **gtm_list_versions**: List container versions
- **gtm_publish_version**: Create and publish a version

## Typical Workflow

1. List accounts: gtm_list_accounts()
2. List containers: gtm_list_containers(accountId)
3. List workspaces: gtm_list_workspaces(accountId, containerId)
4. View/modify tags, triggers, variables in the workspace
5. Publish changes: gtm_publish_version(accountId, containerId, workspaceId)

## GTM Resource Hierarchy

Account > Container > Workspace > Tags/Triggers/Variables

Each resource is identified by its path: accounts/{accountId}/containers/{containerId}/workspaces/{workspaceId}
`;

export function createMcpServer(): McpServer {
  logger.info('Creating GTM MCP server instance');

  const server = new McpServer({
    name: 'google-tag-manager-mcp',
    version: '0.1.0',
    description: SERVER_DESCRIPTION,
  });

  // Register instructions resource
  server.resource(
    'instructions',
    'gtm://instructions',
    {
      description: 'Usage guide for the GTM MCP server',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'gtm://instructions',
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_RESOURCE,
        },
      ],
    })
  );

  // Register ping tool for testing
  server.tool(
    'ping',
    'Test tool to verify MCP server is working',
    {},
    async () => ({
      content: [{ type: 'text', text: 'pong' }],
    })
  );

  // Register GTM tools
  registerTools(server);

  logger.info('GTM MCP server created');
  return server;
}
