// src/routes/api/station-log/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import crypto from 'crypto';

/**
 * Helper to get user ID from session
 */
async function getUserIdFromSession(cookies: any): Promise<number | null> {
  const token = cookies.get('session');
  if (!token) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await query(
    `SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  return result.rowCount > 0 ? result.rows[0].user_id : null;
}

/**
 * GET /api/station-log - List station log entries
 * Query params: ?po=PO123&station=CNC&limit=100
 */
export const GET: RequestHandler = async ({ url }) => {
  const poNumber = url.searchParams.get('po');
  const station = url.searchParams.get('station');
  const limit = parseInt(url.searchParams.get('limit') || '100');

  let sql = `
    SELECT 
      sl.id, sl.po_number, sl.station, sl.notes, sl.redo_reason,
      sl.logged_at, u.display_name as logged_by_name
    FROM station_log sl
    LEFT JOIN users u ON u.id = sl.logged_by
    WHERE 1=1
  `;

  const params: any[] = [];
  let idx = 1;

  if (poNumber) {
    sql += ` AND sl.po_number = $${idx++}`;
    params.push(poNumber);
  }

  if (station) {
    sql += ` AND sl.station = $${idx++}`;
    params.push(station);
  }

  sql += ` ORDER BY sl.logged_at DESC LIMIT $${idx}`;
  params.push(Math.min(limit, 500));

  try {
    const result = await query(sql, params);

    const logs = result.rows.map(row => ({
      id: row.id,
      po: row.po_number,
      station: row.station,
      notes: row.notes,
      redo: row.redo_reason,
      loggedBy: row.logged_by_name,
      at: row.logged_at?.getTime()
    }));

    return json(logs);
  } catch (err) {
    console.error('Failed to fetch station logs:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/station-log - Create station log entry
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const userId = await getUserIdFromSession(cookies);
  const data = await request.json();

  if (!data.po || !data.station) {
    return json({ error: 'po and station required' }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO station_log (po_number, station, notes, redo_reason, logged_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, po_number, station, notes, redo_reason, logged_at`,
      [
        data.po,
        data.station,
        data.notes || '',
        data.redo || null,
        userId
      ]
    );

    const log = result.rows[0];
    return json({
      id: log.id,
      po: log.po_number,
      station: log.station,
      notes: log.notes,
      redo: log.redo_reason,
      at: log.logged_at?.getTime()
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create station log:', err);
    return json({ error: 'Failed to create log' }, { status: 500 });
  }
};
