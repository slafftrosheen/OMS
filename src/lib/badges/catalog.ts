import type { IconName } from '$lib/ui/icons';
import { dateKey, localDateKey } from '$lib/calendar/day-summary';

export type BadgeTone = 'neutral' | 'brand' | 'info' | 'success' | 'warn' | 'danger';
export type BadgeDescriptor = {
  id: string;
  icon: IconName;
  tone: BadgeTone;
  labelKey: string;
  values?: Record<string, string | number>;
  detail?: string;
  count?: number;
};

const definitions = {
  draft: ['file-text', 'neutral'], pending_review: ['inspect', 'warn'], confirmed: ['badge-check', 'info'],
  in_production: ['factory', 'brand'], ready_to_load: ['package-check', 'success'], dispatched: ['truck', 'success'],
  archived: ['archive', 'neutral'], cancelled: ['ban', 'neutral'], voided: ['ban', 'danger'],
  on_hold: ['pause', 'warn'], completed: ['check-circle', 'success'], open: ['inbox', 'neutral'],
  unknown: ['help-circle', 'neutral'], urgent: ['zap', 'danger'], high: ['alert-triangle', 'warn'],
  normal: ['minus', 'neutral'], low: ['arrow-right', 'neutral'], priority_number: ['tag', 'neutral'],
  blocked: ['lock', 'danger'], rework: ['rotate-ccw', 'warn'], low_stock: ['package-x', 'warn'], rd: ['beaker', 'info'],
  overdue: ['alert-triangle', 'danger'], due_today: ['clock', 'warn'], due_soon: ['calendar-check', 'warn'],
  loading_today: ['truck', 'info'], loading_scheduled: ['truck', 'neutral'], loading_overdue: ['truck', 'warn'],
  queued: ['clock', 'neutral'], not_started: ['minus', 'neutral'], in_progress: ['activity', 'brand'],
  skipped: ['skip-forward', 'neutral'], notification_order: ['package', 'info'], notification_chat: ['message-square', 'info'],
  notification_inventory: ['boxes', 'warn'], notification_system: ['info', 'neutral'], unread: ['bell', 'brand'],
  read: ['check-check', 'neutral']
} as const satisfies Record<string, readonly [IconName, BadgeTone]>;
export type BadgeId = keyof typeof definitions;

