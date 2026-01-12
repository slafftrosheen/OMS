// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';
import { getSessionUser, isAdmin } from '$lib/server/auth/session';
import bcrypt from 'bcrypt';

/**
 * GET /api/users - List all users
 */
export const GET: RequestHandler = async ({ url }) => {
  const activeOnly = url.searchParams.get('active') !== 'false';
  const section = url.searchParams.get('section');

  try {
    let sql = 'SELECT id, username, display_name, primary_section, sections, roles, stations, is_active, last_login_at FROM users';
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (activeOnly) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(true);
    }

    if (section) {
      conditions.push(`sections @> $${paramIndex++}`);
      params.push(JSON.stringify([section]));
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY display_name ASC';

    const result = await query(sql, params);
    const formattedUsers = result.rows.map(row => ({
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

    return json(formattedUsers);
  } catch (err) {
    console.error('Failed to fetch users:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/users - Create new user (admin only)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const currentUser = locals.user;
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
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    const userProfile = await transaction(async (client) => {
      const userResult = await client.query(
        'INSERT INTO users (username, display_name, email, password_hash, primary_section, sections, roles, stations) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [data.username, data.displayName, data.email || null, hashedPassword, data.primarySection || 'Production', data.sections || ['Production'], data.roles || { Admin: 'Viewer', Production: 'Operator', Logistics: 'Viewer' }, data.stations || []]
      );
      const newUser = userResult.rows[0];
      await client.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [newUser.id]);
      return newUser;
    });

    return json({
      id: userProfile.id,
      username: userProfile.username,
      displayName: userProfile.display_name,
      primarySection: userProfile.primary_section,
      sections: userProfile.sections,
      roles: userProfile.roles,
      stations: userProfile.stations || []
    }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create user:', err);
    if (err.code === '23505') { // Unique violation
      return json({ error: 'Username already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create user' }, { status: 500 });
  }
};
