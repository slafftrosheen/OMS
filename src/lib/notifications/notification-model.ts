/** The UI view of the canonical notifications table. */
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  notification_type: string;
  category: 'ORDER' | 'CHAT' | 'INVENTORY' | 'SYSTEM';
  reference_id?: string;
  reference_type?: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

function categoryFor(type: string, source: string): Notification['category'] {
  if (source === 'inventory' || /^(inventory|low_stock)/i.test(type)) return 'INVENTORY';
  if (source === 'chat' || /^(chat|message|mention)/i.test(type)) return 'CHAT';
  if (source === 'order' || source === 'stage' || /^(order|station|stage|loading|rework|assignment|consumption)/i.test(type)) return 'ORDER';
  return 'SYSTEM';
}

/** Only application-relative destinations may become notification links. */
export function notificationLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export function normalizeNotification(value: unknown): Notification | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id || typeof row.user_id !== 'string' || !row.user_id || row.is_dismissed === true) return null;
  const type = typeof row.notification_type === 'string' ? row.notification_type : typeof row.type === 'string' ? row.type : 'info';
  const source = typeof row.source_type === 'string' ? row.source_type : typeof row.reference_type === 'string' ? row.reference_type : '';
  return {
    id: row.id,
    user_id: row.user_id,
    title: typeof row.title === 'string' ? row.title : '',
    message: typeof row.message === 'string' ? row.message : '',
    type: type.toUpperCase(),
    notification_type: type,
    category: categoryFor(type, source.toLowerCase()),
    reference_id: typeof row.source_id === 'string' ? row.source_id : typeof row.reference_id === 'string' ? row.reference_id : undefined,
    reference_type: source || undefined,
    link: notificationLink(row.link),
    read: typeof row.is_read === 'boolean' ? row.is_read : row.read === true,
    created_at: typeof row.created_at === 'string' ? row.created_at : ''
  };
}

/** The HTTP endpoint and realtime consumers project the same canonical row.
 * Camel-case aliases remain for existing clients; canonical fields are authoritative. */
export function notificationApiRecord(row: Record<string, unknown>) {
  const notification = normalizeNotification(row);
  if (!notification) return null;
  return {
    ...notification,
    type: notification.notification_type,
    is_read: notification.read,
    is_dismissed: false,
    source_type: notification.reference_type ?? null,
    source_id: notification.reference_id ?? null,
    read_at: typeof row.read_at === 'string' ? row.read_at : null,
    isRead: notification.read,
    sourceType: notification.reference_type ?? null,
    sourceId: notification.reference_id ?? null,
    createdAt: notification.created_at,
    readAt: typeof row.read_at === 'string' ? row.read_at : null
  };
}
