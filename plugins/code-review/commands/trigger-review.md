---
allowed-tools: [Bash, Read, WebFetch]
description: Manually trigger a code review on the current branch
---

# Trigger Review

Manually trigger a code review on the current branch.

## Instructions

1. Get the current repository and branch information:
   ```bash
   git remote get-url origin
   git branch --show-current
   ```

2. Check if there's an open PR for this branch:
   ```bash
   gh pr view --json number,url,state 2>/dev/null || echo "NO_PR"
   ```

3. If there's an open PR:
   - Note the PR number
   - Inform the user that a review will be triggered via the webhook

4. If there's no open PR:
   - Ask if the user wants to create one
   - If yes, help them create a draft PR

5. To trigger the review webhook manually (if needed):
   - The webhook endpoint is configured in the GitHub App
   - Reviews are automatically triggered on PR open/sync events
   - For manual trigger, user can re-push or use the GitHub UI to re-request review

## Notes

- Reviews are automatically triggered when PRs are opened or updated
- The `/fix` command can be used in review comments to auto-fix issues
- Full codebase context is used for intelligent reviews
