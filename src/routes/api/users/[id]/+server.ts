// src/routes/api/users/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';
import { getSessionUser, isAdmin } from '$lib/server/auth/session';
import bcrypt from 'bcrypt';

/**
 * GET /api/users/[id] - Get single user
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    const result = await query(
      `SELECT id, username, display_name, email, primary_section, 
              sections, roles, stations, is_active, last_login_at, created_at
       FROM users WHERE id = $1`,
      [params.id]
    );

    if (result.rows.length === 0) {
      throw error(404, 'User not found');
    }

    const row = result.rows[0];
    return json({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      primarySection: row.primary_section,
      sections: row.sections,
      roles: row.roles,
      stations: row.stations || [],
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at
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
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
  // Check admin authorization
  const currentUser = await getSessionUser(cookies);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  try {
    const result = await query(
      `UPDATE users SET
        display_name = COALESCE($2, display_name),
        email = COALESCE($3, email),
        primary_section = COALESCE($4, primary_section),
        sections = COALESCE($5, sections),
        roles = COALESCE($6, roles),
        stations = COALESCE($7, stations),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, username, display_name, email, primary_section, sections, roles, stations, is_active`,
      [
        params.id,
        data.displayName,
        data.email,
        data.primarySection,
        data.sections,
        data.roles ? JSON.stringify(data.roles) : null,
        data.stations,
        data.isActive
      ]
    );

    if (result.rows.length === 0) {
      throw error(404, 'User not found');
    }

    const row = result.rows[0];
    return json({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      primarySection: row.primary_section,
      sections: row.sections,
      roles: row.roles,
      stations: row.stations || [],
      isActive: row.is_active
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
export const DELETE: RequestHandler = async ({ params, cookies }) => {
  // Check admin authorization
  const currentUser = await getSessionUser(cookies);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  // Prevent self-deactivation
  if (currentUser.id === parseInt(params.id)) {
    return json({ error: 'Cannot deactivate your own account' }, { status: 400 });
  }

  try {
    await transaction(async (client) => {
      // Deactivate user
      const result = await client.query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING username`,
        [params.id]
      );

      if (result.rows.length === 0) {
        throw { status: 404, message: 'User not found' };
      }

      // Invalidate all sessions
      await client.query(
        `DELETE FROM user_sessions WHERE user_id = $1`,
        [params.id]
      );

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (username, action, entity_type, entity_id)
         VALUES ($1, 'USER_DEACTIVATED', 'user', $2)`,
        [result.rows[0].username, params.id]
      );
    });

    return json({ success: true });
  } catch (err: any) {
    if (err.status === 404) throw error(404, err.message);
    console.error('Failed to deactivate user:', err);
    throw error(500, 'Failed to deactivate user');
  }
};

/**
 * PATCH /api/users/[id] - Reset user password (admin only)
 */
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
  // Check admin authorization
  const currentUser = await getSessionUser(cookies);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  if (data.action !== 'reset_password') {
    throw error(400, 'Invalid action');
  }

  try {
    // Generate new temporary password
    const tempPassword = data.newPassword || `temp${Math.random().toString(36).slice(2, 10)}`;
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

    await transaction(async (client) => {
      const result = await client.query(
        `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1 RETURNING username`,
        [params.id, passwordHash]
      );

      if (result.rows.length === 0) {
        throw { status: 404, message: 'User not found' };
      }

      // Invalidate all sessions
      await client.query(
        `DELETE FROM user_sessions WHERE user_id = $1`,
        [params.id]
      );

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (username, action, entity_type, entity_id)
         VALUES ($1, 'PASSWORD_RESET_BY_ADMIN', 'user', $2)`,
        [result.rows[0].username, params.id]
      );
    });

    return json({ 
      success: true, 
      temporaryPassword: data.newPassword ? undefined : tempPassword 
    });
  } catch (err: any) {
    if (err.status === 404) throw error(404, err.message);
    console.error('Failed to reset password:', err);
    throw error(500, 'Failed to reset password');
  }
};
