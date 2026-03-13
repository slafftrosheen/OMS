import { error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';

/**
 * Check if the current user owns a specific resource
 * @param event The SvelteKit request event
 * @param resourceId The ID of the resource to check ownership for
 * @param tableName The name of the table where ownership is defined
 * @param userIdColumn The column name that stores the user ID (defaults to 'created_by')
 */
export async function requireOwnership(
  event: RequestEvent,
  resourceId: string,
  tableName: string,
  userIdColumn: string = 'created_by'
): Promise<boolean> {
  // Get the current user from the session
  const currentUser = event.locals.user;
  
  if (!currentUser) {
    throw error(401, 'Authentication required');
  }

  // Query the database to check if the resource belongs to the current user
  const { data, error: dbError } = await event.locals.supabase
    .from(tableName)
    .select(userIdColumn)
    .eq('id', resourceId)
    .single();

  if (dbError) {
    console.error(`Database error checking ownership for ${tableName}`, dbError);
    throw error(500, 'Internal server error');
  }

  if (!data) {
    // Resource doesn't exist
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

  // Check if the user has the required role
  if (currentUser.role !== requiredRole && currentUser.role !== 'admin') {
    throw error(403, `Access denied: Role '${requiredRole}' or higher required`);
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

  // Check if the user has any of the allowed roles or is an admin
  if (!allowedRoles.includes(currentUser.role) && currentUser.role !== 'admin') {
    throw error(403, `Access denied: One of [${allowedRoles.join(', ')}] or admin role required`);
  }

  return true;
}

/**
 * Check if the current user is an admin
 * @param event The SvelteKit request event
 */
export async function requireAdmin(event: RequestEvent): Promise<boolean> {
  return requireRole(event, 'admin');
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