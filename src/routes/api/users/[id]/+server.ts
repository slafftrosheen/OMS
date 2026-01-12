// src/routes/api/users/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';
import { getSessionUser, isAdmin } from '$lib/server/auth/session';
import bcrypt from 'bcrypt';

/**
 * GET /api/users/[id] - Get single user
 */
export const GET: RequestHandler = async (event) => {
  const { params } = event;

  try {
    const result = await query(
      'SELECT id, username, display_name, email, primary_section, sections, roles, stations, is_active, last_login_at, created_at FROM users WHERE id = $1',
      [params.id]
    );

    if (result.rows.length === 0) {
      throw error(404, 'User not found');
    }
    const user = result.rows[0];

    return json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      primarySection: user.primary_section,
      sections: user.sections,
      roles: user.roles,
      stations: user.stations || [],
      isActive: user.is_active,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to fetch user:', err);
    throw error(500, 'Failed to fetch user');
  }
};

/**
 * PUT /api/users/[id] - Update user (admin only)
 */
export const PUT: RequestHandler = async (event) => {
  const { params, request } = event;

  const currentUser = await getSessionUser(event);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  try {
    const result = await query(
      'UPDATE users SET display_name = $1, email = $2, primary_section = $3, sections = $4, roles = $5, stations = $6, is_active = $7, updated_at = NOW() WHERE id = $8 RETURNING id, username, display_name, email, primary_section, sections, roles, stations, is_active',
      [data.displayName, data.email, data.primarySection, data.sections, data.roles, data.stations, data.isActive, params.id]
    );

    if (result.rows.length === 0) {
      throw error(404, 'User not found');
    }
    const updatedUser = result.rows[0];

    return json({
      id: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.display_name,
      email: updatedUser.email,
      primarySection: updatedUser.primary_section,
      sections: updatedUser.sections,
      roles: updatedUser.roles,
      stations: updatedUser.stations || [],
      isActive: updatedUser.is_active
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to update user:', err);
    throw error(500, 'Failed to update user');
  }
};

/**
 * DELETE /api/users/[id] - Deactivate user (admin only, soft delete)
 */
export const DELETE: RequestHandler = async (event) => {
  const { params } = event;

  const currentUser = await getSessionUser(event);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  if (currentUser.id === params.id) {
    return json({ error: 'Cannot deactivate your own account' }, { status: 400 });
  }

  try {
    await transaction(async (client) => {
      const result = await client.query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id', [params.id]);
      if (result.rows.length === 0) {
        throw error(404, 'User not found');
      }
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [params.id]);
      await client.query('INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)', [currentUser.id, 'DEACTIVATE_USER', 'user', params.id]);
    });

    return json({ success: true });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to deactivate user:', err);
    throw error(500, 'Failed to deactivate user');
  }
};

/**
 * PATCH /api/users/[id] - Reset user password (admin only)
 */
export const PATCH: RequestHandler = async (event) => {
  const { params, request } = event;

  const currentUser = await getSessionUser(event);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  if (data.action !== 'reset_password') {
    throw error(400, 'Invalid action');
  }

  try {
    const tempPassword = data.newPassword || `temp${Math.random().toString(36).slice(2, 10)}`;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

    await transaction(async (client) => {
      const result = await client.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id', [hashedPassword, params.id]);
      if (result.rows.length === 0) {
        throw error(404, 'User not found');
      }
      await client.query('INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)', [currentUser.id, 'PASSWORD_RESET_BY_ADMIN', 'user', params.id]);
    });


    return json({
      success: true,
      temporaryPassword: data.newPassword ? undefined : tempPassword
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to reset password:', err);
    throw error(500, 'Failed to reset password');
  }
};
