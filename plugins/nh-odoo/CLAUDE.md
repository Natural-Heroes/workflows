# Natural Heroes Odoo

## Production Environment

**Web URL:** https://odoo.naturalheroes.nl

**SSH Access:**
```bash
ssh 22467447@naturalheroes-odoo.odoo.com
```

**Odoo.sh Dashboard:** https://www.odoo.sh/project/naturalheroes-odoo

## Common SSH Commands

```bash
# List installed modules
ssh 22467447@naturalheroes-odoo.odoo.com "psql -c \"SELECT name, state FROM ir_module_module WHERE state='installed' ORDER BY name;\""

# Check Odoo version
ssh 22467447@naturalheroes-odoo.odoo.com "psql -c \"SELECT latest_version FROM ir_module_module WHERE name='base';\""

# Check specific module version
ssh 22467447@naturalheroes-odoo.odoo.com "psql -c \"SELECT name, latest_version FROM ir_module_module WHERE name='mcp_server';\""
```

## MCP Server

The MCP server module is installed on production. Test endpoints:

```bash
# Health check (no auth required)
curl -s https://odoo.naturalheroes.nl/mcp/health

# Other endpoints require API key via X-API-Key header
```

**Available REST endpoints:**
- `/mcp/health` - Health check (no auth)
- `/mcp/system/info` - System info (requires auth)
- `/mcp/models` - List enabled models (requires auth)
- `/mcp/auth/validate` - Validate API key

## Odoo 19 Documentation

Use Context7 MCP server to look up Odoo 19 documentation:

1. First resolve library ID: `resolve-library-id` with libraryName "odoo"
2. Then query docs: `query-docs` with the resolved library ID

Example queries:
- "How to create a wizard in Odoo 19"
- "Odoo 19 ORM methods"
- "Odoo 19 security groups and record rules"

## Local Development

```bash
# Start development environment
docker compose up -d

# View logs
docker compose logs -f odoo

# Restart after code changes
docker compose restart odoo

# Update a module
docker compose exec odoo odoo -d <database-name> -u <module-name> --stop-after-init

# Access Odoo shell
docker compose exec odoo odoo shell -d <database-name>
```

**Local access:**
- Odoo Web UI: http://localhost:8069
- PostgreSQL: localhost:5433 (user: odoo, password: odoo)

## Module Structure

```
module_name/
├── __init__.py              # Import models, controllers, wizards
├── __manifest__.py          # Metadata: name, version, depends, data files
├── models/                  # ORM models
├── views/                   # XML: forms, trees, search, actions, menus
├── security/
│   ├── ir.model.access.csv  # Model CRUD permissions per group
│   └── security.xml         # Groups, record rules
├── data/                    # Seed/demo data (XML)
├── wizards/                 # Transient models for UI wizards
├── static/                  # JS, CSS, images
├── tests/                   # Python unittest-based tests
└── i18n/                    # Translation files (*.po)
```

## Naming Conventions

| Element | Format | Example |
|---------|--------|---------|
| Module | `snake_case` | `cosmetic_formulation` |
| Model | `dotted.lowercase` | `cosmetic.formula` |
| Field | `snake_case` | `is_template`, `formula_line_ids` |
| View XML ID | `module.view_model_type` | `module.view_formula_form` |
| Version | `{odoo}.{major}.{minor}.{patch}` | `19.0.1.0.3` |
