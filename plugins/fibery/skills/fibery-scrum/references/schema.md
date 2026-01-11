# Fibery Scrum Schema Reference

Complete field definitions for all Scrum entities.

## Scrum/Task

| Field | API Path | Type | Notes |
|-------|----------|------|-------|
| ID | `fibery/id` | uuid | Internal UUID |
| Public ID | `fibery/public-id` | text | Short ID |
| Name | `Scrum/Name` | text | Task title |
| Task ID | `Scrum/Task ID` | text | Numeric task identifier |
| State | `workflow/state` | enum | Backlog, Todo, Doing, In Review, On Hold, Done |
| DRI | `Scrum/DRI` | user | Assigned user |
| Priority | `Scrum/Priority` | enum | Low, Medium, High, Highest |
| Task Size | `Scrum/Task Size` | enum | Tiny Task, Simple, Moderate, Complex, Large, Very Large |
| Task Type | `Scrum/Task Type` | enum | Feature Request, Change Request, Bug |
| Repo | `Scrum/Repo` | enum | dev-storefront, odoo, architecture, graphiti, misc, mastra |
| Tag | `Scrum/Tag` | enum | Hotfix, Planned |
| Story | `Scrum/Story` | relation | Parent Story |
| Story Sprint | `Scrum/Story Sprint` | relation | Sprint via Story |
| PR Link | `Scrum/PR link` | text | GitHub PR URL |
| PR State | `Scrum/PR State` | text | PR status |
| Pull Request | `Scrum/Pull Request` | relation | GitHub/Pull Request entity |
| Expected Points | `Scrum/Expected Points` | int | Estimated story points |
| Delivered Points | `Scrum/Delivered points` | int | Actual story points |
| Acceptance Criteria | `Scrum/Acceptance Criteria` | document | Rich text |
| User Story | `Scrum/User Story` | document | Rich text |
| Feature Summary | `Scrum/Feature summary` | document | Rich text |
| Change Summary | `Scrum/Change Summary` | document | Rich text |
| Actual Behavior | `Scrum/Actual behavior` | document | For bugs |
| Expected Behavior | `Scrum/Expected behavior` | document | For bugs |
| Steps To Reproduce | `Scrum/Steps to reproduce` | document | For bugs |

## Scrum/Story

| Field | API Path | Type | Notes |
|-------|----------|------|-------|
| ID | `fibery/id` | uuid | Internal UUID |
| Public ID | `fibery/public-id` | text | Short ID |
| Name | `Scrum/Name` | text | Story title |
| State | `workflow/state` | enum | Todo, In Progress, Done |
| Sprint | `Scrum/Sprint` | relation | Parent Sprint |
| Tasks | `Scrum/Tasks` | collection | Child Tasks |
| Expected Points | `Scrum/Expected Points` | int | Sum of task estimates |
| Delivered Points | `Scrum/Delivered points` | int | Sum of completed |
| Delivery Rate | `Scrum/Delivery Rate` | decimal | Completion percentage |
| Completion Rate | `Scrum/Completion Rate` | text | Display string |
| User Story | `Scrum/User Story` | document | As a... I want... So that... |
| Story Goal | `Scrum/Story Goal` | document | Objective |
| Acceptance Criteria | `Scrum/Acceptance Criteria` | document | Done criteria |
| Description | `Scrum/Description` | document | Details |

## Scrum/Sprint

| Field | API Path | Type | Notes |
|-------|----------|------|-------|
| ID | `fibery/id` | uuid | Internal UUID |
| Public ID | `fibery/public-id` | text | Short ID |
| Name | `Scrum/Name` | text | Sprint name |
| State | `workflow/state` | enum | Todo, In Progress, Done |
| Date | `Scrum/Date` | date-range | Start and end dates |
| Release | `Scrum/Release` | relation | Parent Release |
| Stories | `Scrum/Stories` | collection | Child Stories |
| Expected Points | `Scrum/Expected Points` | int | Committed points |
| Delivered Points | `Scrum/Delivered points` | int | Completed points |
| Delivery Rate | `Scrum/Delivery Rate` | decimal | Velocity |
| Sprint Goal | `Scrum/Sprint Goal` | document | Objective |
| Definition of Done | `Scrum/Definition of Done` | document | Completion criteria |
| Planning | `Scrum/Planning` | date | Planning meeting date |
| Demo Date | `Scrum/Demo Date` | date | Sprint review date |
| Retrospective | `Scrum/Retrospective` | date | Retro meeting date |
| Actual Completion Date | `Scrum/Actual completion date` | date | When sprint finished |

## Scrum/Release

| Field | API Path | Type | Notes |
|-------|----------|------|-------|
| ID | `fibery/id` | uuid | Internal UUID |
| Public ID | `fibery/public-id` | text | Short ID |
| Name | `Scrum/Name` | text | Release name |
| State | `workflow/state` | enum | Planning, Code Freeze, Dev Release, QA Complete, Prod Release |
| Release Date | `Scrum/Release date` | date | Target release |
| Sprints | `Scrum/Sprints` | collection | Child Sprints |
| Release Goal | `Scrum/Release Goal` | document | Objective |
| Release Notes | `Scrum/Release Notes` | document | Changelog |
| Readiness Checklist | `Scrum/Readiness Checklist` | document | Pre-release checks |

## Workflow State Fields

When querying state, use these patterns:

```json
// Get state name
["workflow/state", "enum/name"]

// Check if final state
["workflow/state", "workflow/Final"]

// Get state type (Not started, Started, Finished)
["workflow/state", "workflow/Type"]
```

## User Fields

When querying users (DRI, Created By):

```json
// Get user name
["Scrum/DRI", "user/name"]

// Get user email
["Scrum/DRI", "user/email"]
```

## Enum Fields

When querying enums (Priority, Task Type, etc.):

```json
// Get enum name
["Scrum/Priority", "enum/name"]

// Get enum color
["Scrum/Priority", "enum/color"]
```
