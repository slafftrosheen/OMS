/**
 * Audit Logs API
 * Retrieve and manage audit logs
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuditService } from '$lib/server/audit-service';
import { PermissionsService } from '$lib/server/permissions-service';

// GET /api/audit/logs - Get audit logs
export const GET: RequestHandler = async (event) => {
  const { url, locals } = event;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  // Check permission to view audit logs
  await PermissionsService.requirePermission(user.id, 'system.audit');

  const userId = url.searchParams.get('userId');
  const resourceType = url.searchParams.get('resourceType');
  const action = url.searchParams.get('action');
  const status = url.searchParams.get('status');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    const result = await AuditService.getAuditLogs(event, {
      userId: userId || undefined,
      resourceType: resourceType || undefined,
      action: action || undefined,
      status: status || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset
    });

    return json({
      data: result.data,
      pagination: {
        total: result.total,
        limit,
        offset,
        pages: Math.ceil(result.total / limit)
      }
    });

  } catch (err) {
    console.error('[Audit Logs API] Error:', err);
    throw error(500, 'Failed to fetch audit logs');
  }
};