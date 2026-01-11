# Fibery Plugin for Claude Code

Integrate Claude Code with your Fibery workspace for seamless scrum workflow management.

## Features

- **Sync tasks**: Link your current work to Fibery tasks
- **Create tasks**: Create new Fibery tasks from your coding context
- **Sprint overview**: View current sprint status and tasks
- **PR linking**: Automatically link pull requests to Fibery tasks
- **State sync**: Keep Fibery task states in sync with your development workflow

## Prerequisites

- [Fibery](https://fibery.io) workspace with Scrum space configured
- Fibery API token (create in Fibery Settings → API Tokens)
- `uv` package manager installed (`brew install uv`)
- `fibery-mcp-server` installed (`uv tool install fibery-mcp-server`)

## Installation

1. Clone or copy this plugin to your plugins directory
2. Set environment variables:
   ```bash
   export FIBERY_HOST="your-workspace.fibery.io"
   export FIBERY_API_TOKEN="your-api-token"
   ```
3. Enable the plugin in Claude Code

## Commands

| Command | Description |
|---------|-------------|
| `/fibery:sync-task <id>` | Link current work to a Fibery task |
| `/fibery:create-task <name>` | Create a new task |
| `/fibery:show-sprint` | Display current sprint status |
| `/fibery:update-task <id>` | Update task state or fields |
| `/fibery:link-pr <id>` | Link a PR to a Fibery task |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FIBERY_HOST` | Your Fibery workspace domain (e.g., `company.fibery.io`) | Yes |
| `FIBERY_API_TOKEN` | API token from Fibery settings | Yes |

## Scrum Structure

This plugin is designed for Fibery workspaces with the following hierarchy:

```
Release → Sprint → Story → Task
```

Task states: Backlog, Todo, Doing, In Review, On Hold, Done

## Agent

The **scrum-task-manager** agent proactively:
- Detects task IDs in branch names and commits
- Suggests linking work to Fibery tasks
- Offers state transitions (Todo → Doing → In Review → Done)

Trigger phrases: "sync with Fibery", "update my task", "what's task 262 status?"

## Skill

The **fibery-scrum** skill provides:
- Complete schema knowledge for Scrum entities
- Query patterns for tasks, sprints, stories
- Field mappings and enum values

Auto-activates when discussing Fibery queries or Scrum entities.

## Task ID Convention

The plugin extracts task IDs from:
- Branch names: `feat/262-shopping-cart` → Task 262
- Commit messages: `feat(262): add cart` → Task 262
- PR titles: `fix(262): bug fix` → Task 262

## Development

```bash
# Test locally
claude --plugin-dir ~/Code/fibery-plugin

# Run in project with plugin
cd ~/Code/your-project
claude
```

## License

MIT
