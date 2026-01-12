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

  try {
    let sql = `
      SELECT
        ce.id,
        ce.kind,
        ce.date,
        ce.title,
        ce.note,
        ce.created_at,
        le.carrier,
        le.window_start,
        le.window_end,
        (
          SELECT json_agg(do.po_number)
          FROM loading_event_pos lep
          JOIN draft_orders do ON lep.draft_order_id = do.id
          WHERE lep.loading_event_id = le.id
        ) as po_list,
        me.start_time,
        me.end_time,
        me.location,
        me.attendees
      FROM calendar_events ce
      LEFT JOIN loading_events le ON ce.id = le.id AND ce.kind = 'loading'
      LEFT JOIN meeting_events me ON ce.id = me.id AND ce.kind = 'meeting'
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (from) {
      conditions.push(`ce.date >= $${paramIndex++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`ce.date <= $${paramIndex++}`);
      params.push(to);
    }
    if (kind) {
      conditions.push(`ce.kind = $${paramIndex++}`);
      params.push(kind);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY ce.date ASC, ce.created_at ASC';

    const result = await query(sql, params);
    const formattedEvents = result.rows.map(event => {
      const base = {
        id: event.id,
        kind: event.kind,
        date: event.date?.slice(0, 10),
        createdAt: event.created_at,
        note: event.note
      };

      if (event.kind === 'loading') {
        return {
          ...base,
          poList: event.po_list || [],
          carrier: event.carrier,
          window: {
            start: event.window_start?.slice(0, 5),
            end: event.window_end?.slice(0, 5)
          }
        };
      }

      if (event.kind === 'meeting') {
        return {
          ...base,
          title: event.title,
          start: event.start_time?.slice(0, 5),
          end: event.end_time?.slice(0, 5),
          location: event.location,
          attendees: event.attendees
        };
      }

      return {
        ...base,
        title: event.title
      };
    });

    return json(formattedEvents);
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
    const event = await transaction(async (client) => {
      const eventResult = await client.query(
        'INSERT INTO calendar_events (kind, date, title, note) VALUES ($1, $2, $3, $4) RETURNING *',
        [data.kind, data.date, data.title || '', data.note || '']
      );
      const newEvent = eventResult.rows[0];

      if (data.kind === 'loading') {
        await client.query(
          'INSERT INTO loading_events (id, carrier, window_start, window_end) VALUES ($1, $2, $3, $4)',
          [newEvent.id, data.carrier || '', data.window?.start || null, data.window?.end || null]
        );

        if (data.poList && Array.isArray(data.poList) && data.poList.length > 0) {
          const orderResult = await client.query(
            'SELECT id FROM draft_orders WHERE po_number = ANY($1::text[])',
            [data.poList]
          );
          for (const order of orderResult.rows) {
            await client.query(
              'INSERT INTO loading_event_pos (loading_event_id, draft_order_id) VALUES ($1, $2)',
              [newEvent.id, order.id]
            );
          }
        }
      } else if (data.kind === 'meeting') {
        await client.query(
          'INSERT INTO meeting_events (id, start_time, end_time, location, attendees) VALUES ($1, $2, $3, $4, $5)',
          [newEvent.id, data.start || null, data.end || null, data.location || '', data.attendees || []]
        );
      }

      return newEvent;
    });

    return json({
      id: event.id,
      kind: event.kind,
      date: event.date?.slice(0, 10),
      title: event.title,
      note: event.note,
      createdAt: event.created_at
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create calendar event:', err);
    return json({ error: 'Failed to create event' }, { status: 500 });
  }
};
