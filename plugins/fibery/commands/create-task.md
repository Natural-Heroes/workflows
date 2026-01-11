---
name: create-task
description: Create a new Fibery task from current context
allowed-tools:
  - mcp__fibery__query_database
  - mcp__fibery__create_entity
  - Bash
  - Read
  - AskUserQuestion
argument-hint: "<name> [--story=<id>] [--type=feature|bug|change]"
---

# Create Task Command

Create a new task in Fibery Scrum from the current development context.

## Process

1. Parse arguments:
   - `<name>`: Task name (required)
   - `--story=<id>`: Story public ID to attach to (optional)
   - `--type=feature|bug|change`: Task type (default: feature)

2. If no story specified, query active sprint stories:
   ```json
   {
     "q_from": "Scrum/Story",
     "q_select": {
       "ID": ["fibery/id"],
       "Public ID": ["fibery/public-id"],
       "Name": ["Scrum/Name"],
       "Sprint": ["Scrum/Sprint", "Scrum/Name"]
     },
     "q_where": ["=", ["Scrum/Sprint", "workflow/state", "enum/name"], "$state"],
     "q_params": { "$state": "In Progress" },
     "q_limit": 20
   }
   ```
   Present stories and ask user to select one.

3. Map task type argument to enum:
   - `feature` → "Feature Request"
   - `bug` → "Bug"
   - `change` → "Change Request"

4. Create the task using `mcp__fibery__create_entity`:
   ```json
   {
     "database": "Scrum/Task",
     "entity": {
       "Scrum/Name": "<task-name>",
       "Scrum/Task Type": "<mapped-type>",
       "Scrum/Story": "<story-uuid>",
       "workflow/state": "Todo"
     }
   }
   ```

5. Query the created task to get its Task ID

6. Display result with Fibery link

## Output Format

```
Created Task #287: Fix checkout validation
Type: Bug
Story: Checkout Flow
Sprint: Sprint 23
State: Todo

Link: https://naturalheroes.fibery.io/Scrum/Task/287
```

## Tips

- Detect repo from current directory to suggest Repo field
- If creating from a bug report, extract details for description fields
