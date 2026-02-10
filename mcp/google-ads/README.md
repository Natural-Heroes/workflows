# Google Ads MCP Server

HTTP-accessible MCP server for Google Ads API, enabling AI-assisted campaign management and analytics.

## Overview

This server wraps [google-marketing-solutions/google_ads_mcp](https://github.com/google-marketing-solutions/google_ads_mcp) with Streamable HTTP transport for remote access from Claude.ai and other MCP clients.

## Features

- List all campaigns
- Show metrics for specific campaigns
- Get all ad groups
- Execute GAQL (Google Ads Query Language) queries
- Campaign performance analytics

## Prerequisites

1. **Google Ads API Access**
   - Google Ads developer token (from [Google Ads API Center](https://developers.google.com/google-ads/api/docs/get-started/dev-token))
   - OAuth 2.0 credentials (from [Google Cloud Console](https://console.cloud.google.com/apis/credentials))
   - Refresh token (generated via OAuth flow)

2. **Manager Account (Optional)**
   - `login_customer_id` for accessing multiple accounts

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `GOOGLE_ADS_YAML` | Yes | Full google-ads.yaml content as string |

### Google Ads YAML Format

```yaml
developer_token: YOUR_DEVELOPER_TOKEN
client_id: YOUR_CLIENT_ID.apps.googleusercontent.com
client_secret: YOUR_CLIENT_SECRET
refresh_token: YOUR_REFRESH_TOKEN
login_customer_id: 1234567890  # Optional: Manager account ID
```

## Deployment

### Dokploy

1. Create application in "MCP Servers" project
2. Set source to GitHub: `Natural-Heroes/workflows`
3. Build path: `mcp/google-ads`
4. Build type: `dockerfile`
5. Configure environment variables
6. Set up domain: `mcp-google-ads.naturalheroes.nl`

### Local Development

```bash
# Set credentials
export GOOGLE_ADS_YAML='...'

# Run with Docker
docker build -t google-ads-mcp .
docker run -p 3001:3001 -e GOOGLE_ADS_YAML="$GOOGLE_ADS_YAML" google-ads-mcp

# Or run directly (requires Python 3.12+)
pip install -r requirements.txt
python src/main.py
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Health check |
| `/mcp` | MCP protocol endpoint |

## Usage with Claude

### Claude.ai

Add as a remote MCP connector:
- URL: `https://mcp-google-ads.naturalheroes.nl/mcp`

### Claude Code

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "google-ads": {
      "url": "https://mcp-google-ads.naturalheroes.nl/mcp"
    }
  }
}
```

## Example Queries

Once connected, you can ask Claude:

- "List all my Google Ads campaigns"
- "Show me the performance metrics for campaign X"
- "What are the ad groups in campaign Y?"
- "Run a GAQL query to get clicks and impressions for the last 30 days"

## Source

Based on [google-marketing-solutions/google_ads_mcp](https://github.com/google-marketing-solutions/google_ads_mcp) (Apache-2.0 license).

## Notes

- This is not an officially supported Google product
- The server is experimental
- Requires valid Google Ads API credentials
