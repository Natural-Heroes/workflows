---
name: sync-task
description: Link current work to a Fibery task by Task ID
allowed-tools:
  - mcp__fibery__query_database
  - mcp__fibery__update_entity
  - Bash
  - Read
argument-hint: "<task-id>"
---

# Sync Task Command

Link the current development work to a Fibery Scrum task.

## Process

1. Parse the task ID from arguments (numeric, e.g., `262`)
2. Query Fibery for the task using `mcp__fibery__query_database`:
   ```json
   {
     "q_from": "Scrum/Task",
     "q_select": {
       "ID": ["fibery/id"],
       "Name": ["Scrum/Name"],
       "Task ID": ["Scrum/Task ID"],
       "State": ["workflow/state", "enum/name"],
       "DRI": ["Scrum/DRI", "user/name"],
       "Story": ["Scrum/Story", "Scrum/Name"],
       "Sprint": ["Scrum/Story Sprint", "Scrum/Name"]
     },
     "q_where": ["=", ["Scrum/Task ID"], "$taskId"],
     "q_params": { "$taskId": "<task-id>" },
     "q_limit": 1
   }
   ```
3. Display task details to user
4. Get current git branch name with `git branch --show-current`
5. If branch contains task ID, confirm linkage
6. Offer to update task state to "Doing" if currently "Todo" or "Backlog"

## Output Format

```
Task #262: Add shopping cart functionality
Story: E-commerce Features
Sprint: Sprint 23 (In Progress)
State: Todo → Doing (updated)
DRI: Gowtham

Linked to branch: feat/262-shopping-cart
```

## Error Handling

- If task not found, suggest checking the Task ID
- If Fibery connection fails, check FIBERY_HOST and FIBERY_API_TOKEN env vars
