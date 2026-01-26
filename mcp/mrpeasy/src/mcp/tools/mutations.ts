/**
 * MCP Write Tools for Customer Orders, Manufacturing Orders, and Items.
 *
 * All write tools require `confirm: true` to execute the mutation.
 * When `confirm: false` (default), they return a preview of what would be sent.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MrpEasyClient } from '../../services/mrpeasy/client.js';
import { logger } from '../../lib/logger.js';
import { handleToolError } from './error-handler.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const CustomerOrderProductSchema = z.object({
  article_id: z.number().int().positive().describe('Article/item ID'),
  quantity: z.number().positive().describe('Quantity to order'),
  total_price_cur: z.number().positive().describe('Total price for this line in order currency'),
});

const CreateCustomerOrderSchema = z.object({
  customer_id: z.number().int().positive().describe('Customer ID'),
  products: z.array(CustomerOrderProductSchema).min(1).describe('Products to order (at least one required)'),
  delivery_date: z.string().optional().describe('Requested delivery date (ISO format: YYYY-MM-DD)'),
  reference: z.string().optional().describe('Order reference'),
  notes: z.string().optional().describe('Order notes'),
  confirm: z.boolean().default(false).describe('Set to true to execute the creation. When false, returns a preview of what would be sent.'),
});

const UpdateCustomerOrderSchema = z.object({
  order_id: z.number().int().positive().describe('Customer order ID to update'),
  status: z.number().int().optional().describe('New status code (10=Quotation, 30=Confirmed, 50=In production, 70=Shipped, 80=Delivered, 90=Cancelled)'),
  delivery_date: z.string().optional().describe('New delivery date (ISO format: YYYY-MM-DD)'),
  reference: z.string().optional().describe('New order reference'),
  notes: z.string().optional().describe('New notes'),
  confirm: z.boolean().default(false).describe('Set to true to execute the update. When false, returns a preview of what would be sent.'),
});

const CreateManufacturingOrderSchema = z.object({
  article_id: z.number().int().positive().describe('Article/product ID to manufacture'),
  quantity: z.number().positive().describe('Quantity to produce'),
  assigned_id: z.number().int().positive().describe('Assigned user ID (responsible person). Use get_users to find valid IDs.'),
  site_id: z.number().int().positive().describe('Manufacturing site ID. Use get_sites to find valid IDs.'),
  due_date: z.string().optional().describe('Due date (ISO format: YYYY-MM-DD)'),
  start_date: z.string().optional().describe('Start date (ISO format: YYYY-MM-DD)'),
  notes: z.string().optional().describe('Production notes'),
  confirm: z.boolean().default(false).describe('Set to true to execute the creation. When false, returns a preview of what would be sent.'),
});

const UpdateManufacturingOrderSchema = z.object({
  mo_id: z.number().int().positive().describe('Manufacturing order ID to update'),
  code: z.string().optional().describe('New MO code'),
  quantity: z.number().positive().optional().describe('New quantity'),
  due_date: z.string().optional().describe('New due date (ISO format: YYYY-MM-DD)'),
  start_date: z.string().optional().describe('New start date (ISO format: YYYY-MM-DD)'),
  assigned_id: z.number().int().positive().optional().describe('New assigned user ID'),
  notes: z.string().optional().describe('New notes'),
  confirm: z.boolean().default(false).describe('Set to true to execute the update. When false, returns a preview of what would be sent.'),
});

const CreateItemSchema = z.object({
  title: z.string().min(1).describe('Item title/name'),
  unit_id: z.number().int().positive().describe('Unit of measure ID'),
  group_id: z.number().int().positive().describe('Product group ID'),
  is_raw: z.boolean().describe('true = raw material, false = finished product'),
  code: z.string().optional().describe('Item code/SKU (auto-generated if not provided)'),
  selling_price: z.number().optional().describe('Selling price'),
  min_quantity: z.number().optional().describe('Minimum stock quantity threshold'),
  description: z.string().optional().describe('Item description'),
  confirm: z.boolean().default(false).describe('Set to true to execute the creation. When false, returns a preview of what would be sent.'),
});

const UpdateItemSchema = z.object({
  item_id: z.number().int().positive().describe('Item article_id to update'),
  title: z.string().optional().describe('New title'),
  code: z.string().optional().describe('New code/SKU'),
  selling_price: z.number().optional().describe('New selling price'),
  min_quantity: z.number().optional().describe('New minimum quantity'),
  group_id: z.number().int().positive().optional().describe('New group ID'),
  unit_id: z.number().int().positive().optional().describe('New unit ID'),
  description: z.string().optional().describe('New description'),
  confirm: z.boolean().default(false).describe('Set to true to execute the update. When false, returns a preview of what would be sent.'),
});

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Registers mutation (write) tools for customer orders, manufacturing orders, and items.
 */
