# Workflows Repository

Central repository for reusable GitHub Actions workflows.

## Structure

- `.github/workflows/` - Reusable workflow definitions (called by other repos)
- `bugbot/` - Caller templates for bugbot (GPT-based bug detection & fixing)

## Bugbot Workflows

| Workflow | Trigger | Provider |
|----------|---------|----------|
| `bugbot-review.yml` | PR opened/updated | OpenAI GPT-5.2-Codex |
| `bugbot-fix.yml` | `/fix` reply to bug comment | OpenAI GPT-5.2-Codex |

## Adding New Workflows

1. Create the reusable workflow in `.github/workflows/` with `workflow_call` trigger
2. Create a caller template in the appropriate folder (or create new folder for new group)
3. Update README.md with usage instructions
