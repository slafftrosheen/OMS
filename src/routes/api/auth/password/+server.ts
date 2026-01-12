// src/routes/api/auth/password/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

/**
 * PUT /api/auth/password - Change password for current user
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
  const token = cookies.get('session');
  
  if (!token) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword) {
    return json({ error: 'Current and new password required' }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Get user from session
    const sessionResult = await query(
      `SELECT u.id, u.username, u.password_hash
       FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true`,
      [tokenHash]
    );

    if (sessionResult.rowCount === 0) {
      return json({ error: 'Invalid session' }, { status: 401 });
    }

    const user = sessionResult.rows[0];

    // Verify current password
    let passwordValid = false;
    if (user.password_hash.startsWith('$2b$10$placeholder')) {
      // Placeholder hashes accept any password
      passwordValid = true;
    } else if (user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$')) {
      passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
    } else {
      // Legacy SHA256
      const inputHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
      passwordValid = inputHash === user.password_hash;
    }

    if (!passwordValid) {
      return json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Hash new password with bcrypt
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await transaction(async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newPasswordHash, user.id]
      );

      // Invalidate all other sessions for this user
      await client.query(
        `DELETE FROM user_sessions WHERE user_id = $1 AND token_hash != $2`,
        [user.id, tokenHash]
      );

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (user_id, username, action, entity_type, entity_id)
         VALUES ($1, $2, 'PASSWORD_CHANGE', 'user', $3)`,
        [user.id, user.username, user.id.toString()]
      );
    });

    return json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    return json({ error: 'Failed to change password' }, { status: 500 });
  }
};
