// src/routes/api/calendar/capacity/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/calendar/capacity - Get capacity configuration
 */
export const GET: RequestHandler = async () => {
  try {
    // Get default capacity
    const configResult = await query(
      `SELECT default_capacity FROM capacity_config WHERE config_type = 'loading' AND is_active = true`
    );

    const defaultCapacity = configResult.rowCount > 0 ? configResult.rows[0].default_capacity : 10;

    // Get custom day capacities
    const daysResult = await query(
      `SELECT dc.date, dc.capacity 
       FROM day_capacities dc
       JOIN capacity_config cc ON cc.id = dc.config_id
       WHERE cc.config_type = 'loading' AND cc.is_active = true`
    );

    const customCapacities: Record<string, number> = {};
    for (const row of daysResult.rows) {
      const dateStr = row.date?.toISOString().slice(0, 10);
      if (dateStr) {
        customCapacities[dateStr] = row.capacity;
      }
    }

    return json({
      defaultCapacity,
      customCapacities
    });
  } catch (err) {
    console.error('Failed to fetch capacity config:', err);
    return json({ defaultCapacity: 10, customCapacities: {} });
  }
};

/**
 * PUT /api/calendar/capacity - Update capacity configuration
 */
export const PUT: RequestHandler = async ({ request }) => {
  const data = await request.json();

  try {
    // Ensure config exists
    await query(
      `INSERT INTO capacity_config (config_type, default_capacity)
       VALUES ('loading', 10)
       ON CONFLICT (config_type) DO NOTHING`
    );

    // Update default capacity if provided
    if (data.defaultCapacity !== undefined) {
      await query(
        `UPDATE capacity_config SET default_capacity = $1, updated_at = NOW()
         WHERE config_type = 'loading'`,
        [data.defaultCapacity]
      );
    }

    // Update specific day capacity if provided
    if (data.date && data.capacity !== undefined) {
      const configResult = await query(
        `SELECT id FROM capacity_config WHERE config_type = 'loading'`
      );

      if (configResult.rowCount > 0) {
        const configId = configResult.rows[0].id;
        await query(
          `INSERT INTO day_capacities (config_id, date, capacity)
           VALUES ($1, $2, $3)
           ON CONFLICT (config_id, date) DO UPDATE SET capacity = $3`,
          [configId, data.date, data.capacity]
        );
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to update capacity config:', err);
    return json({ error: 'Failed to update capacity' }, { status: 500 });
  }
};

/**
 * DELETE /api/calendar/capacity - Reset capacity configuration
 */
export const DELETE: RequestHandler = async () => {
  try {
    await query(`UPDATE capacity_config SET default_capacity = 10 WHERE config_type = 'loading'`);
    await query(
      `DELETE FROM day_capacities WHERE config_id IN (
        SELECT id FROM capacity_config WHERE config_type = 'loading'
      )`
    );

    return json({ success: true });
  } catch (err) {
    console.error('Failed to reset capacity config:', err);
    return json({ error: 'Failed to reset capacity' }, { status: 500 });
  }
};
