# Testing Patterns

**Analysis Date:** 2026-01-17

## Test Framework

**Runner:**
- No formal testing framework detected
- This is a configuration/documentation repository, not a code library

**Assertion Library:**
- Not applicable

**Run Commands:**
```bash
# No test commands - manual validation via GitHub Actions execution
```

## Test File Organization

**Location:**
- No `*.test.ts`, `*.spec.ts`, or `__tests__/` directories
- No `jest.config.*` or `vitest.config.*` files

**Naming:**
- Not applicable

**Structure:**
- Not applicable (no compiled source code)

## Test Structure

**Suite Organization:**
- Not applicable

**Patterns:**
- Manual workflow validation via GitHub Actions
- Documentation examples serve as implicit tests

## Mocking

**Framework:**
- Not applicable

**Patterns:**
- Not applicable

## Fixtures and Factories

**Test Data:**
- Skills include working JSON examples in `examples/` subdirectories:
  - `plugins/fibery/skills/fibery-scrum/examples/get-sprint-tasks.json`
  - `plugins/fibery/skills/fibery-scrum/examples/update-task.json`

**Location:**
- `plugins/*/skills/*/examples/` - Example queries for skills

## Coverage

**Requirements:**
- No coverage requirements (not a code library)

**Configuration:**
- Not applicable

## Test Types

**Unit Tests:**
- Not applicable

**Integration Tests:**
- GitHub Actions workflows tested via PR execution
- API response validation in workflow scripts

**E2E Tests:**
- Manual testing via actual API calls

## Validation Approaches

**Workflow Validation:**
1. GitHub Actions workflows validated on PR execution
2. Workflow logs show success/failure
3. Bug comments posted indicate successful API integration

**API Response Validation:**
- Bash scripts in workflows include JSON parsing
- `.github/workflows/bugbot-review.yml` lines 65-78: JSON cleanup and parsing
- `.github/workflows/bugbot-fix.yml` lines 119-141: Response handling

**Documentation Examples:**
Each skill includes working examples:
```json
// From plugins/fibery/skills/fibery-scrum/examples/
{
  "q_from": "Scrum/Task",
  "q_select": { "Name": ["Scrum/Name"] },
  "q_where": ["=", ["Scrum/Task ID"], "$taskId"],
  "q_params": { "$taskId": "262" }
}
```

## Common Patterns

**Async Testing:**
- Not applicable

**Error Testing:**
- Workflows use `jq` error handlers with fallback to empty arrays
- Example: `jq -r '...' || echo '[]'`

**Snapshot Testing:**
- Not used

## Recommendations

Since this is a configuration repository:

1. **Validate YAML/JSON syntax** - Could add workflow to lint config files
2. **Test MCP server connectivity** - Could add health check workflow
3. **Validate Fibery schema** - Could add query validation tests

---

*Testing analysis: 2026-01-17*
*Update when testing patterns change*
