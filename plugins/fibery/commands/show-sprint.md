---
name: show-sprint
description: Display current sprint status and tasks
allowed-tools:
  - mcp__fibery__query_database
argument-hint: "[--sprint=<name>]"
---

# Show Sprint Command

Display the current sprint's status, stories, and tasks.

## Process

1. Parse arguments:
   - `--sprint=<name>`: Specific sprint name (optional, defaults to "In Progress" sprint)

2. Query sprint details:
   ```json
   {
     "q_from": "Scrum/Sprint",
     "q_select": {
       "ID": ["fibery/id"],
       "Name": ["Scrum/Name"],
       "State": ["workflow/state", "enum/name"],
       "Expected Points": ["Scrum/Expected Points"],
       "Delivered Points": ["Scrum/Delivered points"],
       "Delivery Rate": ["Scrum/Delivery Rate"],
       "Release": ["Scrum/Release", "Scrum/Name"]
     },
     "q_where": ["=", ["workflow/state", "enum/name"], "$state"],
     "q_params": { "$state": "In Progress" },
     "q_limit": 1
   }
   ```

3. Query sprint tasks grouped by state:
   ```json
   {
     "q_from": "Scrum/Task",
     "q_select": {
       "Task ID": ["Scrum/Task ID"],
       "Name": ["Scrum/Name"],
       "State": ["workflow/state", "enum/name"],
       "DRI": ["Scrum/DRI", "user/name"],
       "Priority": ["Scrum/Priority", "enum/name"],
       "Story": ["Scrum/Story", "Scrum/Name"]
     },
     "q_where": ["=", ["Scrum/Story Sprint", "Scrum/Name"], "$sprintName"],
     "q_params": { "$sprintName": "<sprint-name>" },
     "q_order_by": {"workflow/state": "q/asc"},
     "q_limit": 100
   }
   ```

4. Group tasks by state and display

## Output Format

```
Sprint: Upgrade NextJS - sprint 2
Release: Upgrade NextJS
Progress: 12/28 points (43%)

Stories:
├─ Create the Next.js 16 baseline project (Todo)
├─ Context Migration (Todo)
├─ PDP Components migration (Todo)
└─ Testing & deployment (Todo)

Tasks by State:
─────────────────────────────────────────
DOING (2)
  #262 Add e2e tests + components     Gowtham
  #271 Search page + box              Rahul

TODO (3)
  #272 Cart page                      Rahul
  #275 Blogs and general pages        Rahul
  #280 Header component               -

DONE (5)
  #232 Solve lint issues              Rahul
  #248 Fix storyblok videos           Gowtham
  ...
```

## Tips

- Highlight tasks assigned to current user if detectable
- Show overdue indicator if sprint end date passed
