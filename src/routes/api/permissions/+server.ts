/**
 * Permissions API
 * Manage user permissions and roles
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';
import { PermissionsService } from '$lib/server/permissions-service';

// GET /api/permissions - Get permissions
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const userId = url.searchParams.get('userId');
  const check = url.searchParams.get('check'); // Single permission check
  const all = url.searchParams.get('all') === 'true';

  try {
    if (check) {
      // Check single permission
      const hasPerm = await PermissionsService.hasPermission(user.id, check);
      return json({ data: { permission: check, has: hasPerm } });
    }

    if (userId) {
      // Get user's permissions
      await PermissionsService.requirePermission(user.id, 'users.manage');
      const permissions = await PermissionsService.getUserPermissions(userId);
      return json({ data: permissions });
    }

    if (all) {
      // Get all available permissions
      await PermissionsService.requirePermission(user.id, 'system.manage');
      const permissions = await PermissionsService.getAllPermissions();
      return json({ data: permissions });
    }

    // Get current user's permissions
    const permissions = await PermissionsService.getUserPermissions(user.id);
    return json({ data: permissions });

  } catch (err) {
    console.error('[Permissions API] Error:', err);
    throw error(500, 'Failed to fetch permissions');
  }
};

// POST /api/permissions/grant - Grant permission to user
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const { userId, permissionName, expiresAt } = body;

  if (!userId || !permissionName) {
    throw error(400, 'Missing required fields: userId, permissionName');
  }

  try {
    // Check if user has permission to grant permissions
    await PermissionsService.requirePermission(user.id, 'users.manage');

    const success = await PermissionsService.grantPermission(
      userId,
      permissionName,
      user.id,
      expiresAt
    );

    if (!success) {
      throw error(500, 'Failed to grant permission');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Permissions API] Grant error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to grant permission');
  }
};

// DELETE /api/permissions/:permissionId - Revoke permission
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  try {
    // Check if user has permission to manage permissions
    await PermissionsService.requirePermission(user.id, 'users.manage');

    const success = await PermissionsService.revokePermission(
      params.permissionId,
      user.id
    );

    if (!success) {
      throw error(500, 'Failed to revoke permission');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Permissions API] Revoke error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to revoke permission');
  }
};