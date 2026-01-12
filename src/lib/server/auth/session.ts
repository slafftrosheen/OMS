// src/lib/server/auth/session.ts
import { createSupabaseClient } from '$lib/server/supabase';
import type { RequestEvent } from '@sveltejs/kit';

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
 * Get authenticated user from Supabase session
 */
export async function getSessionUser(event: RequestEvent): Promise<SessionUser | null> {
  const supabase = createSupabaseClient(event);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { display_name, primary_section, sections, roles, stations, username } = user.user_metadata;

  return {
    id: user.id,
    email: user.email,
    username: username || user.email,
    displayName: display_name || user.email,
    primarySection: primary_section || '',
    sections: sections || [],
    roles: roles || {},
    stations: stations || []
  };
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
