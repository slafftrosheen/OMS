import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { isAdmin } from './session';

/**
 * Check if the current user owns a specific resource
 * @param event The SvelteKit request event
 * @param tableName The name of the table where ownership is defined
 * @param resourceId The ID of the resource to check ownership for
 * @param userIdColumn The column name that stores the user ID (defaults to 'created_by')
 */
export async function requireOwnership(
  event: RequestEvent,
  tableName: string,
  resourceId: string,
  userIdColumn: string = 'created_by'
): Promise<boolean> {
  // Get the current user from the session
  const currentUser = event.locals.user;
  
  if (!currentUser) {
    throw error(401, 'Authentication required');
  }

  // Admin can access everything
  if (isAdmin(currentUser)) return true;

  // Query the database to check if the resource belongs to the current user
  const { data, error: dbError } = await event.locals.supabase
    .from(tableName)
    .select(userIdColumn)
    .or(`id.eq.${resourceId},po_number.eq.${resourceId}`)
    .single();

  if (dbError) {
    console.error(`Database error checking ownership for ${tableName} (ID: ${resourceId})`, dbError);
    if (dbError.code === 'PGRST116') throw error(404, 'Resource not found');
    throw error(500, `Database error: ${dbError.message}`);
  }

  if (!data) {
    throw error(404, 'Resource not found');
  }

  const ownerId = data[userIdColumn];
  
  if (ownerId !== currentUser.id) {
    throw error(403, 'Access denied: You do not own this resource');
  }

  return true;
}

/**
 * Check if the current user has a specific role
 * @param event The SvelteKit request event
 * @param requiredRole The role required to access the resource
 */
export async function requireRole(
  event: RequestEvent,
  requiredRole: string
): Promise<boolean> {
  const currentUser = event.locals.user;

  if (!currentUser) {
    throw error(401, 'Authentication required');
  }

  if (isAdmin(currentUser)) return true;

  const hasRole = currentUser.role === requiredRole ||
    Object.values(currentUser.roles ?? {}).includes(requiredRole);

  if (!hasRole) {
    throw error(403, `Access denied: Role '${requiredRole}' required`);
  }

  return true;
}

/**
 * Check if the current user has any of the specified roles
 * @param event The SvelteKit request event
 * @param allowedRoles An array of roles that are allowed to access the resource
 */
export async function requireAnyRole(
  event: RequestEvent,
  allowedRoles: string[]
): Promise<boolean> {
  const currentUser = event.locals.user;

  if (!currentUser) {
    throw error(401, 'Authentication required');
  }

  if (isAdmin(currentUser)) return true;

  const hasAnyRole = allowedRoles.includes(currentUser.role) ||
    Object.values(currentUser.roles ?? {}).some(role => allowedRoles.includes(role));

  if (!hasAnyRole) {
    throw error(403, `Access denied: One of [${allowedRoles.join(', ')}] role required`);
  }

  return true;
}

/**
 * Check if the current user is an admin
 * @param event The SvelteKit request event
 */
export async function requireAdmin(event: RequestEvent): Promise<boolean> {
  const currentUser = event.locals.user;

  if (!currentUser) {
    throw error(401, 'Authentication required');
  }

  if (!isAdmin(currentUser)) {
    throw error(403, 'Access denied: Admin role required');
  }

  return true;
}

/**
 * Check if the current user is authenticated
 * @param event The SvelteKit request event
 */
export async function requireAuth(event: RequestEvent): Promise<boolean> {
  const currentUser = event.locals.user;

  if (!currentUser) {
    throw error(401, 'Authentication required');
  }

  return true;
}
