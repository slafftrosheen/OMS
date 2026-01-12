// src/routes/api/draft-orders/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

/**
 * GET /api/draft-orders/[id] - Get single order with profiles
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    // First get the order with profiles
    const sql = `
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
      WHERE d.po_number = $1 OR d.id::text = $1
    `;

    const result = await query(sql, [params.id]);

    if (result.rows.length === 0) {
      throw error(404, 'Order not found');
    }

    const row = result.rows[0];
    
    // Try to get files separately (in case order_files table doesn't exist)
    let files: any[] = [];
    try {
      const filesResult = await query(`
        SELECT f.id, f.filename, f.original_name as "originalName", of.file_type as "fileType", f.created_at as "uploadedAt"
        FROM order_files of
        JOIN files f ON f.id = of.file_id
        WHERE of.draft_order_id = $1
      `, [row.id]);
      files = filesResult.rows;
    } catch (filesErr) {
      // Table might not exist - ignore silently
    }
    
    return json({
      id: row.id,
      poNumber: row.po_number,
      clientName: row.client,
      title: row.title,
      deadline: row.due_date?.toISOString().slice(0, 10),
      loadingDate: row.loading_date?.toISOString().slice(0, 10),
      status: row.status,
      notes: row.notes,
      priority: row.priority || 'NORMAL',
      deliveryAddress: row.delivery_address,
      deliveryContact: row.delivery_contact,
      deliveryPhone: row.delivery_phone,
      profiles: row.profiles || [],
      files,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString()
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to fetch order:', err);
    throw error(500, 'Failed to fetch order');
  }
};

/**
 * PUT /api/draft-orders/[id] - Update order
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const data = await request.json();

  try {
    const result = await transaction(async (client) => {
      // Find the order first
      const findResult = await client.query(
        'SELECT id FROM draft_orders WHERE po_number = $1 OR id::text = $1',
        [params.id]
      );

      if (findResult.rows.length === 0) {
        throw { status: 404, message: 'Order not found' };
      }

      const orderId = findResult.rows[0].id;

      // Update order with all fields
      const updateSql = `
        UPDATE draft_orders SET
          client = COALESCE($2, client),
          title = COALESCE($3, title),
          due_date = COALESCE($4, due_date),
          loading_date = $5,
          status = COALESCE($6, status),
          notes = $7,
          priority = COALESCE($8, priority),
          delivery_address = $9,
          delivery_contact = $10,
          delivery_phone = $11,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const orderResult = await client.query(updateSql, [
        orderId,
        data.clientName || data.client,
        data.title,
        data.deadline || data.due || null,
        data.loadingDate || null,
        data.status,
        data.notes ?? null,
        data.priority || 'NORMAL',
        data.deliveryAddress || null,
        data.deliveryContact || null,
        data.deliveryPhone || null
      ]);

      // Update profiles if provided
      if (data.profiles && Array.isArray(data.profiles)) {
        // Delete existing profiles
        await client.query('DELETE FROM order_profiles WHERE draft_order_id = $1', [orderId]);

        // Insert new profiles
        for (const profile of data.profiles) {
          await client.query(`
            INSERT INTO order_profiles (draft_order_id, profile_template_id, quantity, configuration, notes)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            orderId,
            profile.profileTemplateId || null,
            profile.quantity || 1,
            JSON.stringify(profile.configuration || {}),
            profile.notes || ''
          ]);
        }
      }

      // Link new files if provided
      if (data.newFileIds && Array.isArray(data.newFileIds) && data.newFileIds.length > 0) {
        try {
          for (const fileId of data.newFileIds) {
            await client.query(
              `INSERT INTO order_files (draft_order_id, file_id, file_type, display_name)
               VALUES ($1, $2, 'sketch', NULL)`,
              [orderId, fileId]
            );
          }
        } catch (fileErr) {
          console.warn('Could not link files to order:', fileErr);
        }
      }

      return orderResult.rows[0];
    });

    return json({
      id: result.po_number,
      client: result.client,
      title: result.title,
      due: result.due_date?.toISOString().slice(0, 10),
      loadingDate: result.loading_date?.toISOString().slice(0, 10),
      status: result.status,
      notes: result.notes,
      priority: result.priority,
      deliveryAddress: result.delivery_address,
      deliveryContact: result.delivery_contact,
      deliveryPhone: result.delivery_phone
    });
  } catch (err: any) {
    console.error('Failed to update order:', err);
    if (err.status === 404) throw error(404, err.message);
    throw error(500, 'Failed to update order');
  }
};

/**
 * PATCH /api/draft-orders/[id] - Partial update (e.g., loading date)
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
  const data = await request.json();

  try {
    // Find the order first
    const findResult = await query(
      'SELECT id FROM draft_orders WHERE po_number = $1 OR id::text = $1',
      [params.id]
    );

    if (findResult.rows.length === 0) {
      throw error(404, 'Order not found');
    }

    const orderId = findResult.rows[0].id;

    // Build dynamic update query based on provided fields
    const updates: string[] = [];
    const values: any[] = [orderId];
    let idx = 2;

    if (data.loadingDate !== undefined) {
      updates.push(`loading_date = $${idx}`);
      values.push(data.loadingDate || null);
      idx++;
    }
    if (data.status !== undefined) {
      updates.push(`status = $${idx}`);
      values.push(data.status);
      idx++;
    }
    if (data.priority !== undefined) {
      updates.push(`priority = $${idx}`);
      values.push(data.priority);
      idx++;
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${idx}`);
      values.push(data.notes);
      idx++;
    }

    if (updates.length === 0) {
      throw error(400, 'No fields to update');
    }

    updates.push('updated_at = NOW()');

    const sql = `UPDATE draft_orders SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await query(sql, values);

    const row = result.rows[0];
    return json({
      id: row.id,
      poNumber: row.po_number,
      loadingDate: row.loading_date?.toISOString().slice(0, 10),
      status: row.status,
      priority: row.priority,
      notes: row.notes
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to patch order:', err);
    throw error(500, 'Failed to update order');
  }
};

/**
 * DELETE /api/draft-orders/[id] - Delete order
 */
export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const result = await query(
      'DELETE FROM draft_orders WHERE po_number = $1 OR id::text = $1 RETURNING po_number',
      [params.id]
    );

    if (result.rows.length === 0) {
      throw error(404, 'Order not found');
    }

    return json({ success: true, id: result.rows[0].po_number });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to delete order:', err);
    throw error(500, 'Failed to delete order');
  }
};