export function badgeDescriptor(id: BadgeId, extra: Partial<BadgeDescriptor> = {}): BadgeDescriptor {
  const [icon, tone] = definitions[id];
  return { id, icon, tone, labelKey: `appBadges.${id}`, ...extra };
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const upper = (value: unknown) => text(value).toUpperCase();
const lifecycle: Record<string, BadgeId> = {
  DRAFT: 'draft', PENDING_REVIEW: 'pending_review', PENDING: 'pending_review', APPROVED: 'confirmed', CONFIRMED: 'confirmed',
  ACTIVE: 'in_production', QUEUED: 'in_production', IN_PROGRESS: 'in_production', IN_PRODUCTION: 'in_production',
  READY_TO_LOAD: 'ready_to_load', READY_TO_SHIP: 'ready_to_load', DISPATCHED: 'dispatched', ARCHIVED: 'archived',
  CANCELLED: 'cancelled', CANCELED: 'cancelled', REJECTED: 'cancelled', VOIDED: 'voided', ON_HOLD: 'on_hold',
  DONE: 'completed', COMPLETED: 'completed', OPEN: 'open'
};
const terminalIds = new Set(['dispatched', 'archived', 'cancelled', 'voided', 'completed']);
export function isTerminalOrderStatus(value: unknown): boolean { return terminalIds.has(lifecycle[upper(value)]); }

/** Presentation only: never infer authorization or workflow transitions from a badge. */
export function lifecycleBadge(value: unknown): BadgeDescriptor | null {
  const status = upper(value);
  if (!status) return null;
  return lifecycle[status] ? badgeDescriptor(lifecycle[status])
    : badgeDescriptor('unknown', { values: { state: status.replaceAll('_', ' ').slice(0, 80) } });
}

export function stageBadge(value: unknown): BadgeDescriptor {
  const state = upper(value);
  const ids: Record<string, BadgeId> = { NOT_STARTED: 'not_started', QUEUED: 'queued', IN_PROGRESS: 'in_progress',
    BLOCKED: 'blocked', REWORK: 'rework', COMPLETED: 'completed', SKIPPED: 'skipped' };
  return badgeDescriptor(ids[state] ?? 'unknown', ids[state] ? {} : { values: { state: state || '—' } });
}

export function priorityBadge(value: unknown): BadgeDescriptor {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (/^\d{1,2}$/.test(normalized)) {
    const priority = Number(normalized);
    return badgeDescriptor('priority_number', { values: { priority }, tone: priority >= 8 ? 'danger' : priority >= 5 ? 'warn' : 'neutral' });
  }
  if (['URGENT', 'RUSH', 'CRITICAL'].includes(normalized)) return badgeDescriptor('urgent');
  return badgeDescriptor(normalized === 'HIGH' ? 'high' : normalized === 'LOW' ? 'low' : 'normal');
}

export function legacyOrderBadge(value: unknown): BadgeDescriptor | null {
  const id: Record<string, BadgeId> = { OPEN: 'open', IN_PROGRESS: 'in_production', BLOCKED: 'blocked',
    READY_TO_SHIP: 'ready_to_load', DONE: 'completed', URGENT: 'urgent', LOW_STOCK: 'low_stock', 'R&D': 'rd', DRAFT: 'draft' };
  return id[upper(value)] ? badgeDescriptor(id[upper(value)]) : null;
}

/** The same evidence produces the same badge on a list, a calendar, or a workstation. */
export function buildOrderBadges(value: unknown, today = localDateKey(new Date()), options: {
  includeLifecycle?: boolean; includePriority?: boolean; includeSchedule?: boolean; includeFlags?: boolean;
} = {}): BadgeDescriptor[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const flags = Array.isArray(row.badges) ? row.badges.map(legacyOrderBadge).filter((b): b is BadgeDescriptor => !!b) : [];
  const status = lifecycleBadge(row.status) ?? (row.isDraft === true ? badgeDescriptor('draft') : null)
    ?? ['completed', 'draft', 'ready_to_load', 'in_production', 'open']
      .map(id => flags.find(flag => flag.id === id)).find(Boolean) ?? null;
  const done = status !== null && terminalIds.has(status.id);
  const result: BadgeDescriptor[] = [];
  const add = (badge: BadgeDescriptor | null) => { if (badge && !result.some(item => item.id === badge.id)) result.push(badge); };
  if (options.includeLifecycle !== false) {
    add(status);
  }
  if (!done && options.includePriority !== false) {
    const priority = priorityBadge(row.priority);
    if (flags.some(flag => flag.id === 'urgent')) add(badgeDescriptor('urgent'));
    else if (['urgent', 'high'].includes(priority.id) || (priority.id === 'priority_number' && priority.tone !== 'neutral')) add(priority);
  }
  if (!done && options.includeFlags !== false) {
    for (const id of ['blocked', 'rework', 'low_stock'] as const) {
      const count = Number(row[`${id === 'low_stock' ? 'low_stock' : id}_stages`]);
      if (flags.some(flag => flag.id === id) || count > 0 || (id === 'rework' && Array.isArray(row.redo) && row.redo.length)) add(badgeDescriptor(id));
    }
  }
  if (!done && options.includeSchedule !== false && dateKey(today)) {
    const due = dateKey(row.deadline ?? row.due_date ?? row.dueDate ?? row.due);
    if (due) {
      const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
      if (days < 0) add(badgeDescriptor('overdue', { detail: due }));
      else if (days === 0) add(badgeDescriptor('due_today', { detail: due }));
      else if (days <= 3) add(badgeDescriptor('due_soon', { detail: due }));
    }
    const loading = dateKey(row.loadingDate ?? row.loading_date);
    if (loading) add(badgeDescriptor(loading === today ? 'loading_today' : loading < today ? 'loading_overdue' : 'loading_scheduled', { detail: loading }));
  }
  if (options.includeFlags !== false && (row.isRD === true || row.is_rd === true || flags.some(flag => flag.id === 'rd'))) add(badgeDescriptor('rd'));
  return result;
}

export function notificationBadge(value: { type?: string; kind?: string; category?: string }): BadgeDescriptor {
  const type = upper(value.type ?? value.kind);
  if (/REWORK/.test(type)) return badgeDescriptor('rework');
  if (/LOW_STOCK|CONSUMPTION_SKIPPED/.test(type)) return badgeDescriptor('low_stock');
  if (/BLOCKED/.test(type)) return badgeDescriptor('blocked');
  const category = upper(value.category);
  if (category === 'CHAT' || /CHAT|MESSAGE|MENTION/.test(type)) return badgeDescriptor('notification_chat');
  if (category === 'INVENTORY' || /INVENTORY/.test(type)) return badgeDescriptor('notification_inventory');
  if (category === 'ORDER' || /ORDER|STAGE|LOADING|ASSIGNMENT/.test(type)) return badgeDescriptor('notification_order');
  return badgeDescriptor('notification_system');
}
