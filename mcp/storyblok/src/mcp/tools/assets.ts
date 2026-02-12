/**
 * MCP Tools: Assets
 *
 * 8 tools for managing Storyblok assets (images, files, videos).
 * Assets are stored in Storyblok's CDN.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoryblokClient } from '../../services/storyblok/client.js';
import { handleToolError } from './error-handler.js';
import { logger } from '../../lib/logger.js';

/**
 * Registers asset tools on the MCP server.
 */
export function registerAssetTools(server: McpServer, client: StoryblokClient): void {
  const spaceId = client.spaceId;

  // ===========================================================================
  // sb_list_assets
  // ===========================================================================
  server.tool(
    'sb_list_assets',
    `List assets in the space with filtering and pagination.

Filters:
- search: Search by filename
- in_folder: Filter by folder ID
- by_alt / by_title / by_copyright: Search metadata
- is_private: Filter private assets
- sort_by: Sort order (e.g. "created_at:desc")`,
    {
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default: 25)'),
      search: z.string().optional().describe('Search by filename'),
      in_folder: z.number().int().optional().describe('Filter by folder ID (-1 for deleted)'),
      sort_by: z.enum([
        'created_at:asc', 'created_at:desc',
        'updated_at:asc', 'updated_at:desc',
        'short_filename:asc', 'short_filename:desc',
      ]).optional().describe('Sort order'),
      is_private: z.boolean().optional().describe('Filter private assets'),
      by_alt: z.string().optional().describe('Search by alt text'),
      by_title: z.string().optional().describe('Search by title'),
      by_copyright: z.string().optional().describe('Search by copyright'),
      with_tags: z.string().optional().describe('Filter by internal tag names'),
    },
    async (params) => {
      logger.debug('sb_list_assets called', params);

      try {
        const result = await client.sdk.assets.list({
          path: { space_id: spaceId },
          query: {
            page: params.page,
            per_page: params.per_page,
            search: params.search,
            in_folder: params.in_folder,
            sort_by: params.sort_by,
            is_private: params.is_private,
            by_alt: params.by_alt,
            by_title: params.by_title,
            by_copyright: params.by_copyright,
            with_tags: params.with_tags,
          },
        });

        const data = client.handleResponse(result);

        const assets = (data.assets || []).map((a) => ({
          id: a.id,
          filename: a.filename,
          short_filename: a.short_filename,
          content_type: a.content_type,
          content_length: a.content_length,
          alt: a.alt,
          title: a.title,
          copyright: a.copyright,
          asset_folder_id: a.asset_folder_id,
          is_private: a.is_private,
          created_at: a.created_at,
          updated_at: a.updated_at,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ assets, count: assets.length }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_assets');
      }
    }
  );

  // ===========================================================================
  // sb_get_asset
  // ===========================================================================
  server.tool(
    'sb_get_asset',
    'Get a single asset with full metadata by ID.',
    {
      asset_id: z.number().int().describe('Asset ID'),
    },
    async (params) => {
      logger.debug('sb_get_asset called', params);

      try {
        const result = await client.sdk.assets.get({
          path: { space_id: spaceId, asset_id: params.asset_id },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.asset),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_get_asset');
      }
    }
  );

  // ===========================================================================
  // sb_upload_asset
  // ===========================================================================
  server.tool(
    'sb_upload_asset',
    `Start an asset upload by requesting a signed URL from Storyblok.

This is step 1 of a 2-step upload process:
1. Call this tool to get a signed upload URL and fields
2. POST the file to the returned post_url with the returned fields

Returns { id, post_url, fields } needed for the actual file upload.
After uploading, the asset needs to be finalized.`,
    {
      filename: z.string().describe('Original filename (e.g. "hero-image.jpg")'),
      size: z.string().optional().describe('Image dimensions as "WIDTHxHEIGHT" (e.g. "1920x1080")'),
      asset_folder_id: z.number().int().optional().describe('Target folder ID'),
    },
    async (params) => {
      logger.debug('sb_upload_asset called', { filename: params.filename });

      try {
        const result = await client.sdk.assets.upload({
          path: { space_id: spaceId },
          body: {
            filename: params.filename,
            size: params.size || '0x0',
            asset_folder_id: params.asset_folder_id,
            validate_upload: 1,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              id: data.id,
              post_url: data.post_url,
              fields: data.fields,
              instructions: 'POST the file to post_url with the returned fields as multipart form data. Then call the finalize endpoint.',
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_upload_asset');
      }
    }
  );

  // ===========================================================================
  // sb_update_asset
  // ===========================================================================
  server.tool(
    'sb_update_asset',
    'Update asset metadata (alt text, title, copyright, tags, folder).',
    {
      asset_id: z.number().int().describe('Asset ID to update'),
      alt: z.string().optional().describe('Alt text'),
      title: z.string().optional().describe('Title'),
      copyright: z.string().optional().describe('Copyright info'),
      source: z.string().optional().describe('Source attribution'),
      focus: z.string().optional().describe('Focus point as "X:Y" (e.g. "50:30")'),
      asset_folder_id: z.number().int().optional().describe('Move to folder'),
      is_private: z.boolean().optional().describe('Set private flag'),
      internal_tag_ids: z.array(z.string()).optional().describe('Internal tag IDs'),
    },
    async (params) => {
      logger.debug('sb_update_asset called', { asset_id: params.asset_id });

      try {
        const asset: Record<string, unknown> = {};
        if (params.alt !== undefined) asset.alt = params.alt;
        if (params.title !== undefined) asset.title = params.title;
        if (params.copyright !== undefined) asset.copyright = params.copyright;
        if (params.source !== undefined) asset.source = params.source;
        if (params.focus !== undefined) asset.focus = params.focus;
        if (params.asset_folder_id !== undefined) asset.asset_folder_id = params.asset_folder_id;
        if (params.is_private !== undefined) asset.is_private = params.is_private;
        if (params.internal_tag_ids !== undefined) asset.internal_tag_ids = params.internal_tag_ids;

        const result = await client.sdk.assets.update({
          path: { space_id: spaceId, asset_id: params.asset_id },
          body: { asset },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(data.asset),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_update_asset');
      }
    }
  );

  // ===========================================================================
  // sb_delete_asset
  // ===========================================================================
  server.tool(
    'sb_delete_asset',
    'Delete an asset by ID.',
    {
      asset_id: z.number().int().describe('Asset ID to delete'),
    },
    async (params) => {
      logger.debug('sb_delete_asset called', params);

      try {
        const result = await client.sdk.assets.delete({
          path: { space_id: spaceId, asset_id: params.asset_id },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: `Asset ${params.asset_id} deleted.` }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_delete_asset');
      }
    }
  );

  // ===========================================================================
  // sb_bulk_delete_assets
  // ===========================================================================
  server.tool(
    'sb_bulk_delete_assets',
    'Delete multiple assets at once using the native bulk delete endpoint.',
    {
      asset_ids: z.array(z.number().int()).min(1).max(100).describe('Asset IDs to delete'),
    },
    async (params) => {
      logger.debug('sb_bulk_delete_assets called', { count: params.asset_ids.length });

      try {
        const result = await client.sdk.assets.deleteMany({
          path: { space_id: spaceId },
          body: { ids: params.asset_ids },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `${params.asset_ids.length} assets deleted.`,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_bulk_delete_assets');
      }
    }
  );

  // ===========================================================================
  // sb_bulk_move_assets
  // ===========================================================================
  server.tool(
    'sb_bulk_move_assets',
    'Move multiple assets to a different folder using the native bulk move endpoint.',
    {
      asset_ids: z.array(z.number().int()).min(1).max(100).describe('Asset IDs to move'),
      asset_folder_id: z.number().int().describe('Target folder ID'),
    },
    async (params) => {
      logger.debug('sb_bulk_move_assets called', { count: params.asset_ids.length });

      try {
        const result = await client.sdk.assets.bulkMove({
          path: { space_id: spaceId },
          body: {
            ids: params.asset_ids,
            asset_folder_id: params.asset_folder_id,
          },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `${params.asset_ids.length} assets moved to folder ${params.asset_folder_id}.`,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_bulk_move_assets');
      }
    }
  );

  // ===========================================================================
  // sb_list_asset_folders
  // ===========================================================================
  server.tool(
    'sb_list_asset_folders',
    'List asset folders. Use to find folder IDs for filtering or moving assets.',
    {
      search: z.string().optional().describe('Search by folder name'),
      with_parent: z.number().int().optional().describe('Filter by parent folder ID (0 for root)'),
    },
    async (params) => {
      logger.debug('sb_list_asset_folders called', params);

      try {
        const result = await client.sdk.assetFolders.list({
          path: { space_id: spaceId },
          query: {
            search: params.search,
            with_parent: params.with_parent,
          },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              asset_folders: data.asset_folders || [],
              count: (data.asset_folders || []).length,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_list_asset_folders');
      }
    }
  );

  // ===========================================================================
  // sb_bulk_restore_assets
  // ===========================================================================
  server.tool(
    'sb_bulk_restore_assets',
    'Restore multiple deleted assets at once.',
    {
      asset_ids: z.array(z.number().int()).min(1).max(100).describe('Asset IDs to restore'),
    },
    async (params) => {
      logger.debug('sb_bulk_restore_assets called', { count: params.asset_ids.length });

      try {
        const result = await client.sdk.assets.bulkRestore({
          path: { space_id: spaceId },
          body: { ids: params.asset_ids },
        });

        client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `${params.asset_ids.length} assets restored.`,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_bulk_restore_assets');
      }
    }
  );

  // ===========================================================================
  // sb_finalize_asset_upload
  // ===========================================================================
  server.tool(
    'sb_finalize_asset_upload',
    `Finalize an asset upload after uploading the file to the signed URL.

Call this after completing the file upload to the post_url returned by sb_upload_asset.
The signed_response_object_id is the ID returned by the upload step.`,
    {
      signed_response_object_id: z.string().describe('The ID from sb_upload_asset response'),
    },
    async (params) => {
      logger.debug('sb_finalize_asset_upload called', params);

      try {
        const result = await client.sdk.assets.finalize({
          path: { space_id: spaceId, signed_response_object_id: params.signed_response_object_id },
        });

        const data = client.handleResponse(result);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, ...data }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'sb_finalize_asset_upload');
      }
    }
  );
}
