/** Per-type preferences shared by in-app policy and Telegram delivery.
 * The canonical table has one row per (user_id, notification_type), not one email record. */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireActiveAccount } from '$lib/server/auth/active-account';
import { readBoundedJson } from '$lib/server/api/bounded-json';
import { isRecord, isNotificationType, NotificationRequestError,
  notificationErrorResponse, notificationPrivateHeaders } from '$lib/server/notifications/http';

type Preference = { notification_type: string; enabled: boolean };
function project(rows: unknown): Preference[] {
  if (!Array.isArray(rows)) throw new Error('Preference response unavailable');
  return rows.map(row => {
    if (!isRecord(row) || !isNotificationType(row.notification_type)) throw new Error('Invalid preference record');
    return { notification_type: row.notification_type, enabled: row.enabled !== false };
  });
}
function changes(body: unknown): Preference[] {
  if (!isRecord(body)) throw new NotificationRequestError();
  const rows = 'preferences' in body ? (Object.keys(body).length === 1 ? body.preferences : null) : [body];
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) throw new NotificationRequestError('Provide 1–100 per-type preferences.');
  const seen = new Set<string>();
  return rows.map(row => {
    if (!isRecord(row) || Object.keys(row).some(key => !['notification_type', 'enabled'].includes(key))
      || !isNotificationType(row.notification_type) || typeof row.enabled !== 'boolean' || seen.has(row.notification_type)) throw new NotificationRequestError();
    seen.add(row.notification_type);
    return { notification_type: row.notification_type, enabled: row.enabled };
  });
}

/** Missing rows mean the existing default policy; GET never creates records. */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const userId = await requireActiveAccount(locals);
    const { data, error } = await locals.supabase.from('notification_preferences')
      .select('notification_type,enabled').eq('user_id', userId).order('notification_type');
    if (error) throw new Error('Preference read unavailable');
    return json({ data: project(data) }, { headers: notificationPrivateHeaders });
  } catch (cause) { return notificationErrorResponse(cause); }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
  try {
    const userId = await requireActiveAccount(locals);
    const entries = changes(await readBoundedJson(request));
    const { data, error } = await locals.supabase.from('notification_preferences')
      .upsert(entries.map(entry => ({ user_id: userId, ...entry })), { onConflict: 'user_id,notification_type' })
      .select('notification_type,enabled');
    if (error) throw new Error('Preference write unavailable');
    return json({ data: project(data) }, { headers: notificationPrivateHeaders });
  } catch (cause) { return notificationErrorResponse(cause); }
};
