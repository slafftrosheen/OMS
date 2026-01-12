// src/routes/api/loading-days/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/loading-days - List all loading days
 */
export const GET: RequestHandler = async ({ url }) => {
  const activeOnly = url.searchParams.get('active') === 'true';
  const fromDate = url.searchParams.get('from');

  let sql = `SELECT * FROM loading_days WHERE 1=1`;
  const params: any[] = [];
  let idx = 1;

  if (activeOnly) {
    sql += ` AND is_active = true`;
  }

  if (fromDate) {
    sql += ` AND date >= $${idx++}`;
    params.push(fromDate);
  }

  sql += ` ORDER BY date ASC`;

  try {
    const result = await query(sql, params);
    const days = result.rows.map(row => ({
      id: row.id,
      date: row.date?.toISOString().slice(0, 10),
      carrier: row.carrier,
      note: row.note,
      active: row.is_active
    }));
    return json(days);
  } catch (err) {
    console.error('Failed to fetch loading days:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/loading-days - Create or toggle loading day
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (!data.date) {
    return json({ error: 'date is required' }, { status: 400 });
  }

  const id = data.date; // Use date as ID (YYYY-MM-DD)

  try {
    // Upsert: insert or toggle existing
    const sql = `
      INSERT INTO loading_days (id, date, carrier, note, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (id) DO UPDATE SET
        is_active = NOT loading_days.is_active,
        carrier = COALESCE(NULLIF($3, ''), loading_days.carrier),
        note = COALESCE(NULLIF($4, ''), loading_days.note),
        updated_at = NOW()
      RETURNING *
    `;

    const result = await query(sql, [
      id,
      data.date,
      data.carrier || '',
      data.note || ''
    ]);

    const row = result.rows[0];
    return json({
      id: row.id,
      date: row.date?.toISOString().slice(0, 10),
      carrier: row.carrier,
      note: row.note,
      active: row.is_active
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to save loading day:', err);
    return json({ error: 'Failed to save loading day' }, { status: 500 });
  }
};
