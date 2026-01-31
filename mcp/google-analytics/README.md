# Google Analytics MCP Server (HTTP)

HTTP wrapper for [Google's official analytics-mcp](https://github.com/googleanalytics/google-analytics-mcp) package, enabling remote access from Claude.ai and other MCP clients.

## Features

All tools from the official Google Analytics MCP package:
- GA4 reporting and analytics
- Real-time data access
- Custom event tracking

## Deployment

This server is deployed on Dokploy at:
```
https://mcp-google-analytics.naturalheroes.nl
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `GOOGLE_CREDENTIALS_JSON` | Yes | Service account JSON credentials |
| `GOOGLE_PROJECT_ID` | No | Default GA4 property ID |

## Local Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up credentials
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Run server
python src/main.py
```

## Docker

```bash
# Build
docker build -t google-analytics-mcp .

# Run
docker run -p 3001:3001 \
  -e GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}' \
  google-analytics-mcp
```

## Usage with Claude

Add as a remote MCP server in Claude settings:
```
URL: https://mcp-google-analytics.naturalheroes.nl/mcp
```

## Health Check

```bash
curl https://mcp-google-analytics.naturalheroes.nl/health
```
