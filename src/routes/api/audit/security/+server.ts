/**
 * Security Events API
 * Manage security events and incidents
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuditService } from '$lib/server/audit-service';
import { PermissionsService } from '$lib/server/permissions-service';

// GET /api/audit/security - Get security events
export const GET: RequestHandler = async (event) => {
  const { url, locals } = event;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  // Check permission to view security events
  await PermissionsService.requirePermission(user.id, 'system.security');

  const eventType = url.searchParams.get('eventType');
  const severity = url.searchParams.get('severity');
  const resolved = url.searchParams.get('resolved');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    const result = await AuditService.getSecurityEvents(event, {
      eventType: eventType || undefined,
      severity: severity || undefined,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
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
    console.error('[Security Events API] Error:', err);
    throw error(500, 'Failed to fetch security events');
  }
};

// POST /api/audit/security - Create security event
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const { eventType, description, severity = 'medium', userId, metadata } = body;

  if (!eventType || !description) {
    throw error(400, 'Missing required fields: eventType, description');
  }

  try {
    // Only system can create certain security events
    if (['invalid_token', 'account_locked'].includes(eventType)) {
      // These should only come from system
      throw error(403, 'System events can only be created by system');
    }

    const eventId = await AuditService.logSecurityEvent(
      eventType,
      description,
      severity,
      userId,
      metadata
    );

    if (!eventId) {
      throw error(500, 'Failed to log security event');
    }

    return json({ data: { id: eventId } }, { status: 201 });

  } catch (err) {
    console.error('[Security Events API] Error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to create security event');
  }
};

// PATCH /api/audit/security/[id] - Resolve security event
export const PATCH: RequestHandler = async (event) => {
  const { params, request, locals } = event;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  // Check permission to resolve security events
  await PermissionsService.requirePermission(user.id, 'system.security');

  const body = await request.json();
  const { resolutionNotes } = body;

  if (!resolutionNotes) {
    throw error(400, 'Resolution notes are required');
  }

  try {
    const success = await AuditService.resolveSecurityEvent(
      event,
      ((params as Record<string, string|undefined>).id ?? ''),
      user.id,
      resolutionNotes
    );

    if (!success) {
      throw error(500, 'Failed to resolve security event');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Security Events API] Resolve error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to resolve security event');
  }
};