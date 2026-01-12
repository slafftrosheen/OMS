// src/routes/api/calendar/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

/**
 * GET /api/calendar/[id] - Get single event
 */
export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  const sql = `
    SELECT 
      ce.id, ce.kind, ce.date, ce.title, ce.note, ce.created_at,
      le.carrier, le.window_start, le.window_end,
      me.start_time, me.end_time, me.location, me.attendees,
      COALESCE(
        (SELECT json_agg(do.po_number) 
         FROM loading_event_pos lep 
         JOIN draft_orders do ON do.id = lep.draft_order_id
         WHERE lep.loading_event_id = ce.id),
        '[]'::json
      ) as po_list
    FROM calendar_events ce
    LEFT JOIN loading_events le ON le.id = ce.id
    LEFT JOIN meeting_events me ON me.id = ce.id
    WHERE ce.id = $1
  `;

  try {
    const result = await query(sql, [id]);

    if (result.rowCount === 0) {
      return json({ error: 'Event not found' }, { status: 404 });
    }

    const row = result.rows[0];
    return json({
      id: row.id,
      kind: row.kind,
      date: row.date?.toISOString().slice(0, 10),
      title: row.title,
      note: row.note,
      createdAt: row.created_at?.toISOString(),
      poList: row.po_list || [],
      carrier: row.carrier,
      window: row.window_start || row.window_end ? {
        start: row.window_start?.slice(0, 5),
        end: row.window_end?.slice(0, 5)
      } : undefined,
      start: row.start_time?.slice(0, 5),
      end: row.end_time?.slice(0, 5),
      location: row.location,
      attendees: row.attendees || []
    });
  } catch (err) {
    console.error('Failed to fetch event:', err);
    return json({ error: 'Failed to fetch event' }, { status: 500 });
  }
};

/**
 * PUT /api/calendar/[id] - Update event
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const { id } = params;
  const data = await request.json();

  try {
    await transaction(async (client) => {
      // Update base event
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.date !== undefined) {
        updates.push(`date = $${idx++}`);
        values.push(data.date);
      }
      if (data.title !== undefined) {
        updates.push(`title = $${idx++}`);
        values.push(data.title);
      }
      if (data.note !== undefined) {
        updates.push(`note = $${idx++}`);
        values.push(data.note);
      }

      if (updates.length > 0) {
        values.push(id);
        await client.query(
          `UPDATE calendar_events SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
          values
        );
      }

      // Update kind-specific data
      if (data.kind === 'loading' || data.carrier !== undefined || data.window !== undefined) {
        await client.query(
          `UPDATE loading_events SET 
            carrier = COALESCE($2, carrier),
            window_start = COALESCE($3, window_start),
            window_end = COALESCE($4, window_end)
           WHERE id = $1`,
          [id, data.carrier, data.window?.start, data.window?.end]
        );

        // Update PO links
        if (data.poList !== undefined) {
          await client.query(`DELETE FROM loading_event_pos WHERE loading_event_id = $1`, [id]);
          for (const poNumber of data.poList) {
            const orderResult = await client.query(
              `SELECT id FROM draft_orders WHERE po_number = $1`,
              [poNumber]
            );
            if (orderResult.rowCount > 0) {
              await client.query(
                `INSERT INTO loading_event_pos (loading_event_id, draft_order_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [id, orderResult.rows[0].id]
              );
            }
          }
        }
      }

      if (data.kind === 'meeting' || data.start !== undefined || data.end !== undefined) {
        await client.query(
          `UPDATE meeting_events SET 
            start_time = COALESCE($2, start_time),
            end_time = COALESCE($3, end_time),
            location = COALESCE($4, location),
            attendees = COALESCE($5, attendees)
           WHERE id = $1`,
          [id, data.start, data.end, data.location, data.attendees]
        );
      }
    });

    return json({ success: true });
  } catch (err) {
    console.error('Failed to update event:', err);
    return json({ error: 'Failed to update event' }, { status: 500 });
  }
};

/**
 * DELETE /api/calendar/[id] - Delete event
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const { id } = params;

  try {
    const result = await query(`DELETE FROM calendar_events WHERE id = $1 RETURNING id`, [id]);

    if (result.rowCount === 0) {
      return json({ error: 'Event not found' }, { status: 404 });
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to delete event:', err);
    return json({ error: 'Failed to delete event' }, { status: 500 });
  }
};
