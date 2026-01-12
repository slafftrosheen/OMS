// src/lib/server/auth/session.ts
import { query } from '$lib/server/db/connection';
import type { RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';

export interface SessionUser {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  primarySection: string;
  sections: string[];
  roles: Record<string, string>;
  stations: string[];
}

/**
 * Get authenticated user from session cookie
 */
export async function getSessionUser(event: RequestEvent): Promise<SessionUser | null> {
  const token = event.cookies.get('session');
  if (!token) {
    return null;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await query(
      `SELECT u.id, u.username, u.display_name, u.email, u.primary_section,
              u.sections, u.roles, u.stations
       FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      event.cookies.delete('session', { path: '/' });
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      primarySection: user.primary_section,
      sections: user.sections,
      roles: user.roles,
      stations: user.stations || []
    };
  } catch (err) {
    console.error('Session user fetch error:', err);
    return null;
  }
}

/**
 * Check if user has required role in any section
 */
export function hasRole(user: SessionUser, requiredRoles: string[]): boolean {
  return Object.values(user.roles).some(role => requiredRoles.includes(role));
}

/**
 * Check if user is admin (SuperAdmin in Admin section)
 */
export function isAdmin(user: SessionUser): boolean {
  return user.roles.Admin === 'SuperAdmin';
}

/**
 * Require authentication - returns user or throws 401
 */
export async function requireAuth(event: RequestEvent): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!user) {
    throw { status: 401, message: 'Authentication required' };
  }
  return user;
}

/**
 * Require admin role - returns user or throws 403
 */
export async function requireAdmin(event: RequestEvent): Promise<SessionUser> {
  const user = await requireAuth(event);
  if (!isAdmin(user)) {
    throw { status: 403, message: 'Admin access required' };
  }
  return user;
}
