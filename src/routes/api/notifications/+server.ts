// src/routes/api/notifications/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/notifications - List user notifications
 * Query params: ?unreadOnly=true&limit=50
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json([]);
  }
  const userId = session.user.id;

  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let query = locals.supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_dismissed', false);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  query = query
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));

  const { data: notifications, error } = await query;

  if (error) {
    console.error('Failed to fetch notifications:', error);
    return json([], { status: 500 });
  }

  const transformed = notifications.map(row => ({
    id: row.id,
    type: row.notification_type,
    title: row.title,
    message: row.message,
    link: row.link,
    isRead: row.is_read,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    readAt: row.read_at
  }));

  return json(transformed);
};

/**
 * POST /api/notifications - Create notification
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  if (!data.userId || !data.title || !data.type) {
    return json({ error: 'userId, title, and type required' }, { status: 400 });
  }

  // Assuming userId is UUID now
  const { data: notif, error } = await locals.supabase
    .from('notifications')
    .insert({
      user_id: data.userId,
      notification_type: data.type,
      title: data.title,
      message: data.message || '',
      link: data.link || null,
      source_type: data.sourceType || null,
      source_id: data.sourceId || null
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create notification:', error);
    return json({ error: 'Failed to create notification' }, { status: 500 });
  }

  return json({
    id: notif.id,
    type: notif.notification_type,
    title: notif.title,
    message: notif.message,
    link: notif.link,
    isRead: notif.is_read,
    createdAt: notif.created_at
  }, { status: 201 });
};

/**
 * PUT /api/notifications - Mark notifications as read
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const data = await request.json();

  let updateQuery = locals.supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (data.markAllRead) {
    updateQuery = updateQuery.eq('is_read', false);
  } else if (data.ids && Array.isArray(data.ids)) {
    updateQuery = updateQuery.in('id', data.ids);
  } else {
    // If no specific targets, return success (nothing done) or error
    return json({ success: true });
  }

  const { error } = await updateQuery;

  if (error) {
    console.error('Failed to update notifications:', error);
    return json({ error: 'Failed to update notifications' }, { status: 500 });
  }

  return json({ success: true });
};

/**
 * DELETE /api/notifications - Dismiss notifications
 */
export const DELETE: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const notificationId = url.searchParams.get('id');

  let deleteQuery = locals.supabase
    .from('notifications')
    .update({ is_dismissed: true })
    .eq('user_id', userId);

  if (notificationId) {
    deleteQuery = deleteQuery.eq('id', notificationId);
  } else {
    // Dismiss all read notifications
    deleteQuery = deleteQuery.eq('is_read', true);
  }

  const { error } = await deleteQuery;

  if (error) {
    console.error('Failed to dismiss notifications:', error);
    return json({ error: 'Failed to dismiss notifications' }, { status: 500 });
  }

  return json({ success: true });
};
