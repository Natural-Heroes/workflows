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
- **list_objectives**: List objectives with pagination. Use \`limit\` to control page size and \`cursor\` for subsequent pages.
- **get_objective**: Get full objective details by ID, including description, lead, groups, and key results.
- **create_objective**: Create a new objective. \`name\` is required. Use \`additional_fields\` for schema-specific parameters.
- **update_objective**: Update an existing objective by ID. Pass a \`fields\` record with the properties to change.

## Pagination

All list operations use cursor-based (Relay) pagination:
- Set \`limit\` for page size (default: 20, max: 100)
- Response includes \`pagination.hasNextPage\` and \`pagination.nextCursor\`
- Pass \`cursor\` from previous response to get the next page

Example flow:
1. \`list_objectives({ limit: 10 })\` -- first page
2. \`list_objectives({ limit: 10, cursor: "abc123" })\` -- next page

## Entity Relationships

- **Objectives** contain **Key Results** (accessible via get_objective)
- **Objectives** belong to **Groups** (teams/departments)
- **Objectives** have a **Lead** (owner/responsible person)
- **Objectives** are scoped to a **Timeframe** (quarter, year, etc.)

## Best Practices

1. **Start with list**: Use list_objectives to discover available objectives before getting details.
2. **Use pagination**: Always check \`hasNextPage\` -- don't assume all data fits in one response.
3. **Minimal updates**: Only include fields you want to change in update_objective.
4. **Check status**: Objectives have status and progress fields for tracking completion.

## Error Handling

Errors are returned with actionable suggestions:
- **Authentication errors**: Check PERDOO_API_TOKEN is valid
- **Rate limits**: Wait before retrying (automatic backoff is applied)
- **Service unavailable**: The circuit breaker is open; wait 30 seconds

## Notes

- All mutations (create, update) are never retried to prevent duplicates.
- Progress is a percentage (0-100).
- Field names may change after schema introspection validation.
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

  logger.info('MCP server created with all tools registered');
  return server;
}
