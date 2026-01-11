# Workflows - Reusable GitHub Actions

Central repository for reusable GitHub Actions workflows.

## Available Workflows

### opencode
General-purpose AI coding assistant using Claude.

| Workflow | Trigger | Secret |
|----------|---------|--------|
| `opencode.yml` | `/oc` or `/opencode` in comments | `ANTHROPIC_API_KEY` |

### bugbot
Automated PR bug detection and fixing using GPT-5.2.

| Workflow | Trigger | Secret |
|----------|---------|--------|
| `bugbot-review.yml` | PR opened/updated | `OPENAI_API_KEY` |
| `bugbot-fix.yml` | `/fix` reply to bug comment | `OPENAI_API_KEY` |

## Usage

1. Copy the caller workflow from the appropriate folder to your repo's `.github/workflows/`
2. Replace `YOUR_USERNAME` with your GitHub username or org
3. Add required secrets to your repo

## Structure

```
workflows/
├── .github/workflows/     # Reusable workflow definitions
│   ├── opencode.yml
│   ├── bugbot-review.yml
│   └── bugbot-fix.yml
├── opencode/              # Caller templates for opencode
│   └── opencode.yml
└── bugbot/                # Caller templates for bugbot
    ├── bugbot-review.yml
    └── bugbot-fix.yml
```
