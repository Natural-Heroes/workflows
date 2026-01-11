---
name: Fibery Scrum
description: This skill should be used when the user asks to "work with Fibery", "query Fibery tasks", "create a Fibery task", "update task in Fibery", "show sprint status", "link PR to Fibery", "sync with Fibery", or mentions Fibery Scrum entities (Release, Sprint, Story, Task). Provides knowledge of the Natural Heroes Fibery Scrum schema and query patterns.
version: 0.1.0
---

# Fibery Scrum Integration

Integrate development workflow with Fibery's Scrum project management. This skill provides schema knowledge and query patterns for the Natural Heroes Fibery workspace.

## Scrum Hierarchy

The workspace uses a 4-level hierarchy:

```
Release → Sprint → Story → Task
```

| Entity | Database | Key Fields |
|--------|----------|------------|
| Release | `Scrum/Release` | Name, Release Date, Release Goal |
| Sprint | `Scrum/Sprint` | Name, Date (range), Sprint Goal, Expected/Delivered Points |
| Story | `Scrum/Story` | Name, User Story, Acceptance Criteria, Expected Points |
| Task | `Scrum/Task` | Name, Task ID, DRI, Priority, Task Size, Task Type, PR Link |

## Workflow States

### Release States
- Planning
- Code Freeze
- Dev Release
- QA Complete
- Prod Release

### Sprint/Story States
- Todo
- In Progress
- Done

### Task States
- Backlog
- Todo
- Doing
- In Review
- On Hold
- Done

## Task Enums

| Field | Values |
|-------|--------|
| Priority | Low, Medium, High, Highest |
| Task Size | Tiny Task, Simple, Moderate, Complex, Large, Very Large |
| Task Type | Feature Request, Change Request, Bug |
| Repo | dev-storefront, odoo, architecture, graphiti, misc, mastra |
| Tag | Hotfix, Planned |

## Query Patterns

### Get Active Sprint Tasks

```json
{
  "q_from": "Scrum/Task",
  "q_select": {
    "Name": ["Scrum/Name"],
    "Task ID": ["Scrum/Task ID"],
    "State": ["workflow/state", "enum/name"],
    "DRI": ["Scrum/DRI", "user/name"],
    "Story": ["Scrum/Story", "Scrum/Name"],
    "Sprint": ["Scrum/Story Sprint", "Scrum/Name"]
  },
  "q_where": ["q/and",
    ["!=", ["workflow/state", "workflow/Final"], "$notFinal"],
    ["=", ["Scrum/Story Sprint", "workflow/state", "enum/name"], "$inProgress"]
  ],
  "q_params": {
    "$notFinal": true,
    "$inProgress": "In Progress"
  },
  "q_limit": 50
}
```

### Get Task by ID

```json
{
  "q_from": "Scrum/Task",
  "q_select": {
    "Name": ["Scrum/Name"],
    "Task ID": ["Scrum/Task ID"],
    "Public Id": ["fibery/public-id"],
    "State": ["workflow/state", "enum/name"],
    "DRI": ["Scrum/DRI", "user/name"],
    "Priority": ["Scrum/Priority", "enum/name"],
    "Task Type": ["Scrum/Task Type", "enum/name"],
    "PR Link": ["Scrum/PR link"],
    "Story": ["Scrum/Story", "Scrum/Name"]
  },
  "q_where": ["=", ["Scrum/Task ID"], "$taskId"],
  "q_params": { "$taskId": "123" },
  "q_limit": 1
}
```

### Get Current Sprint

```json
{
  "q_from": "Scrum/Sprint",
  "q_select": {
    "Name": ["Scrum/Name"],
    "State": ["workflow/state", "enum/name"],
    "Expected Points": ["Scrum/Expected Points"],
    "Delivered Points": ["Scrum/Delivered points"],
    "Release": ["Scrum/Release", "Scrum/Name"]
  },
  "q_where": ["=", ["workflow/state", "enum/name"], "$state"],
  "q_params": { "$state": "In Progress" },
  "q_limit": 1
}
```

## Update Patterns

### Update Task State

```json
{
  "database": "Scrum/Task",
  "entity": {
    "fibery/id": "<uuid>",
    "workflow/state": "Doing"
  }
}
```

### Update PR Link

```json
{
  "database": "Scrum/Task",
  "entity": {
    "fibery/id": "<uuid>",
    "Scrum/PR link": "https://github.com/org/repo/pull/123"
  }
}
```

### Create Task

```json
{
  "database": "Scrum/Task",
  "entity": {
    "Scrum/Name": "Task name",
    "Scrum/Task Type": "Feature Request",
    "Scrum/Story": "<story-uuid>",
    "workflow/state": "Todo"
  }
}
```

## Task ID Convention

Tasks use a numeric Task ID field (e.g., `262`, `275`). Extract from:
- Branch names: `feat/262-shopping-cart` → Task ID `262`
- Commit messages: `feat(262): add cart` → Task ID `262`
- PR titles: `feat(262): shopping cart` → Task ID `262`

## GitHub Integration

Tasks link to GitHub Pull Requests via:
- `Scrum/PR link` - Direct URL to PR
- `Scrum/Pull Request` - Linked GitHub/Pull Request entity
- `Scrum/PR State` - PR status text

## Additional Resources

### Reference Files

For detailed query examples and field mappings:
- **`references/schema.md`** - Complete field definitions for all Scrum entities
- **`references/queries.md`** - Additional query patterns and examples

### Examples

Working query examples in `examples/`:
- **`get-sprint-tasks.json`** - Query for sprint tasks
- **`update-task.json`** - Update task fields
