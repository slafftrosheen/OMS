// src/lib/server/auth/session.ts
import type { RequestEvent } from '@sveltejs/kit';

export interface SessionUser {
  id: string; // This will now be the UUID from Supabase
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
  const session = await event.locals.getSession();
  if (!session) {
    return null;
  }

  const { user: supabaseUser } = session;
  const { data: profile, error } = await event.locals.supabase
    .from('profiles')
    .select('*')
    .eq('id', supabaseUser.id)
    .single();

  if (error || !profile) {
    console.error('Profile fetch error:', error);
    // If profile doesn't exist, we might want to return a basic user based on auth data
    // or return null if profiles are strictly required.
    // For now, let's return null if profile is missing, assuming migration will create profiles.
    return null;
  }

  return {
    id: profile.id,
    email: supabaseUser.email,
    username: profile.username,
    displayName: profile.display_name,
    primarySection: profile.primary_section,
    sections: profile.sections,
    roles: profile.roles,
    stations: profile.stations || []
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
