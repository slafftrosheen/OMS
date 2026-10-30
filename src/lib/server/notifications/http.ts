import { json } from '@sveltejs/kit';
import { AccountAccessError } from '$lib/server/auth/active-account';
import { RequestBodyError } from '$lib/server/api/bounded-json';

export const notificationPrivateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export class NotificationRequestError extends Error {
  constructor(message = 'Invalid notification request.', public status = 400) { super(message); }
}
export function notificationErrorResponse(cause: unknown): Response {
  const known = cause instanceof NotificationRequestError || cause instanceof AccountAccessError || cause instanceof RequestBodyError;
  return json({ error: known ? cause.message : 'Notifications are temporarily unavailable.' }, {
    status: known ? cause.status : 503, headers: notificationPrivateHeaders
  });
}
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const isNotificationId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isNotificationType = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_]{0,79}$/i.test(value);
