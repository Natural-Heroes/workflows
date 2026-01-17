---
allowed-tools: [Bash, Read, WebFetch]
description: Check the status of recent code reviews for the current repository
---

# Review Status

Check the status of recent code reviews for the current repository.

## Instructions

1. Get the current repository information:
   ```bash
   git remote get-url origin
   ```

2. Extract owner and repo from the git remote URL

3. Check for any open PRs with review comments:
   ```bash
   gh pr list --json number,title,state,reviews,comments --limit 5
   ```

4. For each PR, show:
   - PR number and title
   - Number of review comments from the bug bot
   - Status of any fixes (committed or pending)

5. Format the output as a summary table

## Expected Output

Present a summary showing:
- Recent PRs and their review status
- Number of issues found per PR
- Whether fixes have been applied
