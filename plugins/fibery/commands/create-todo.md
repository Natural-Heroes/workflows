---
name: create-todo
description: Create a general Fibery todo (not sprint-related)
allowed-tools:
  - mcp__fibery__query_database
  - mcp__fibery__create_entity
  - mcp__fibery__describe_database
  - AskUserQuestion
argument-hint: "<name> [--priority=low|medium|high|highest] [--deadline=<date>]"
---

# Create Todo Command

Create a general todo in Fibery databases/Todo for non-sprint work (operations, meetings, marketing, etc).

## When to Use

Use `/create-todo` for:
- Meeting action items
- Marketing tasks
- Operations tasks
- R&D / formula work
- Ad-hoc tasks not tied to sprints

Use `/create-task` instead for sprint development work, bugs, and features.

## Process

1. Parse arguments:
   - `<name>`: Todo title (required)
   - `--priority=low|medium|high|highest`: Priority level (default: medium)
   - `--deadline=<date>`: Due date in ISO format or natural language

2. Map priority argument to enum:
   - `low` → "Low"
   - `medium` → "Medium"
   - `high` → "High"
   - `highest` → "Highest"

3. Create the todo using `mcp__fibery__create_entity`:
   ```json
   {
     "database": "Fibery databases/Todo",
     "entity": {
       "Fibery databases/name": "<todo-name>",
       "Fibery databases/Priority": "<mapped-priority>",
       "workflow/state": "Todo"
     }
   }
   ```

4. If deadline provided, include it:
   ```json
   "Fibery databases/Deadline": "<iso-datetime>"
   ```

5. Query the created todo to get its Public ID

6. Display result with Fibery link

## Output Format

```
Created Todo #42: Review Q1 marketing plan
Priority: High
State: Todo
Deadline: 2026-01-15

Link: https://naturalheroes.fibery.io/Fibery_databases/Todo/42
```

## Available Fields

Reference schema.md for full field list. Key fields:
- Name, State, Priority, Deadline
- DRI (assigned user)
- Tags (R&D, Marketing, Operations, etc)
- Story Points, Hours Expected
- Project Phase, Key Result (OKR link)

## Tips

- Use natural language dates like "next Friday" or "in 2 weeks"
- Add `--assign=<user>` to set DRI if needed
- Tags can be added after creation via Fibery UI
