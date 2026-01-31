# Google Tag Manager MCP Server

MCP server for Google Tag Manager API with OAuth 2.0 authentication.

## Overview

This server provides Model Context Protocol (MCP) access to Google Tag Manager, enabling AI assistants to manage GTM containers, tags, triggers, and variables.

Based on the [stape-io/google-tag-manager-mcp-server](https://github.com/stape-io/google-tag-manager-mcp-server) project (Apache-2.0), adapted for Node.js deployment on Dokploy.

## Setup

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Tag Manager API**
4. Create OAuth 2.0 credentials:
   - Go to APIs & Services > Credentials
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect URI: `https://mcp-gtm.naturalheroes.nl/callback`
5. Note down the Client ID and Client Secret

### 2. Environment Variables

```bash
PORT=3001
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://mcp-gtm.naturalheroes.nl/callback
TOKEN_STORAGE_PATH=/data/tokens.json
```

### 3. Local Development

```bash
npm install
npm run dev
```

### 4. Docker Build

```bash
docker build -t gtm-mcp .
docker run -p 3001:3001 --env-file .env gtm-mcp
```

## Authentication

This server uses OAuth 2.0 for authentication. Each user authenticates with their own Google account:

1. Visit `/auth` in your browser
2. Complete the Google OAuth flow
3. The server stores tokens for use with MCP tools

## Available Tools

### Account Management
- `gtm_list_accounts` - List all GTM accounts
- `gtm_get_account` - Get account details

### Container Management
- `gtm_list_containers` - List containers in an account
- `gtm_get_container` - Get container details

### Workspace Management
- `gtm_list_workspaces` - List workspaces in a container

### Tag Management
- `gtm_list_tags` - List tags in a workspace
- `gtm_get_tag` - Get tag details
- `gtm_create_tag` - Create a new tag

### Trigger Management
- `gtm_list_triggers` - List triggers in a workspace
- `gtm_get_trigger` - Get trigger details

### Variable Management
- `gtm_list_variables` - List variables in a workspace
- `gtm_get_variable` - Get variable details

### Version Management
- `gtm_list_versions` - List container versions
- `gtm_publish_version` - Create and publish a version

## Usage with Claude

### Claude.ai Configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "gtm": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp-gtm.naturalheroes.nl/mcp"]
    }
  }
}
```

### Claude Code Configuration

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "gtm": {
      "type": "url",
      "url": "https://mcp-gtm.naturalheroes.nl/mcp"
    }
  }
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Home page with status |
| `/health` | GET | Health check |
| `/auth` | GET | Start OAuth flow |
| `/callback` | GET | OAuth callback |
| `/mcp` | POST | MCP requests |
| `/mcp` | GET | SSE notifications |
| `/mcp` | DELETE | Close session |

## License

Apache-2.0 (following the original project)
