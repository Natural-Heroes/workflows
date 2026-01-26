/**
 * MCP Tool for Reports.
 *
 * Provides access to MRPeasy reports:
 * - get_report: Fetch reports by type with date range
 *
 * Report types:
 * - inventory_summary: Current stock summary
 * - inventory_movements: Stock movements over period
 * - procurement: Procurement/purchasing report
 * - production: Production/manufacturing report
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import type { ReportType } from '../../services/mrpeasy/types.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const GetReportSchema = z.object({
  type: z.enum(['inventory_summary', 'inventory_movements', 'procurement', 'production']).describe(
    'Report type: inventory_summary, inventory_movements, procurement, or production'
  ),
  from: z.string().describe('Start date (ISO format: YYYY-MM-DD). Required.'),
  to: z.string().describe('End date (ISO format: YYYY-MM-DD). Required.'),
  article_id: z.number().int().positive().optional().describe('Optional: filter by article/item ID'),
  warehouse_id: z.number().int().positive().optional().describe('Optional: filter by warehouse ID'),
});

// ============================================================================
// Tool Registration
// ============================================================================

export function registerReportTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering report tools');

  server.tool(
    'mrp_get_report',
    'Fetch a report from MRPeasy. Requires report type and date range (from/to in YYYY-MM-DD format). Types: inventory_summary, inventory_movements, procurement, production.',
    {
      type: GetReportSchema.shape.type,
      from: GetReportSchema.shape.from,
      to: GetReportSchema.shape.to,
      article_id: GetReportSchema.shape.article_id,
      warehouse_id: GetReportSchema.shape.warehouse_id,
    },
    async (params) => {
      logger.debug('get_report called', { params });

      try {
        const reportParams = {
          from: params.from,
          to: params.to,
          article_id: params.article_id,
          warehouse_id: params.warehouse_id,
        };

        const result = await client.getReport(params.type as ReportType, reportParams);

        const response = {
          summary: `${params.type} report for ${params.from} to ${params.to}`,
          type: params.type,
          period: { from: params.from, to: params.to },
          filters: {
            article_id: params.article_id ?? null,
            warehouse_id: params.warehouse_id ?? null,
          },
          data: result,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(response) }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_get_report');
      }
    }
  );

  logger.info('Report tools registered: mrp_get_report');
}
