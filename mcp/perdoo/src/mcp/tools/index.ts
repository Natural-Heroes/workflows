/**
 * MCP Tool Registration
 *
 * Creates and configures the McpServer instance with registered tools.
 * Includes objective tools for Perdoo OKR integration.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../lib/logger.js';
import { createPerdooClient } from '../../services/perdoo/index.js';
import { registerObjectiveTools } from './objectives.js';
import { registerKeyResultTools } from './key-results.js';
import { registerKpiTools } from './kpis.js';
import { registerInitiativeTools } from './initiatives.js';
import { registerStrategicPillarTools } from './strategic-pillars.js';

/**
 * Brief server description shown during initialization.
 */
const SERVER_DESCRIPTION =
  'Perdoo OKR integration. Manage objectives, key results, initiatives, KPIs, and strategic pillars. Read the perdoo://instructions resource for usage guide.';

/**
 * Detailed instructions for LLMs, served as a resource.
 */
const INSTRUCTIONS_RESOURCE = `# Perdoo MCP Server Instructions

This server provides access to Perdoo OKR data including objectives, key results, KPIs, and strategic pillars.

## Available Tools

### Objectives
- **list_objectives**: List objectives with pagination and filters. Supports \`limit\`, \`cursor\`, \`name_contains\`, \`stage\`, \`status\`, \`lead_id\`, \`group_id\`.
- **get_objective**: Get full objective details by UUID, including description, lead, groups, key results, children, contributors, and tags.
- **create_objective**: Create a new objective. \`name\` is required. Provide \`timeframe\` UUID, \`lead\`, \`groups\`, \`parent\`, \`stage\`, or \`additional_fields\`.
- **update_objective**: Update an existing objective by UUID. Provide any fields to change (\`name\`, \`description\`, \`lead\`, \`groups\`, \`stage\`, etc.).

### Key Results
- **list_key_results**: List key results with pagination and filters. Supports \`limit\`, \`cursor\`, \`name_contains\`, \`objective_id\`, \`lead_id\`, \`type\`, \`archived\`, \`status\`, \`objective_stage\`, \`timeframe_id\`, \`order_by\`.
- **get_key_result**: Get a single key result by UUID with full details including progress, metric values, and objective reference.
- **create_key_result**: Create a new key result. \`name\` and \`objective\` (parent objective UUID) are required. Provide \`type\`, \`start_value\`, \`target_value\`, \`current_value\`, \`unit\`, \`lead\`, or \`additional_fields\`.
- **update_key_result**: Update an existing key result by UUID. Provide any fields to change (\`name\`, \`current_value\`, \`target_value\`, \`lead\`, \`archived\`, etc.).

### Initiatives
- **list_initiatives**: List initiatives with pagination and filters. Supports \`limit\`, \`cursor\`, \`name_contains\`, \`objective_id\`, \`lead_id\`, \`archived\`, \`status\`, \`timeframe_id\`, \`order_by\`.
- **get_initiative**: Get a single initiative by UUID with full details including objective reference and progress.
- **create_initiative**: Create a new initiative. \`name\` and \`objective\` (parent objective UUID) are required. Provide \`start_value\`, \`target_value\`, \`current_value\`, \`unit\`, \`lead\`, or \`additional_fields\`.
- **update_initiative**: Update an existing initiative by UUID. Provide any fields to change (\`name\`, \`current_value\`, \`target_value\`, \`lead\`, \`archived\`, etc.).

### KPIs
- **list_kpis**: List KPIs with pagination and filters. Supports \`limit\`, \`cursor\`, \`name_contains\`, \`lead_id\`, \`group_id\`, \`archived\`, \`status\`, \`is_company_goal\`, \`goal_id\`, \`parent_id\`, \`order_by\`.
- **get_kpi**: Get a single KPI by UUID with full details including metric values, targets, and configuration.
- **create_kpi**: Create a new KPI. \`name\` is required. Provide \`metric_unit\`, \`target_type\`, \`current_value\`, \`lead\`, \`goal\`, \`parent\`, or \`additional_fields\`.
- **update_kpi**: Update an existing KPI by UUID. Provide any fields to change (\`name\`, \`current_value\`, \`metric_unit\`, \`target_type\`, \`lead\`, \`archived\`, etc.).

### Strategic Pillars
- **list_strategic_pillars**: List strategic pillars with pagination and filters. Supports \`limit\`, \`cursor\`, \`status\`, \`lead_id\`, \`archived\`, \`order_by\`, \`parent_id\`.
- **get_strategic_pillar**: Get a single strategic pillar by UUID with full details.

## Key Concepts

### Objective Stage (lifecycle)
- **DRAFT**: Not yet active, still being defined
- **ACTIVE**: Currently being worked on
- **CLOSED**: Completed or archived

### Commit Status (progress indicator, shared by Objectives, Key Results, KPIs)
- **NO_STATUS**: No progress updates yet
- **OFF_TRACK**: Behind schedule
- **NEEDS_ATTENTION**: At risk
- **ON_TRACK**: Progressing well
- **ACCOMPLISHED**: Fully completed

### Key Result Type
- **KEY_RESULT**: Quantitative metric (has start/target/current values)
- **INITIATIVE**: Qualitative deliverable (progress is manual)

### Initiative vs Key Result
- **Initiatives** are projects or tasks that support key results
- Initiatives do NOT contribute to objective progress (only key results do)
- Initiatives can track progress via Binary, Milestone, or metric values
- Use \`list_initiatives\` (not \`list_key_results\` with type filter) for cleaner results

### KPI Metric Unit
- **NUMERICAL**: Plain number
- **PERCENTAGE**: Percentage value
- **Currency codes**: USD, EUR, GBP, AUD, CAD, CHF, JPY, etc. (ISO 4217)

### KPI Target Type (direction of progress)
- **INCREASE_TO**: Value should grow toward target
- **DECREASE_TO**: Value should shrink toward target
- **STAY_AT_OR_ABOVE**: Maintain value at or above threshold
- **STAY_AT_OR_BELOW**: Maintain value at or below threshold

### KPI Progress Driver
- **MANUAL**: Progress updated manually via commits
- **INTEGRATION**: Progress pulled from external integration
- **ALIGNED_GOALS**: Progress calculated from child KPIs

### Objective Progress Driver
- **KEY_RESULTS**: Progress calculated from key results
- **ALIGNED_OBJECTIVES**: Progress from child objectives
- **BOTH**: Combined calculation

### Strategic Pillars
- Strategic pillars are long-term focus areas that define organizational direction
- Objectives and KPIs can align to a strategic pillar via their \`goal\` field
- Creating/modifying strategic pillars requires Superadmin permissions in Perdoo
- Strategic pillars are read-only via the API (use Perdoo web interface to manage)
- In the Perdoo API, strategic pillars are Goal entities with type=STRATEGIC_PILLAR

## Pagination

All list operations use cursor-based (Relay) pagination:
- Set \`limit\` for page size (default: 20, max: 100)
- Response includes \`pagination.hasNextPage\` and \`pagination.nextCursor\`
- Pass \`cursor\` from previous response to get the next page

Example flow:
1. \`list_objectives({ limit: 10 })\` -- first page
2. \`list_objectives({ limit: 10, cursor: "abc123" })\` -- next page

## Filtering

### list_objectives filters:
- \`name_contains\`: Case-insensitive name search
- \`stage\`: Filter by DRAFT, ACTIVE, or CLOSED
- \`status\`: Filter by commit status enum
- \`lead_id\`: Filter by lead user UUID
- \`group_id\`: Filter by group/team UUID

### list_key_results filters:
- \`name_contains\`: Case-insensitive name search
- \`objective_id\`: Filter by parent objective UUID
- \`lead_id\`: Filter by lead user UUID
- \`type\`: Filter by KEY_RESULT or INITIATIVE
- \`archived\`: Filter by archived status
- \`status\`: Filter by commit status
- \`objective_stage\`: Filter by parent objective stage
- \`timeframe_id\`: Filter by timeframe UUID

### list_initiatives filters:
- \`name_contains\`: Case-insensitive name search
- \`objective_id\`: Filter by parent objective UUID
- \`lead_id\`: Filter by lead user UUID
- \`archived\`: Filter by archived status
- \`status\`: Filter by commit status
- \`timeframe_id\`: Filter by timeframe UUID

### list_kpis filters:
- \`name_contains\`: Case-insensitive name search
- \`lead_id\`: Filter by lead user UUID
- \`group_id\`: Filter by group UUID
- \`archived\`: Filter by archived status
- \`status\`: Filter by commit status
- \`is_company_goal\`: Filter by company goal flag
- \`goal_id\`: Filter by strategic goal UUID
- \`parent_id\`: Filter by parent KPI UUID

### list_strategic_pillars filters:
- \`status\`: Filter by goal status
- \`lead_id\`: Filter by lead user UUID
- \`archived\`: Filter by archived status
- \`parent_id\`: Filter by parent pillar UUID (for sub-pillars)

## Entity Relationships

- **Strategic Pillars** are long-term focus areas for the organization
- **Objectives** can align to a **Strategic Pillar** (via goal field on create/update)
- **KPIs** can align to a **Strategic Pillar** (via goal field on create/update)
- **Objectives** contain **Key Results** (accessible via get_objective)
- **Key Results** belong to an **Objective** (parent, required for creation)
- **Initiatives** belong to an **Objective** (parent, required for creation)
- **Initiatives** do NOT contribute to objective progress
- **KPIs** can have a **Parent** KPI (hierarchy for aggregation)
- **KPIs** can have **Children** KPIs (sub-KPIs)
- **Objectives** and **KPIs** belong to **Groups** (teams/departments)
- **Objectives**, **Key Results**, and **KPIs** have a **Lead** (responsible person)
- **Objectives** are scoped to a **Timeframe** (quarter, year, etc.)
- **Objectives** can have a **Parent** objective (alignment hierarchy)
- **Objectives** can have **Contributors** (additional team members)
- All entities can have **Tags** for categorization

## Best Practices

1. **Start with list**: Use list tools to discover available entities before getting details.
2. **Use filters**: Narrow results with status/name/lead filters before paginating.
3. **Use pagination**: Always check \`hasNextPage\` -- don't assume all data fits in one response.
4. **Minimal updates**: Only include fields you want to change in update operations.
5. **Check IDs are UUIDs**: All entity IDs in Perdoo are UUID format.
6. **Handle upsert errors**: Create/update operations return an \`errors\` array for validation failures.
7. **Always specify objective**: When creating a key result, the \`objective\` UUID is required.
8. **KPI metric types**: When creating a KPI, set \`metric_unit\` to define how values are displayed (NUMERICAL, PERCENTAGE, or currency code).
9. **KPI targets**: Set \`target_type\` to define the direction of progress (INCREASE_TO, DECREASE_TO, STAY_AT_OR_ABOVE, STAY_AT_OR_BELOW).

## Mutations

All create and update operations use Perdoo's upsert mutations:
- **create_objective** / **update_objective**: Uses \`upsertObjective\` mutation
- **create_key_result** / **update_key_result**: Uses \`upsertKeyResult\` mutation
- **create_initiative** / **update_initiative**: Uses \`upsertKeyResult\` mutation with type set to INITIATIVE
- **create_kpi** / **update_kpi**: Uses \`upsertKpi\` mutation

Mutation behavior:
- **Create**: Omits the ID, resulting in a new entity
- **Update**: Includes the ID, resulting in an update to existing entity
- Mutations are never retried to prevent duplicates
- Validation errors are returned in the response (not thrown)

## Error Handling

Errors are returned with actionable suggestions:
- **Authentication errors**: Check PERDOO_API_TOKEN is valid
- **Rate limits**: Wait before retrying (automatic backoff is applied)
- **Service unavailable**: The circuit breaker is open; wait 30 seconds
- **Validation errors**: Returned in response.errors array with field and messages

## Limitations

- **Strategic Pillars are read-only**: The Perdoo API does not expose a public mutation for creating or modifying strategic pillars. Use the Perdoo web interface for pillar management.
`;

/**
 * Creates and returns a configured McpServer instance.
 *
 * The server is configured with:
 * - Server name and version for identification
 * - Server description for LLM context
 * - Instructions resource with detailed usage guide
 * - Objective tools (list, get, create, update)
 *
 * @returns Configured McpServer instance ready for connection
 */
export function createMcpServer(): McpServer {
  logger.info('Creating MCP server instance');

  const server = new McpServer({
    name: 'perdoo-mcp',
    version: '0.1.0',
    description: SERVER_DESCRIPTION,
  });

  // Create Perdoo API client
  const client = createPerdooClient();

  // Register instructions resource for LLM guidance
  server.resource(
    'instructions',
    'perdoo://instructions',
    {
      description: 'Usage guide for the Perdoo MCP server. Read this to understand available tools, pagination, entity relationships, and best practices.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'perdoo://instructions',
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_RESOURCE,
        },
      ],
    })
  );

  // Register Perdoo tools
  registerObjectiveTools(server, client);
  registerKeyResultTools(server, client);
  registerKpiTools(server, client);
  registerInitiativeTools(server, client);
  registerStrategicPillarTools(server, client);

  logger.info('MCP server created with all tools registered');
  return server;
}
