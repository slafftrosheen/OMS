// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import { getSessionUser, isAdmin } from '$lib/server/auth/session';
import bcrypt from 'bcrypt';

/**
 * GET /api/users - List all users
 */
export const GET: RequestHandler = async ({ url }) => {
  const activeOnly = url.searchParams.get('active') !== 'false';
  const section = url.searchParams.get('section');

  let sql = `
    SELECT id, username, display_name, primary_section, sections, roles, stations, is_active, last_login_at
    FROM users
    WHERE 1=1
  `;

  const params: any[] = [];
  let idx = 1;

  if (activeOnly) {
    sql += ` AND is_active = true`;
  }

  if (section) {
    sql += ` AND $${idx} = ANY(sections)`;
    params.push(section);
    idx++;
  }

  sql += ` ORDER BY display_name ASC`;

  try {
    const result = await query(sql, params);
    const users = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      name: row.display_name,
      displayName: row.display_name,
      primarySection: row.primary_section,
      sections: row.sections,
      roles: row.roles,
      stations: row.stations || [],
      isActive: row.is_active,
      lastLoginAt: row.last_login_at
    }));
    return json(users);
  } catch (err) {
    console.error('Failed to fetch users:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/users - Create new user (admin only)
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  // Check admin authorization
  const currentUser = await getSessionUser(cookies);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  if (!data.username || !data.displayName) {
    return json({ error: 'Username and display name required' }, { status: 400 });
  }

  if (!data.password || data.password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);

    const sql = `
      INSERT INTO users (
        username, display_name, password_hash, primary_section, 
        sections, roles, stations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, display_name, primary_section, sections, roles, stations
    `;

    const result = await query(sql, [
      data.username.toLowerCase(),
      data.displayName,
      passwordHash,
      data.primarySection || 'Production',
      data.sections || ['Production'],
      JSON.stringify(data.roles || { Admin: 'Viewer', Production: 'Operator', Logistics: 'Viewer' }),
      data.stations || []
    ]);

    const user = result.rows[0];
    
    // Create default preferences
    await query(
      `INSERT INTO user_preferences (user_id) VALUES ($1)`,
      [user.id]
    );

    return json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      primarySection: user.primary_section,
      sections: user.sections,
      roles: user.roles,
      stations: user.stations || []
    }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create user:', err);
    if (err.code === '23505') {
      return json({ error: 'Username already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create user' }, { status: 500 });
  }
};
