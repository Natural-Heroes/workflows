# Technology Stack

**Analysis Date:** 2026-01-17

## Languages

**Primary:**
- YAML - GitHub Actions workflows, plugin frontmatter (`.github/workflows/*.yml`, `plugins/*/*.md`)
- Markdown - Documentation, skills, commands, agents (`*.md` throughout)
- JSON - Configuration and metadata (`plugin.json`, `.mcp.json`, `marketplace.json`)

**Secondary:**
- Bash - Shell scripting in GitHub Actions workflows (`.github/workflows/bugbot-*.yml`)

## Runtime

**Environment:**
- GitHub Actions - Primary execution environment for automated workflows
- Node.js 18+ - Required for Shopify CLI and MCP servers (`plugins/shopify/README.md`)
- Python/uvx - Required for Context7 MCP and Fibery MCP servers (`plugins/nh-odoo/.mcp.json`)

**Package Manager:**
- npm - Node packages via npx (Shopify Dev MCP)
- uvx - Python packages for MCP servers (Fibery, Context7)
- No lockfiles - Configuration-driven repository

## Frameworks

**Core:**
- Claude Code Plugin System - Plugin architecture for Claude IDE
- Model Context Protocol (MCP) - Server-client architecture for AI tool integration
- GitHub Actions - CI/CD automation framework

**MCP Servers:**
- Shopify Dev MCP (`@shopify/dev-mcp`) - GraphQL schema, Liquid validation
- Fibery MCP Server (`fibery-mcp-server`) - Project management API
- Context7 MCP Server (`mcp-server-context7`) - Documentation lookup

**Build/Dev:**
- actions/checkout@v4 - Repository checkout
- actions/github-script@v7 - GitHub API scripting

## Key Dependencies

**Critical:**
- OpenAI GPT-5.2-Codex - AI model for bug detection/fixing (`.github/workflows/bugbot-*.yml`)
- Fibery API - Project management integration (`plugins/fibery/`)
- Shopify APIs - Ecommerce development (`plugins/shopify/`)

**Infrastructure:**
- GitHub REST API - PR comments, reactions, code operations
- Shopify Storefront MCP - Dev and prod store access via HTTP

## Configuration

**Environment:**
- `OPENAI_API_KEY` - GitHub secret for bugbot workflows
- `FIBERY_HOST` - Fibery workspace domain
- `FIBERY_API_TOKEN` - Fibery API authentication
- `LIQUID_VALIDATION_MODE` - Shopify Liquid validation setting

**Build:**
- `.mcp.json` - MCP server configuration per plugin
- `plugin.json` - Claude Code plugin metadata
- `marketplace.json` - Plugin registry (`.claude-plugin/`)

## Platform Requirements

**Development:**
- Any platform with Node.js 18+ and Python (uvx)
- SSH access for Odoo production (optional)

**Production:**
- GitHub Actions runners (ubuntu-latest)
- Shopify Partner account for MCP access
- Fibery workspace with Scrum space configured

---

*Stack analysis: 2026-01-17*
*Update after major dependency changes*
