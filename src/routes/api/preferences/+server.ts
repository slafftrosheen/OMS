// src/routes/api/preferences/+server.ts
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
 * GET /api/preferences - Get user preferences
 */
export const GET: RequestHandler = async ({ cookies }) => {
  const userId = await getUserIdFromSession(cookies);

  if (!userId) {
    // Return defaults for anonymous users
    return json({
      theme: 'DarkVim',
      locale: 'en',
      scale: 'normal',
      density: 'cozy',
      pdfZoom: 1.0,
      sidebarCollapsed: false,
      notificationsEnabled: true
    });
  }

  try {
    const result = await query(
      `SELECT theme, locale, scale, density, pdf_zoom, 
              sidebar_collapsed, notifications_enabled, custom_settings
       FROM user_preferences WHERE user_id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      // Create default preferences
      await query(`INSERT INTO user_preferences (user_id) VALUES ($1)`, [userId]);
      return json({
        theme: 'DarkVim',
        locale: 'en',
        scale: 'normal',
        density: 'cozy',
        pdfZoom: 1.0,
        sidebarCollapsed: false,
        notificationsEnabled: true
      });
    }

    const prefs = result.rows[0];
    return json({
      theme: prefs.theme,
      locale: prefs.locale,
      scale: prefs.scale,
      density: prefs.density,
      pdfZoom: parseFloat(prefs.pdf_zoom),
      sidebarCollapsed: prefs.sidebar_collapsed,
      notificationsEnabled: prefs.notifications_enabled,
      customSettings: prefs.custom_settings || {}
    });
  } catch (err) {
    console.error('Failed to fetch preferences:', err);
    return json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
};

/**
 * PUT /api/preferences - Update user preferences
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
  const userId = await getUserIdFromSession(cookies);
  const data = await request.json();

  if (!userId) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.theme !== undefined) {
      updates.push(`theme = $${idx++}`);
      params.push(data.theme);
    }
    if (data.locale !== undefined) {
      updates.push(`locale = $${idx++}`);
      params.push(data.locale);
    }
    if (data.scale !== undefined) {
      updates.push(`scale = $${idx++}`);
      params.push(data.scale);
    }
    if (data.density !== undefined) {
      updates.push(`density = $${idx++}`);
      params.push(data.density);
    }
    if (data.pdfZoom !== undefined) {
      updates.push(`pdf_zoom = $${idx++}`);
      params.push(data.pdfZoom);
    }
    if (data.sidebarCollapsed !== undefined) {
      updates.push(`sidebar_collapsed = $${idx++}`);
      params.push(data.sidebarCollapsed);
    }
    if (data.notificationsEnabled !== undefined) {
      updates.push(`notifications_enabled = $${idx++}`);
      params.push(data.notificationsEnabled);
    }
    if (data.customSettings !== undefined) {
      updates.push(`custom_settings = $${idx++}`);
      params.push(JSON.stringify(data.customSettings));
    }

    if (updates.length === 0) {
      return json({ error: 'No fields to update' }, { status: 400 });
    }

    params.push(userId);

    const sql = `
      UPDATE user_preferences 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE user_id = $${idx}
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rowCount === 0) {
      // Create preferences if not exist
      await query(`INSERT INTO user_preferences (user_id) VALUES ($1)`, [userId]);
      // Retry update
      await query(sql, params);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to update preferences:', err);
    return json({ error: 'Failed to update preferences' }, { status: 500 });
  }
};
