# Shopify Plugin

Shopify development toolkit for Claude Code with MCP integrations and CLI guidance.

## Features

- **Shopify Dev MCP** - Documentation search, GraphQL schema introspection, Liquid validation
- **Storefront MCP (Dev)** - Access dev store data via MCP
- **Storefront MCP (Prod)** - Access production store data via MCP
- **Shopify CLI Skill** - Guidance for theme and app development commands

## Installation

Add via marketplace:

```bash
/plugin marketplace add Natural-Heroes/workflows
/plugin install shopify
```

Or install directly:

```bash
/plugin install Natural-Heroes/workflows/plugins/shopify
```

## MCP Servers

### shopify-dev-mcp

Local MCP server for Shopify development:
- Search Shopify documentation
- Introspect GraphQL schemas (Admin, Storefront, Partner APIs)
- Validate Liquid templates
- Get code examples and best practices

**No authentication required** - runs locally via npx.

### storefront-dev

SSE MCP server for dev store: `dev-test-202050947.myshopify.com`

Access storefront data including products, collections, and cart operations.

### storefront-prod

SSE MCP server for production store: `natural-heroes-nl.myshopify.com`

Access production storefront data.

## Prerequisites

- Node.js 18+
- Shopify CLI (`npm install -g @shopify/cli @shopify/theme`)

## Usage

### Using MCP Tools

After installing the plugin, MCP tools are available automatically. Use `/mcp` to see available servers and tools.

Example queries:
- "Search Shopify docs for webhook best practices"
- "Show me the GraphQL schema for products"
- "Validate my Liquid template"
- "Get products from the dev store"

### Shopify CLI Skill

The skill activates when asking about Shopify CLI commands:
- "How do I start theme development?"
- "Push my theme to the store"
- "Create a new Shopify app"
- "Run theme check"

## Configuration

### Changing Store Domains

Edit `.mcp.json` in the plugin directory to update store domains:

```json
{
  "mcpServers": {
    "storefront-dev": {
      "type": "sse",
      "url": "https://YOUR-DEV-STORE.myshopify.com/api/mcp"
    },
    "storefront-prod": {
      "type": "sse",
      "url": "https://YOUR-PROD-STORE.myshopify.com/api/mcp"
    }
  }
}
```

## Related Documentation

- [Shopify Dev MCP](https://shopify.dev/docs/apps/build/devmcp)
- [Storefront MCP](https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront)
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli)