export function registerMutationTools(
  server: McpServer,
  client: MrpEasyClient
): void {
  logger.info('Registering mutation tools');

  // -------------------------------------------------------------------------
  // create_customer_order
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_create_customer_order',
    'Create a new customer order (sales order). Use get_customers first to find valid customer_id. Requires customer_id and at least one product with article_id, quantity, and total_price_cur. Set confirm=true to execute.',
    {
      customer_id: CreateCustomerOrderSchema.shape.customer_id,
      products: CreateCustomerOrderSchema.shape.products,
      delivery_date: CreateCustomerOrderSchema.shape.delivery_date,
      reference: CreateCustomerOrderSchema.shape.reference,
      notes: CreateCustomerOrderSchema.shape.notes,
      confirm: CreateCustomerOrderSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('create_customer_order called', { params });

      try {
        const payload = {
          customer_id: params.customer_id,
          products: params.products,
          delivery_date: params.delivery_date,
          reference: params.reference,
          notes: params.notes,
        };

        if (!params.confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: 'This is a preview. Set confirm=true to create the customer order.',
                payload,
              }),
            }],
          };
        }

        const result = await client.createCustomerOrder(payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Customer order created successfully.',
              order: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_create_customer_order');
      }
    }
  );

  // -------------------------------------------------------------------------
  // update_customer_order
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_update_customer_order',
    'Update an existing customer order. Can change status, delivery_date, reference, or notes. Set confirm=true to execute.',
    {
      order_id: UpdateCustomerOrderSchema.shape.order_id,
      status: UpdateCustomerOrderSchema.shape.status,
      delivery_date: UpdateCustomerOrderSchema.shape.delivery_date,
      reference: UpdateCustomerOrderSchema.shape.reference,
      notes: UpdateCustomerOrderSchema.shape.notes,
      confirm: UpdateCustomerOrderSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('update_customer_order called', { params });

      try {
        const { order_id, confirm, ...fields } = params;

        // Remove undefined fields
        const payload = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(payload).length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No update fields provided. Specify at least one of: status, delivery_date, reference, notes.',
            }],
          };
        }

        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: `This is a preview. Set confirm=true to update customer order ${order_id}.`,
                order_id,
                payload,
              }),
            }],
          };
        }

        const result = await client.updateCustomerOrder(order_id, payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Customer order ${order_id} updated successfully.`,
              order: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_update_customer_order');
      }
    }
  );

  // -------------------------------------------------------------------------
  // create_manufacturing_order
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_create_manufacturing_order',
    'Create a new manufacturing order (production order). Requires article_id, quantity, assigned_id, and site_id. Use get_users to find valid assigned_id and get_sites for valid site_id. Set confirm=true to execute.',
    {
      article_id: CreateManufacturingOrderSchema.shape.article_id,
      quantity: CreateManufacturingOrderSchema.shape.quantity,
      assigned_id: CreateManufacturingOrderSchema.shape.assigned_id,
      site_id: CreateManufacturingOrderSchema.shape.site_id,
      due_date: CreateManufacturingOrderSchema.shape.due_date,
      start_date: CreateManufacturingOrderSchema.shape.start_date,
      notes: CreateManufacturingOrderSchema.shape.notes,
      confirm: CreateManufacturingOrderSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('create_manufacturing_order called', { params });

      try {
        const payload = {
          article_id: params.article_id,
          quantity: params.quantity,
          assigned_id: params.assigned_id,
          site_id: params.site_id,
          due_date: params.due_date,
          start_date: params.start_date,
          notes: params.notes,
        };

        if (!params.confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: 'This is a preview. Set confirm=true to create the manufacturing order.',
                payload,
              }),
            }],
          };
        }

        const result = await client.createManufacturingOrder(payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Manufacturing order created successfully.',
              order: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_create_manufacturing_order');
      }
    }
  );

  // -------------------------------------------------------------------------
  // update_manufacturing_order
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_update_manufacturing_order',
    'Update an existing manufacturing order. Can change code, quantity, due_date, start_date, assigned_id, or notes. Set confirm=true to execute.',
    {
      mo_id: UpdateManufacturingOrderSchema.shape.mo_id,
      code: UpdateManufacturingOrderSchema.shape.code,
      quantity: UpdateManufacturingOrderSchema.shape.quantity,
      due_date: UpdateManufacturingOrderSchema.shape.due_date,
      start_date: UpdateManufacturingOrderSchema.shape.start_date,
      assigned_id: UpdateManufacturingOrderSchema.shape.assigned_id,
      notes: UpdateManufacturingOrderSchema.shape.notes,
      confirm: UpdateManufacturingOrderSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('update_manufacturing_order called', { params });

      try {
        const { mo_id, confirm, ...fields } = params;

        const payload = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(payload).length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No update fields provided. Specify at least one of: code, quantity, due_date, start_date, assigned_id, notes.',
            }],
          };
        }

        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: `This is a preview. Set confirm=true to update manufacturing order ${mo_id}.`,
                mo_id,
                payload,
              }),
            }],
          };
        }

        const result = await client.updateManufacturingOrder(mo_id, payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Manufacturing order ${mo_id} updated successfully.`,
              order: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_update_manufacturing_order');
      }
    }
  );

  // -------------------------------------------------------------------------
  // create_item
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_create_item',
    'Create a new item (product or raw material). Use get_units to find valid unit_id and get_product_groups to find valid group_id. Requires title, unit_id, group_id, and is_raw. Set confirm=true to execute.',
    {
      title: CreateItemSchema.shape.title,
      unit_id: CreateItemSchema.shape.unit_id,
      group_id: CreateItemSchema.shape.group_id,
      is_raw: CreateItemSchema.shape.is_raw,
      code: CreateItemSchema.shape.code,
      selling_price: CreateItemSchema.shape.selling_price,
      min_quantity: CreateItemSchema.shape.min_quantity,
      description: CreateItemSchema.shape.description,
      confirm: CreateItemSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('create_item called', { params });

      try {
        const payload = {
          title: params.title,
          unit_id: params.unit_id,
          group_id: params.group_id,
          // MRPeasy expects 0/1, convert boolean for safety
          is_raw: (params.is_raw ? 1 : 0) as 0 | 1,
          code: params.code,
          selling_price: params.selling_price,
          min_quantity: params.min_quantity,
          description: params.description,
        };

        if (!params.confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: 'This is a preview. Set confirm=true to create the item.',
                payload,
              }),
            }],
          };
        }

        const result = await client.createItem(payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Item created successfully.',
              item: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_create_item');
      }
    }
  );

  // -------------------------------------------------------------------------
  // update_item
  // -------------------------------------------------------------------------
  server.tool(
    'mrp_update_item',
    'Update an existing item. Can change title, code, selling_price, min_quantity, group_id, unit_id, or description. Set confirm=true to execute.',
    {
      item_id: UpdateItemSchema.shape.item_id,
      title: UpdateItemSchema.shape.title,
      code: UpdateItemSchema.shape.code,
      selling_price: UpdateItemSchema.shape.selling_price,
      min_quantity: UpdateItemSchema.shape.min_quantity,
      group_id: UpdateItemSchema.shape.group_id,
      unit_id: UpdateItemSchema.shape.unit_id,
      description: UpdateItemSchema.shape.description,
      confirm: UpdateItemSchema.shape.confirm,
    },
    async (params) => {
      logger.debug('update_item called', { params });

      try {
        const { item_id, confirm, ...fields } = params;

        const payload = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(payload).length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No update fields provided. Specify at least one of: title, code, selling_price, min_quantity, group_id, unit_id, description.',
            }],
          };
        }

        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                message: `This is a preview. Set confirm=true to update item ${item_id}.`,
                item_id,
                payload,
              }),
            }],
          };
        }

        const result = await client.updateItem(item_id, payload);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Item ${item_id} updated successfully.`,
              item: result,
            }),
          }],
        };
      } catch (error) {
        return handleToolError(error, 'mrp_update_item');
      }
    }
  );

  logger.info('Mutation tools registered: create_customer_order, update_customer_order, create_manufacturing_order, update_manufacturing_order, create_item, update_item');
}
