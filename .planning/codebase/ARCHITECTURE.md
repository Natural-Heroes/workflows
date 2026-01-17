# Architecture

**Analysis Date:** 2026-01-17

## Pattern Overview

**Plugin-based Marketplace Architecture** with three main components:

1. **Reusable GitHub Actions Workflows** - Centralized workflow definitions for CI/CD
2. **Claude Code Plugin Marketplace** - Local marketplace for Claude Code plugins
3. **Feature-specific Plugins** - Domain-specific integrations (Fibery, Shopify, Odoo)

## Conceptual Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code IDE                          │
├─────────────────────────────────────────────────────────────┤
│              Plugins Layer (Plugin Marketplace)             │
│  ┌──────────────┬──────────────┬──────────────────────────┐ │
│  │   Fibery     │   Shopify    │    Natural Heroes        │ │
│  │   Plugin     │   Plugin     │    Odoo Plugin           │ │
│  └──────────────┴──────────────┴──────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│           Commands / Agents / Skills Layer                  │
│     (Command definitions, Agent rules, Skill definitions)   │
├─────────────────────────────────────────────────────────────┤
│              MCP Servers Layer (Model Context Protocol)     │
│  ┌──────────────┬──────────────┬──────────────────────────┐ │
│  │   Fibery MCP │ Shopify Dev  │    Context7              │ │
│  │   Server     │   MCP        │    (Odoo Docs)           │ │
│  └──────────────┴──────────────┴──────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│          CI/CD Layer (GitHub Actions Workflows)             │
│         (Reusable workflow definitions and callers)         │
├─────────────────────────────────────────────────────────────┤
│           External Systems (SaaS & APIs)                    │
│  ┌──────────────┬──────────────┬──────────────────────────┐ │
│  │   Fibery     │   Shopify    │    OpenAI / Odoo         │ │
│  │   Workspace  │   Stores     │    Services              │ │
│  └──────────────┴──────────────┴──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

**Bugbot Review Flow:**
```
PR Opened/Updated
    ↓
GitHub Actions triggers bugbot-review.yml
    ↓
Extract PR diff (max 50KB)
    ↓
Send to OpenAI GPT-5.2-Codex
    ↓
Parse bug JSON response
    ↓
Post inline comments on PR
```

**Bugbot Fix Flow:**
```
User replies "/fix" to bug comment
    ↓
GitHub Actions triggers bugbot-fix.yml
    ↓
Extract bug details from parent comment
    ↓
Read affected file content
    ↓
Send to OpenAI for fix generation
    ↓
Commit fixed code to PR branch
```

**Fibery Plugin Flow:**
```
User issues slash command (e.g., /fibery:create-task)
    ↓
Command definition loaded from commands/*.md
    ↓
Fibery MCP Server invoked
    ↓
Fibery API called
    ↓
Response displayed in Claude Code
```

## Key Abstractions

**1. Plugin Architecture**
- **Commands** - Slash commands that execute specific actions (`plugins/*/commands/*.md`)
- **Agents** - Autonomous agents that monitor and suggest actions (`plugins/*/agents/*.md`)
- **Skills** - Knowledge resources providing schema/API knowledge (`plugins/*/skills/**/SKILL.md`)

**2. MCP Server Integration**
- **Local MCP** (via npx/uvx) - Shopify dev tools, Odoo documentation
- **HTTP MCP** - Shopify storefront APIs
- **Query/Update Patterns** - Standardized JSON patterns for database operations

**3. Workflow Patterns**
- **Reusable Workflows** - Defined in `.github/workflows/`, called by other repos
- **Caller Pattern** - Repos copy templates from `bugbot/` and adjust

## Entry Points

| Entry Point | Purpose | File Path |
|-------------|---------|-----------|
| Marketplace | Plugin discovery | `.claude-plugin/marketplace.json` |
| Plugin Registry | Plugin metadata | `plugins/{name}/.claude-plugin/plugin.json` |
| MCP Config | Server configs | `plugins/{name}/.mcp.json` |
| Commands | User-facing CLI | `plugins/{name}/commands/*.md` |
| Agents | Background monitors | `plugins/{name}/agents/*.md` |
| Skills | Contextual knowledge | `plugins/{name}/skills/**/SKILL.md` |
| Workflows | CI/CD definitions | `.github/workflows/*.yml` |

## Module Boundaries

**Fibery Plugin** - Task/story management via Fibery API
**Shopify Plugin** - Ecommerce development via Shopify MCP servers
**Odoo Plugin** - Odoo 19 documentation via Context7 MCP
**Bugbot Workflows** - PR analysis and fixes via OpenAI API

---

*Architecture analysis: 2026-01-17*
*Update when architectural patterns change*
