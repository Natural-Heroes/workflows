**New: Bugbot - Automated PR Bug Detection & Fixing**

Moved our bugbot workflows to a central repo: `Natural-Heroes/workflows`

**How it works:**
- Open a PR → `bugbot-review` scans your code with GPT-5.2 and posts inline comments for bugs (with severity levels)
- Reply `/fix` to any bug comment → `bugbot-fix` automatically fixes the code and commits to your branch

**Setup for your repo:**
1. Copy caller workflows from `workflows/bugbot/` to your repo's `.github/workflows/`
2. Add secret: `OPENAI_API_KEY`

Updates to the central repo automatically apply to all connected repos.
