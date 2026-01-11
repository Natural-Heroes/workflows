# Workflows - Reusable GitHub Actions

Central repository for reusable GitHub Actions workflows.

## Bugbot

Automated PR bug detection and fixing using GPT-5.2.

| Workflow | Trigger | Secret |
|----------|---------|--------|
| `bugbot-review.yml` | PR opened/updated | `OPENAI_API_KEY` |
| `bugbot-fix.yml` | `/fix` reply to bug comment | `OPENAI_API_KEY` |

### How it works

1. **Open a PR** → bugbot-review scans your code and posts inline comments for bugs
2. **Reply `/fix`** to any bug comment → bugbot-fix automatically fixes and commits

## Usage

1. Copy caller workflows from `bugbot/` to your repo's `.github/workflows/`
2. Replace `YOUR_USERNAME` with `Natural-Heroes`
3. Add `OPENAI_API_KEY` secret to your repo

## Structure

```
workflows/
├── .github/workflows/     # Reusable workflow definitions
│   ├── bugbot-review.yml
│   └── bugbot-fix.yml
└── bugbot/                # Caller templates
    ├── bugbot-review.yml
    └── bugbot-fix.yml
```
