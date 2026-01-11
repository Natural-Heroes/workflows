---
name: update-task
description: Update a Fibery task's state or fields
allowed-tools:
  - mcp__fibery__query_database
  - mcp__fibery__update_entity
  - AskUserQuestion
argument-hint: "<task-id> [--state=<state>] [--dri=<name>]"
---

# Update Task Command

Update a Fibery task's state, DRI, or other fields.

## Process

1. Parse arguments:
   - `<task-id>`: Task ID (required, numeric)
   - `--state=<state>`: New state (optional)
   - `--dri=<name>`: Assign to user (optional)

2. Query task to get current values and UUID:
   ```json
   {
     "q_from": "Scrum/Task",
     "q_select": {
       "ID": ["fibery/id"],
       "Name": ["Scrum/Name"],
       "Task ID": ["Scrum/Task ID"],
       "State": ["workflow/state", "enum/name"],
       "DRI": ["Scrum/DRI", "user/name"]
     },
     "q_where": ["=", ["Scrum/Task ID"], "$taskId"],
     "q_params": { "$taskId": "<task-id>" },
     "q_limit": 1
   }
   ```

3. If no update flags provided, ask what to update using AskUserQuestion

4. Map state argument to valid state:
   - `backlog` → "Backlog"
   - `todo` → "Todo"
   - `doing` → "Doing"
   - `review` → "In Review"
   - `hold` → "On Hold"
   - `done` → "Done"

5. If DRI specified, query users to find UUID:
   ```json
   {
     "q_from": "fibery/user",
     "q_select": {
       "ID": ["fibery/id"],
       "Name": ["user/name"]
     },
     "q_where": ["q/contains", ["user/name"], "$name"],
     "q_params": { "$name": "<dri-name>" },
     "q_limit": 5
   }
   ```

6. Update task using `mcp__fibery__update_entity`:
   ```json
   {
     "database": "Scrum/Task",
     "entity": {
       "fibery/id": "<task-uuid>",
       "workflow/state": "<new-state>",
       "Scrum/DRI": "<user-uuid>"
     }
   }
   ```

## Output Format

```
Task #262: Add e2e tests + components
Updated:
  State: Todo → Doing
  DRI: - → Gowtham
```

## State Shortcuts

Accept lowercase shortcuts for states:
- `backlog`, `todo`, `doing`, `review`, `hold`, `done`
