# Contributing

## Branch Naming

All branches must include a Linear issue ID:

```
<type>/<TEAM>-<NUMBER>-<description>
```

**Examples:**
- `feat/NAT-123-add-login-page`
- `fix/AUT-42-fix-webhook-dedup`

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `perf`, `test`, `build`, `ci`, `revert`

**Exempt branches:** `main`, `staging`, `dev`, `release/*`, `dependabot/*`

This is enforced by the CI Gate workflow on every PR.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

Same types as branch naming. PRs to `dev` are squash-merged, so the final commit message is what matters.

## Git Workflow

```
feature branch → dev (squash merge) → staging/main (merge)
```

- **dev**: Integration branch. All feature work targets `dev` via PR. Squash merge only.
- **staging**: Pre-production. Merges from `dev` via PR.
- **main**: Production. Merges from `dev` or `staging` via PR.

## Branch Protection (Org Rulesets)

These rules apply to **all repos** in the org. Org admins can bypass via PR (with visible warning) but cannot push directly.

### `main` branch
- No direct pushes — changes must go through a PR
- No branch deletion or non-fast-forward pushes
- No direct branch creation (must branch from existing)
- Linear commit history required
- Review thread resolution required
- Stale reviews dismissed on new push
- CI Gate workflow must pass
- Merge methods: merge, squash, rebase

### `dev` branch
- No direct pushes — changes must go through a PR
- No branch deletion or non-fast-forward pushes
- CI Gate workflow must pass
- Merge method: squash only

## CI Gate

The [CI Gate](https://github.com/Natural-Heroes/automations/blob/main/.github/workflows/ci-gate.yml) is a required workflow injected by the org ruleset on every PR targeting `dev` or `main`. It runs two checks:

1. **branch-name** — validates the branch name contains a Linear issue ID (skipped for exempt branches)
2. **gate** — basic CI gate pass

Other CI checks (Greptile, repo-specific workflows) run alongside and must also complete before merging.

## PR Review Issues

When a PR targets `staging` or `main` from `dev`, a Linear review issue is automatically created with:
- Feature summary extracted from merged PR branch names
- Clickable links to related Linear issues
- PR attached as a resource
- Assigned to the default reviewer
