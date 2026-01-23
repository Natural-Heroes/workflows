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

/**
 * Brief server description shown during initialization.
 */
const SERVER_DESCRIPTION =
  'Perdoo OKR integration. Manage objectives, key results, and strategic pillars. Read the perdoo://instructions resource for usage guide.';

/**
 * Detailed instructions for LLMs, served as a resource.
 */
const INSTRUCTIONS_RESOURCE = `# Perdoo MCP Server Instructions

This server provides access to Perdoo OKR data including objectives, key results, and strategic pillars.

## Available Tools

### Objectives
- **list_objectives**: List objectives with pagination and filters. Supports \`limit\`, \`cursor\`, \`name_contains\`, \`stage\`, \`status\`, \`lead_id\`, \`group_id\`.
- **get_objective**: Get full objective details by UUID, including description, lead, groups, key results, children, contributors, and tags.
- **create_objective**: Create a new objective. \`name\` is required. Provide \`timeframe\` UUID, \`lead\`, \`groups\`, \`parent\`, \`stage\`, or \`additional_fields\`.
- **update_objective**: Update an existing objective by UUID. Provide any fields to change (\`name\`, \`description\`, \`lead\`, \`groups\`, \`stage\`, etc.).

## Key Concepts

### Objective Stage (lifecycle)
- **DRAFT**: Not yet active, still being defined
- **ACTIVE**: Currently being worked on
- **CLOSED**: Completed or archived

### Objective Status (progress indicator)
- **NO_STATUS**: No progress updates yet
- **OFF_TRACK**: Behind schedule
- **NEEDS_ATTENTION**: At risk
- **ON_TRACK**: Progressing well
- **ACCOMPLISHED**: Fully completed

### Progress Driver
- **KEY_RESULTS**: Progress calculated from key results
- **ALIGNED_OBJECTIVES**: Progress from child objectives
- **BOTH**: Combined calculation

## Pagination

All list operations use cursor-based (Relay) pagination:
- Set \`limit\` for page size (default: 20, max: 100)
- Response includes \`pagination.hasNextPage\` and \`pagination.nextCursor\`
- Pass \`cursor\` from previous response to get the next page

Example flow:
1. \`list_objectives({ limit: 10 })\` -- first page
2. \`list_objectives({ limit: 10, cursor: "abc123" })\` -- next page

## Filtering

list_objectives supports these filters:
- \`name_contains\`: Case-insensitive name search
- \`stage\`: Filter by DRAFT, ACTIVE, or CLOSED
- \`status\`: Filter by commit status enum
- \`lead_id\`: Filter by lead user UUID
- \`group_id\`: Filter by group/team UUID

## Entity Relationships

- **Objectives** contain **Key Results** (accessible via get_objective)
- **Objectives** belong to **Groups** (teams/departments)
- **Objectives** have a **Lead** (responsible person)
- **Objectives** are scoped to a **Timeframe** (quarter, year, etc.)
- **Objectives** can have a **Parent** objective (alignment hierarchy)
- **Objectives** can have **Children** (sub-objectives)
- **Objectives** can have **Contributors** (additional team members)
- **Objectives** can have **Tags** for categorization

## Best Practices

1. **Start with list**: Use list_objectives to discover available objectives before getting details.
2. **Use filters**: Narrow results with stage/status/name filters before paginating.
3. **Use pagination**: Always check \`hasNextPage\` -- don't assume all data fits in one response.
4. **Minimal updates**: Only include fields you want to change in update_objective.
5. **Check IDs are UUIDs**: All entity IDs in Perdoo are UUID format.
6. **Handle upsert errors**: Create/update operations return an \`errors\` array for validation failures.

## Mutations

Both create_objective and update_objective use Perdoo's upsertObjective mutation:
- **Create**: Omits the ID, resulting in a new objective
- **Update**: Includes the ID, resulting in an update to existing objective
- Mutations are never retried to prevent duplicates
- Validation errors are returned in the response (not thrown)

## Error Handling

Errors are returned with actionable suggestions:
- **Authentication errors**: Check PERDOO_API_TOKEN is valid
- **Rate limits**: Wait before retrying (automatic backoff is applied)
- **Service unavailable**: The circuit breaker is open; wait 30 seconds
- **Validation errors**: Returned in response.errors array with field and messages
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

  logger.info('MCP server created with all tools registered');
  return server;
}
