# Coding Conventions

**Analysis Date:** 2026-01-17

## File Naming

**Kebab-case for files and directories:**
- Commands: `create-task.md`, `show-sprint.md`, `sync-task.md`
- Agents: `scrum-task-manager.md`
- Skills: `fibery-scrum/`, `shopify-cli/`
- Workflows: `bugbot-review.yml`, `bugbot-fix.yml`
- Plugins: `fibery/`, `shopify/`, `nh-odoo/`

**Special directories:**
- `.claude-plugin/` - Plugin metadata
- `.github/workflows/` - GitHub Actions

**Odoo-specific (from nh-odoo plugin):**
- Module names: `snake_case` (e.g., `cosmetic_formulation`)
- Model names: `dotted.lowercase` (e.g., `cosmetic.formula`)

## YAML Frontmatter

All commands, skills, and agents use YAML frontmatter:

```yaml
---
name: command-name
description: Clear description of purpose
allowed-tools:
  - tool_name
  - AnotherTool
argument-hint: "[--flag=value]"
---
```

**Agent frontmatter includes:**
- `model: haiku` - Model selection
- `tools:` - Available tools list

**Skill frontmatter includes:**
- `version: 0.x.0` - Semantic version

## Plugin Configuration

**plugin.json structure:**
```json
{
  "name": "plugin-name",
  "version": "0.1.0",
  "description": "Purpose",
  "author": {
    "name": "Natural Heroes",
    "email": "nevil@naturalheroes.nl"
  },
  "keywords": ["tag1", "tag2"]
}
```

**MCP configuration (.mcp.json):**
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@package/name@latest"],
      "env": { "VAR": "value" }
    }
  }
}
```

HTTP MCP servers:
```json
{
  "type": "http",
  "url": "https://endpoint.example.com/api/mcp"
}
```

## Commit Convention

Follows [Conventional Commits](https://www.conventionalcommits.org/) per `CLAUDE.md`:

```
<type>(<task-id>): <description>

[optional body]
[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**Examples from git history:**
- `feat(000): upgrade bugbot workflows to GPT-5.2-Codex`
- `fix: use http transport for storefront MCP servers`
- `docs: add Claude Code marketplace to README`

## Task ID Extraction

Task IDs extracted consistently across Fibery plugin:

**Branch patterns:**
- `feat/262-shopping-cart` → Task 262
- `fix/456-bug-name` → Task 456

**Commit patterns:**
- `feat(262): add cart` → Task 262
- `[262] message` → Task 262

## Documentation Structure

**README.md** - Plugin overview:
- Features (bulleted list)
- Installation instructions
- Prerequisites
- Usage examples

**SKILL.md** - Skill documentation:
- YAML frontmatter with metadata
- When skill triggers
- Complete reference (schemas, patterns)
- Code examples in JSON

**CLAUDE.md** - Project/plugin instructions:
- Git workflow rules
- Module structure
- Environment setup

**Command files** - In `commands/`:
- YAML frontmatter
- Step-by-step process
- JSON examples
- Output format

## API Query Patterns

Fibery MCP queries use consistent JSON structure:

```json
{
  "q_from": "Database/Entity",
  "q_select": { "AliasName": ["path", "to", "field"] },
  "q_where": ["operator", ["field"], "$param"],
  "q_params": { "$param": "value" },
  "q_limit": 50
}
```

## Version Scheme

- Plugin versions: SemVer `major.minor.patch` (e.g., `0.1.0`)
- Odoo modules: `{odoo}.{major}.{minor}.{patch}` (e.g., `19.0.1.0.3`)

## Author Metadata

All plugins use consistent author:
```json
"author": {
  "name": "Natural Heroes",
  "email": "nevil@naturalheroes.nl"
}
```

---

*Conventions analysis: 2026-01-17*
*Update when conventions change*
