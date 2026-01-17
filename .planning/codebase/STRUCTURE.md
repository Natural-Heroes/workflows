# Directory Structure

**Analysis Date:** 2026-01-17

## Root Layout

```
workflows/
├── .claude-plugin/
│   └── marketplace.json         # Local plugin marketplace config
├── .github/
│   └── workflows/
│       ├── bugbot-review.yml    # Reusable PR review workflow
│       └── bugbot-fix.yml       # Reusable fix workflow
├── .planning/
│   └── codebase/                # Codebase documentation (this folder)
├── bugbot/
│   ├── bugbot-review.yml        # Caller template for review
│   └── bugbot-fix.yml           # Caller template for fix
├── plugins/
│   ├── fibery/                  # Fibery integration plugin
│   ├── shopify/                 # Shopify development plugin
│   └── nh-odoo/                 # Odoo integration plugin
├── CLAUDE.md                    # Project-level instructions
└── README.md                    # Repository documentation
```

## Plugin Structure Pattern

Each plugin follows this consistent structure:

```
plugins/{plugin-name}/
├── .claude-plugin/
│   └── plugin.json              # Plugin metadata (name, version, author)
├── .mcp.json                    # MCP server configurations
├── README.md                    # Plugin documentation
├── commands/                    # Slash commands (user-facing)
│   └── {command-name}.md
├── agents/                      # Autonomous agents (optional)
│   └── {agent-name}.md
├── skills/                      # Skills (contextual knowledge)
│   └── {skill-name}/
│       ├── SKILL.md             # Skill definition
│       ├── references/          # Reference documentation (optional)
│       └── examples/            # Example queries (optional)
└── CLAUDE.md                    # Plugin-specific instructions (optional)
```

## Key Locations

| Purpose | Location |
|---------|----------|
| Marketplace config | `.claude-plugin/marketplace.json` |
| Reusable workflows | `.github/workflows/*.yml` |
| Workflow caller templates | `bugbot/*.yml` |
| Plugin manifests | `plugins/*/.claude-plugin/plugin.json` |
| MCP configurations | `plugins/*/.mcp.json` |
| Command definitions | `plugins/*/commands/*.md` |
| Agent definitions | `plugins/*/agents/*.md` |
| Skill definitions | `plugins/*/skills/*/SKILL.md` |
| Project instructions | `CLAUDE.md` |

## Plugin Details

### Fibery Plugin (`plugins/fibery/`)

```
fibery/
├── .claude-plugin/plugin.json   # v0.1.0, productivity category
├── README.md                    # Setup and usage docs
├── commands/
│   ├── create-task.md           # Create sprint task
│   ├── create-todo.md           # Create general todo
│   ├── update-task.md           # Update task state/fields
│   ├── sync-task.md             # Link work to task
│   ├── link-pr.md               # Link PR to task
│   └── show-sprint.md           # Display sprint status
├── agents/
│   └── scrum-task-manager.md    # Task state sync agent
└── skills/
    └── fibery-scrum/
        ├── SKILL.md             # Schema and query patterns
        ├── references/
        │   └── schema.md        # Complete field definitions
        └── examples/
            ├── get-sprint-tasks.json
            └── update-task.json
```

### Shopify Plugin (`plugins/shopify/`)

```
shopify/
├── .claude-plugin/plugin.json   # v0.1.0, development category
├── .mcp.json                    # 3 MCP servers (dev, storefront-dev, storefront-prod)
├── README.md                    # Plugin documentation
└── skills/
    └── shopify-cli/
        └── SKILL.md             # CLI command reference (232 lines)
```

### Odoo Plugin (`plugins/nh-odoo/`)

```
nh-odoo/
├── .claude-plugin/plugin.json   # v0.1.0, development category
├── .mcp.json                    # Context7 MCP for Odoo docs
├── README.md                    # Plugin documentation
└── CLAUDE.md                    # Production reference, SSH commands, local dev
```

## Configuration Files

| File | Purpose |
|------|---------|
| `plugin.json` | Plugin name, version, author, keywords |
| `.mcp.json` | MCP server definitions (command/http type) |
| `marketplace.json` | Plugin registry for discovery |
| `CLAUDE.md` | Claude Code instructions (project/plugin level) |

## File Counts

- Total markdown files: ~16 files, 1,725 lines
- Largest files:
  - `plugins/fibery/skills/fibery-scrum/SKILL.md` - 275 lines
  - `plugins/shopify/skills/shopify-cli/SKILL.md` - 232 lines
- Workflows: 2 reusable + 2 caller templates

---

*Structure analysis: 2026-01-17*
*Update when directory organization changes*
