// src/routes/api/calendar/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

/**
 * GET /api/calendar - List calendar events
 * Query params: ?from=2025-01-01&to=2025-12-31&kind=loading
 */
export const GET: RequestHandler = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const kind = url.searchParams.get('kind');

  let sql = `
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
    WHERE 1=1
  `;

  const params: any[] = [];
  let idx = 1;

  if (from) {
    sql += ` AND ce.date >= $${idx++}`;
    params.push(from);
  }

  if (to) {
    sql += ` AND ce.date <= $${idx++}`;
    params.push(to);
  }

  if (kind) {
    sql += ` AND ce.kind = $${idx++}`;
    params.push(kind);
  }

  sql += ` ORDER BY ce.date ASC, ce.created_at ASC`;

  try {
    const result = await query(sql, params);

    const events = result.rows.map(row => {
      const base = {
        id: row.id,
        kind: row.kind,
        date: row.date?.toISOString().slice(0, 10),
        createdAt: row.created_at?.toISOString(),
        note: row.note
      };

      if (row.kind === 'loading') {
        return {
          ...base,
          poList: row.po_list || [],
          carrier: row.carrier,
          window: row.window_start || row.window_end ? {
            start: row.window_start?.slice(0, 5),
            end: row.window_end?.slice(0, 5)
          } : undefined
        };
      }

      if (row.kind === 'meeting') {
        return {
          ...base,
          title: row.title,
          start: row.start_time?.slice(0, 5),
          end: row.end_time?.slice(0, 5),
          location: row.location,
          attendees: row.attendees || []
        };
      }

      return {
        ...base,
        title: row.title
      };
    });

    return json(events);
  } catch (err) {
    console.error('Failed to fetch calendar events:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/calendar - Create calendar event
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (!data.date || !data.kind) {
    return json({ error: 'Date and kind are required' }, { status: 400 });
  }

  try {
    const result = await transaction(async (client) => {
      // Create base event
      const eventResult = await client.query(
        `INSERT INTO calendar_events (kind, date, title, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, kind, date, title, note, created_at`,
        [data.kind, data.date, data.title || '', data.note || '']
      );

      const event = eventResult.rows[0];

      // Create kind-specific data
      if (data.kind === 'loading') {
        await client.query(
          `INSERT INTO loading_events (id, carrier, window_start, window_end)
           VALUES ($1, $2, $3, $4)`,
          [
            event.id,
            data.carrier || '',
            data.window?.start || null,
            data.window?.end || null
          ]
        );

        // Link POs if provided
        if (data.poList && Array.isArray(data.poList)) {
          for (const poNumber of data.poList) {
            const orderResult = await client.query(
              `SELECT id FROM draft_orders WHERE po_number = $1`,
              [poNumber]
            );
            if (orderResult.rowCount > 0) {
              await client.query(
                `INSERT INTO loading_event_pos (loading_event_id, draft_order_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [event.id, orderResult.rows[0].id]
              );
            }
          }
        }
      } else if (data.kind === 'meeting') {
        await client.query(
          `INSERT INTO meeting_events (id, start_time, end_time, location, attendees)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            event.id,
            data.start || null,
            data.end || null,
            data.location || '',
            data.attendees || []
          ]
        );
      }

      return event;
    });

    return json({
      id: result.id,
      kind: result.kind,
      date: result.date?.toISOString().slice(0, 10),
      title: result.title,
      note: result.note,
      createdAt: result.created_at?.toISOString()
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create calendar event:', err);
    return json({ error: 'Failed to create event' }, { status: 500 });
  }
};
