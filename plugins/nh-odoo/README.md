# Natural Heroes Odoo Plugin

Claude Code plugin for working with the Natural Heroes Odoo instance.

## Features

- **Odoo 19 Documentation** - Context7 MCP server for up-to-date Odoo 19 docs
- **Production Reference** - Quick access to prod URL, SSH commands, and MCP endpoints
- **Development Guide** - Local docker commands and module structure conventions

## MCP Servers

| Server | Purpose |
|--------|---------|
| `context7` | Odoo 19 documentation lookup |

## Usage

### Odoo Documentation

Ask Claude about Odoo 19 features and it will use Context7 to look up current documentation:

- "How do I create a wizard in Odoo 19?"
- "What are the ORM methods available in Odoo 19?"
- "How do security groups work in Odoo?"

### Production Access

The plugin provides reference info for:
- Production URL: https://odoo.naturalheroes.nl
- SSH access for database queries
- MCP server endpoints

## Prerequisites

- `uvx` installed (for Context7 MCP server)
