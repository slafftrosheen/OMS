// src/routes/api/draft-orders/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

/**
 * GET /api/draft-orders - List all draft orders
 */
export const GET: RequestHandler = async () => {
  try {
    const result = await query(`
      SELECT
        d.*,
        (
          SELECT json_agg(json_build_object(
            'id', op.id,
            'profileTemplateId', op.profile_template_id,
            'quantity', op.quantity,
            'configuration', op.configuration,
            'notes', op.notes
          ))
          FROM order_profiles op
          WHERE op.draft_order_id = d.id
        ) as profiles
      FROM draft_orders d
      ORDER BY d.created_at DESC
    `);

    const orders = result.rows.map(row => ({
      id: row.id,
      poNumber: row.po_number,
      clientName: row.client,
      title: row.title,
      deadline: row.due_date,
      loadingDate: row.loading_date,
      status: row.status,
      priority: row.priority || 'NORMAL',
      deliveryAddress: row.delivery_address,
      deliveryContact: row.delivery_contact,
      deliveryPhone: row.delivery_phone,
      profiles: row.profiles || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return json(orders);
  } catch (err) {
    console.error('Error fetching draft orders:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/draft-orders - Create a new draft order
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (!data.poNumber || !data.clientName) {
    return json({ message: 'PO Number and Client Name are required' }, { status: 400 });
  }

  try {
    const order = await transaction(async (client) => {
      const orderResult = await client.query(
        'INSERT INTO draft_orders (po_number, client, title, due_date, loading_date, status, notes, priority, delivery_address, delivery_contact, delivery_phone, delivery_preset_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
        [data.poNumber, data.clientName, data.title || `Order ${data.poNumber}`, data.deadline || null, data.loadingDate || null, 'draft', data.notes || '', data.priority || 'NORMAL', data.deliveryAddress || null, data.deliveryContact || null, data.deliveryPhone || null, data.deliveryPresetId || null]
      );

      const newOrder = orderResult.rows[0];

      if (data.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
        for (const p of data.profiles) {
          await client.query(
            'INSERT INTO order_profiles (draft_order_id, quantity, configuration, notes) VALUES ($1, $2, $3, $4)',
            [newOrder.id, p.quantity || 1, p.configuration || {}, p.notes || '']
          );
        }
      }

      if (data.fileIds && Array.isArray(data.fileIds) && data.fileIds.length > 0) {
        for (const fileId of data.fileIds) {
          await client.query(
            "INSERT INTO order_files (draft_order_id, file_id, file_type, display_name) VALUES ($1, $2, 'sketch', NULL)",
            [newOrder.id, fileId]
          );
        }
      }

      return newOrder;
    });

    return json(order, { status: 201 });
  } catch (err: any) {
    console.error('Error creating draft order:', err);
    if (err.code === '23505') { // Unique violation
      return json({ message: 'PO Number already exists' }, { status: 409 });
    }
    return json({ message: 'Failed to create order' }, { status: 500 });
  }
};
