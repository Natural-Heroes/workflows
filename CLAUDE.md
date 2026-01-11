# Workflows Repository

This repository contains reusable GitHub Actions workflows.

## Structure

- `.github/workflows/` - Reusable workflow definitions (called by other repos)
- `examples/` - Caller workflow templates to copy into consuming repos

## Workflows

| Workflow | Trigger | Secret |
|----------|---------|--------|
| `opencode-fix-bug.yml` | `/fix` command on PR review comments | `OPENAI_API_KEY` |
| `opencode-pr-review.yml` | PR opened/updated | `OPENAI_API_KEY` |
| `opencode.yml` | `/oc` or `/opencode` commands | `ANTHROPIC_API_KEY` |

## Adding New Workflows

1. Create the reusable workflow in `.github/workflows/` with `workflow_call` trigger
2. Create a caller template in `examples/`
3. Update README.md with usage instructions
