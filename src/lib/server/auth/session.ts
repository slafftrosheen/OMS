// src/lib/server/auth/session.ts
import type { RequestEvent } from '@sveltejs/kit';

export interface SessionUser {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  role: string;
  stations: any[];
  // Legacy
  primarySection?: string;
  sections?: string[];
  roles?: Record<string, string>;
}

/** Roles with administrative access in the current role model. */
export const ADMIN_ROLES = ['RD', 'Boss', 'HeadOfProduction'] as const;

export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Get authenticated user from Supabase session
 */
export async function getSessionUser(event: RequestEvent): Promise<SessionUser | null> {
  // The hook validates the JWT with auth.getUser() before returning the session.
  const session = await event.locals.getSession();
  if (!session) {
    return null;
  }

  const { user: supabaseUser } = session;
  const { data: profile, error } = await event.locals.supabase
    .from('profiles')
    .select('*, user_stations(*)')
    .eq('id', supabaseUser.id)
    .single();

  if (error || !profile) {
    console.error('Profile fetch error:', error);
    return null;
  }

  return {
    id: profile.id,
    email: supabaseUser.email,
    username: profile.username,
    displayName: profile.display_name,
    role: profile.role || 'Operator',
    stations: profile.user_stations?.map((us: any) => ({
        stationId: us.station_id,
        isHead: us.is_head
    })) || []
  };
}

/**
 * Check if user is admin (RD, Boss, or HeadOfProduction)
 */
export function isAdmin(user: SessionUser): boolean {
  return isAdminRole(user.role);
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
