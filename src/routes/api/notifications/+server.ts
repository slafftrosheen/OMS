import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireActiveAccount } from '$lib/server/auth/active-account';
import { readBoundedJson } from '$lib/server/api/bounded-json';
import { notificationApiRecord, notificationLink } from '$lib/notifications/notification-model';
import { isRecord, isNotificationId, isNotificationType, NotificationRequestError,
  notificationErrorResponse, notificationPrivateHeaders } from '$lib/server/notifications/http';

const columns = 'id,user_id,notification_type,title,message,link,is_read,is_dismissed,source_type,source_id,created_at,read_at';

/** Same owner/read/source contract as the realtime notification store. */
export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const userId = await requireActiveAccount(locals);
    const rawLimit = url.searchParams.get('limit') ?? '50';
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 200) throw new NotificationRequestError('Limit must be an integer from 1 to 200.');
    const unread = url.searchParams.get('unreadOnly');
    if (unread !== null && !['true', 'false'].includes(unread)) throw new NotificationRequestError();
    let query = locals.supabase.from('notifications').select(columns).eq('user_id', userId).eq('is_dismissed', false);
    if (unread === 'true') query = query.eq('is_read', false);
    const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Number(rawLimit));
    if (error || !Array.isArray(data)) throw new Error('Notification read unavailable');
    return json(data.map(notificationApiRecord).filter(Boolean), { headers: notificationPrivateHeaders });
  } catch (cause) { return notificationErrorResponse(cause); }
};

/** Untrusted client-created notes are self-only and NEVER use the Telegram publisher. */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const userId = await requireActiveAccount(locals);
    const body = await readBoundedJson(request);
    if (!isRecord(body) || Object.keys(body).some(key => !['userId', 'title', 'type', 'message', 'link', 'sourceType', 'sourceId'].includes(key))) throw new NotificationRequestError();
    if (body.userId !== undefined && body.userId !== userId) throw new NotificationRequestError('Notifications can only be created for your own account.', 403);
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 300 || !isNotificationType(body.type)
      || (body.message !== undefined && (typeof body.message !== 'string' || body.message.length > 5000))
      || (body.link != null && (typeof body.link !== 'string' || body.link.length > 2048 || !notificationLink(body.link)))
      || (body.sourceType != null && !isNotificationType(body.sourceType))
      || (body.sourceId != null && !isNotificationId(body.sourceId))) throw new NotificationRequestError();
    const { data, error } = await locals.supabase.from('notifications').insert({
      user_id: userId, notification_type: body.type, title: body.title.trim(), message: body.message ?? '',
      link: notificationLink(body.link), source_type: body.sourceType ?? null, source_id: body.sourceId ?? null
    }).select(columns).single();
    if (error || !data) throw new Error('Notification write unavailable');
    const result = notificationApiRecord(data);
    if (!result) throw new Error('Invalid notification response');
    return json(result, { status: 201, headers: notificationPrivateHeaders });
  } catch (cause) { return notificationErrorResponse(cause); }
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  try {
    const userId = await requireActiveAccount(locals);
    const body = await readBoundedJson(request);
    if (!isRecord(body) || Object.keys(body).some(key => !['markAllRead', 'ids'].includes(key))) throw new NotificationRequestError();
    const markAll = body.markAllRead === true;
    if (body.markAllRead !== undefined && typeof body.markAllRead !== 'boolean') throw new NotificationRequestError();
    if (markAll ? body.ids !== undefined : !Array.isArray(body.ids) || !body.ids.length || body.ids.length > 200 || !body.ids.every(isNotificationId)) throw new NotificationRequestError('Specify markAllRead or 1–200 notification IDs.');
    let query = locals.supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId).eq('is_read', false).eq('is_dismissed', false);
    if (!markAll) query = query.in('id', [...new Set(body.ids as string[])]);
    const { error } = await query;
    if (error) throw new Error('Notification update unavailable');
    return json({ success: true }, { headers: notificationPrivateHeaders });
  } catch (cause) { return notificationErrorResponse(cause); }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  try {
    const userId = await requireActiveAccount(locals);
    const id = url.searchParams.get('id');
    if (id !== null && !isNotificationId(id)) throw new NotificationRequestError();
    let query = locals.supabase.from('notifications').update({ is_dismissed: true })
      .eq('user_id', userId).eq('is_dismissed', false);
    query = id ? query.eq('id', id) : query.eq('is_read', true);
    const { error } = await query;
    if (error) throw new Error('Notification dismissal unavailable');
    return json({ success: true }, { headers: notificationPrivateHeaders });
  } catch (cause) { return notificationErrorResponse(cause); }
};
