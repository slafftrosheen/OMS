// src/routes/api/loading-days/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/loading-days/[id] - Get loading day with assigned orders
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    // Get loading day
    const dayResult = await query('SELECT * FROM loading_days WHERE id = $1', [params.id]);
    
    if (dayResult.rows.length === 0) {
      throw error(404, 'Loading day not found');
    }

    const day = dayResult.rows[0];

    // Get orders assigned to this loading date
    const ordersResult = await query(
      `SELECT id, po_number, client, title, due_date, status
       FROM draft_orders
       WHERE loading_date = $1
       ORDER BY due_date`,
      [day.date]
    );

    return json({
      id: day.id,
      date: day.date?.toISOString().slice(0, 10),
      carrier: day.carrier,
      note: day.note,
      active: day.is_active,
      orders: ordersResult.rows.map(o => ({
        id: o.po_number,
        title: o.title,
        client: o.client,
        due: o.due_date?.toISOString().slice(0, 10),
        status: o.status
      })),
      assigned: ordersResult.rowCount
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to fetch loading day:', err);
    throw error(500, 'Failed to fetch loading day');
  }
};

/**
 * PUT /api/loading-days/[id] - Update loading day
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const data = await request.json();

  // If pos array provided, update orders' loading_date
  if (data.pos && Array.isArray(data.pos)) {
    try {
      // Get the loading day's date
      const dayResult = await query('SELECT date FROM loading_days WHERE id = $1', [params.id]);
      if (dayResult.rows.length === 0) {
        throw error(404, 'Loading day not found');
      }
      const loadingDate = dayResult.rows[0].date;

      // Clear previous assignments for this loading date (orders not in the new list)
      await query(
        `UPDATE draft_orders SET loading_date = NULL 
         WHERE loading_date = $1 AND po_number != ALL($2::text[])`,
        [loadingDate, data.pos]
      );

      // Set loading_date for the orders in the pos array
      if (data.pos.length > 0) {
        await query(
          `UPDATE draft_orders SET loading_date = $1 
           WHERE po_number = ANY($2::text[])`,
          [loadingDate, data.pos]
        );
      }

      return json({ success: true, pos: data.pos });
    } catch (err: any) {
      console.error('Failed to update PO assignments:', err);
      throw error(500, 'Failed to update PO assignments');
    }
  }

  const sql = `
    UPDATE loading_days SET
      carrier = COALESCE($2, carrier),
      note = COALESCE($3, note),
      is_active = COALESCE($4, is_active),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await query(sql, [
      params.id,
      data.carrier,
      data.note,
      data.active
    ]);

    if (result.rows.length === 0) {
      throw error(404, 'Loading day not found');
    }

    const row = result.rows[0];
    return json({
      id: row.id,
      date: row.date?.toISOString().slice(0, 10),
      carrier: row.carrier,
      note: row.note,
      active: row.is_active
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to update loading day:', err);
    throw error(500, 'Failed to update loading day');
  }
};

/**
 * DELETE /api/loading-days/[id] - Delete loading day
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const result = await query('DELETE FROM loading_days WHERE id = $1 RETURNING id', [params.id]);
  
  if (result.rows.length === 0) {
    throw error(404, 'Loading day not found');
  }

  return json({ success: true, id: params.id });
};
