---
name: link-pr
description: Link a GitHub PR to a Fibery task
allowed-tools:
  - mcp__fibery__query_database
  - mcp__fibery__update_entity
  - Bash
argument-hint: "<task-id> [--pr=<number>]"
---

# Link PR Command

Link a GitHub Pull Request to a Fibery task.

## Process

1. Parse arguments:
   - `<task-id>`: Fibery Task ID (required, numeric)
   - `--pr=<number>`: PR number (optional, auto-detects from current branch)

2. If no PR specified, detect from current branch:
   ```bash
   gh pr view --json number,url,title,state 2>/dev/null
   ```

3. Query task to get UUID:
   ```json
   {
     "q_from": "Scrum/Task",
     "q_select": {
       "ID": ["fibery/id"],
       "Name": ["Scrum/Name"],
       "Task ID": ["Scrum/Task ID"],
       "State": ["workflow/state", "enum/name"],
       "PR Link": ["Scrum/PR link"]
     },
     "q_where": ["=", ["Scrum/Task ID"], "$taskId"],
     "q_params": { "$taskId": "<task-id>" },
     "q_limit": 1
   }
   ```

4. Get PR URL:
   - If `--pr` specified: `gh pr view <number> --json url -q .url`
   - Otherwise use detected PR URL

5. Update task with PR link:
   ```json
   {
     "database": "Scrum/Task",
     "entity": {
       "fibery/id": "<task-uuid>",
       "Scrum/PR link": "<pr-url>"
     }
   }
   ```

6. Optionally update task state to "In Review" if PR is open

## Output Format

```
Task #262: Add e2e tests + components
Linked PR: #42 - Add e2e tests for cart
URL: https://github.com/natural-heroes/dev-storefront/pull/42
State: Doing → In Review
```

## Auto-Detection

When run without arguments, attempt to:
1. Extract task ID from branch name (e.g., `feat/262-feature` → 262)
2. Get current PR from `gh pr view`
3. Link them together

Example:
```
/fibery:link-pr
# Auto-detects task 262 from branch feat/262-cart
# Auto-detects PR #42 from current branch
```
