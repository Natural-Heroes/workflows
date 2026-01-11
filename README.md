# Open Code - Reusable GitHub Workflows

Central repository for reusable GitHub Actions workflows.

## Available Workflows

| Workflow | Description | Required Secret |
|----------|-------------|-----------------|
| `opencode-fix-bug.yml` | Auto-fix bugs via `/fix` command on PR review comments | `OPENAI_API_KEY` |
| `opencode-pr-review.yml` | AI-powered PR code review for bugs | `OPENAI_API_KEY` |
| `opencode.yml` | Run opencode via `/oc` or `/opencode` commands | `ANTHROPIC_API_KEY` |

## Usage

1. **Push this repo to GitHub** (e.g., `your-username/open-code`)

2. **Copy the caller workflow** from `examples/` to your target repo's `.github/workflows/`

3. **Replace `YOUR_USERNAME`** with your GitHub username or org

4. **Add required secrets** to your target repo (Settings > Secrets > Actions)

## Example

In your target repo, create `.github/workflows/opencode-fix-bug.yml`:

```yaml
name: opencode-fix-bug

on:
  pull_request_review_comment:
    types: [created]

jobs:
  fix-bug:
    uses: your-username/open-code/.github/workflows/opencode-fix-bug.yml@main
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Updating

Changes to workflows in this repo automatically propagate to all repos using `@main`. Pin to a specific commit or tag for stability:

```yaml
uses: your-username/open-code/.github/workflows/opencode-fix-bug.yml@v1.0.0
```
