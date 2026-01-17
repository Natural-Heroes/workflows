# External Integrations

**Analysis Date:** 2026-01-17

## APIs & External Services

**Payment Processing:**
- Not applicable

**Email/SMS:**
- Not applicable

**External APIs:**

### OpenAI API
- Purpose: AI-powered bug detection and fixing
- Integration Points:
  - `.github/workflows/bugbot-review.yml` - Bug detection in PR diffs
  - `.github/workflows/bugbot-fix.yml` - Automated bug fixes
- SDK/Client: REST API via curl
- Auth: `OPENAI_API_KEY` GitHub secret
- Endpoints: `https://api.openai.com/v1/responses`
- Model: `gpt-5.2-codex`

### Shopify APIs
- Purpose: Ecommerce theme and app development toolkit
- Integration Points: `plugins/shopify/.mcp.json`
- Components:
  - **Shopify Dev MCP** - Local via `npx @shopify/dev-mcp@latest`
    - GraphQL schema introspection
    - Documentation search
    - Liquid template validation
  - **Storefront Dev MCP** - `https://dev-test-202050947.myshopify.com/api/mcp`
  - **Storefront Prod MCP** - `https://natural-heroes-nl.myshopify.com/api/mcp`
- Auth: OAuth through Shopify CLI

### Fibery API
- Purpose: Project management and scrum workflow integration
- Integration Points:
  - `plugins/fibery/README.md`
  - `plugins/fibery/skills/fibery-scrum/SKILL.md`
- SDK/Client: Fibery MCP Server (`fibery-mcp-server` via uvx)
- Auth: `FIBERY_API_TOKEN` environment variable
- Host: `FIBERY_HOST` environment variable

### Context7 Documentation MCP
- Purpose: Real-time documentation lookup
- Integration Points: `plugins/nh-odoo/.mcp.json`
- Execution: `uvx mcp-server-context7`
- Used for: Odoo 19 documentation

## Data Storage

**Databases:**
- Fibery workspace - Scrum/Task and Fibery databases/Todo entities
- No direct database connections (all via MCP/API)

**File Storage:**
- Not applicable

**Caching:**
- Not applicable

## Authentication & Identity

**Auth Provider:**
- GitHub OAuth - Implicit via GitHub Actions
- Shopify OAuth - Via Shopify CLI

**OAuth Integrations:**
- GitHub - For PR management and comments
- Shopify - For store access and theme development

## Monitoring & Observability

**Error Tracking:**
- Not applicable (workflows fail visibly in GitHub Actions)

**Analytics:**
- Not applicable

**Logs:**
- GitHub Actions logs - Built-in workflow execution logs

## CI/CD & Deployment

**Hosting:**
- GitHub Actions - Primary execution environment
- Platform: ubuntu-latest runners

**CI Pipeline:**
- GitHub Actions workflows
  - `.github/workflows/bugbot-review.yml` - PR review automation
  - `.github/workflows/bugbot-fix.yml` - Auto-fix on `/fix` command

## Environment Configuration

**Development:**
- Required env vars:
  - `FIBERY_HOST` - Fibery workspace domain
  - `FIBERY_API_TOKEN` - Fibery API authentication
  - `LIQUID_VALIDATION_MODE` - Shopify Liquid validation
- Secrets location: GitHub repository secrets, local env vars

**Staging:**
- Not applicable (config-driven repository)

**Production:**
- `OPENAI_API_KEY` - GitHub secret for bugbot workflows
- Shopify stores: dev-test-202050947.myshopify.com (dev), natural-heroes-nl.myshopify.com (prod)

## Webhooks & Callbacks

**Incoming:**
- GitHub Actions events (PR opened, synchronized, comment created)

**Outgoing:**
- OpenAI API calls for bug analysis
- GitHub API for posting review comments
- Fibery API for task management

---

*Integration audit: 2026-01-17*
*Update when adding/removing external services*
