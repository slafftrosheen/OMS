import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTelegramRuntime } from './telegram-runtime';

type Database = SupabaseClient<any, any, any>;
export interface TrustedNotification {
  user_id: string;
  notification_type: string;
  title: string;
  message?: string | null;
  link?: string | null;
  source_type?: string | null;
  source_id?: string | null;
}

/**
 * Only call from server code after its business action has been authorized.
 * The generic notifications POST endpoint must not use this privileged writer.
 */
export async function publishNotifications(db: Database, rows: TrustedNotification[]): Promise<{ error: unknown | null }> {
  let outbox: Database | undefined;
  try { outbox = (await getTelegramRuntime())?.db; } catch { /* Optional provider configuration must not break the business action. */ }
  return publishNotificationRows(db, rows, outbox);
}

/** The optional outbox client inserts notifications and deliveries in one transaction. */
export async function publishNotificationRows(db: Database, rows: TrustedNotification[], outbox?: Database): Promise<{ error: unknown | null }> {
  let error: unknown | null = null;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100).map(row => ({ ...row, id: randomUUID() }));
    if (outbox) {
      try {
        const result = await outbox.rpc('publish_telegram_notifications', { p_notifications: batch });
        if (!result.error) continue;
      } catch { /* Preserve the ordinary notification when Telegram storage is unavailable. */ }
      // No provider response, notification body or credential is logged.
      console.warn('[notifications] Telegram queue unavailable; preserving in-app notifications.');
    }
    try {
      const result = await db.from('notifications').insert(batch);
      if (result.error) error = result.error;
    } catch { error = new Error('Notification storage unavailable'); }
  }
  return { error };
}
