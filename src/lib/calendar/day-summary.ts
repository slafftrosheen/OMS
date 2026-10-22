import type { CalEvent } from './types';

export type CalendarOrder = {
  id: string;
  poNumber: string;
  title: string;
  client: string;
  dueDate: string | null;
  loadingDate: string | null;
  status: string;
  priority: string;
};
export type CalendarLoadingDay = {
  id: string;
  date: string;
  active: boolean;
  note: string;
  carrier: string;
  capacity: number | null;
};
export type CalendarBadgeKind = 'closed' | 'overdue' | 'due' | 'loading' | 'meeting' | 'note';
export type CalendarDayBadge = { kind: CalendarBadgeKind; count: number };
export type CalendarDaySummary = {
  date: string;
  loadingDay: CalendarLoadingDay | null;
  loadingOrders: CalendarOrder[];
  dueOrders: CalendarOrder[];
  events: CalEvent[];
  badges: CalendarDayBadge[];
};

const text = (value: unknown): string => typeof value === 'string' ? value : '';
const terminal = new Set(['DISPATCHED', 'ARCHIVED', 'CANCELLED', 'VOIDED', 'REJECTED', 'DONE', 'COMPLETED']);
const cancelled = new Set(['CANCELLED', 'VOIDED', 'REJECTED']);

/** Calendar dates are civil dates. Never shift them through UTC conversion. */
export function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function dateKey(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const key = value.slice(0, 10);
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(`${key}T12:00:00Z`);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? key : null;
}

export function normalizeCalendarOrder(value: unknown): CalendarOrder | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    poNumber: text(row.poNumber ?? row.po_number),
    title: text(row.title),
    client: text(row.clientName ?? row.client),
    dueDate: dateKey(row.deadline ?? row.dueDate ?? row.due_date ?? row.due),
    loadingDate: dateKey(row.loadingDate ?? row.loading_date),
    status: text(row.status).toUpperCase(),
    priority: text(row.priority).toUpperCase()
  };
}

export function normalizeLoadingDay(value: unknown): CalendarLoadingDay | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const date = dateKey(row.date);
  const id = text(row.id);
  if (!date || !id) return null;
  return {
    id, date,
    active: row.is_blocked !== true && row.active !== false,
    note: text(row.notes ?? row.note),
    carrier: text(row.carrier),
    capacity: typeof row.max_capacity === 'number' && Number.isFinite(row.max_capacity) ? row.max_capacity : null
  };
}

export function normalizeCalendarEvent(value: unknown): CalEvent | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const date = dateKey(row.date);
  if (!text(row.id) || !date || !['loading', 'meeting', 'note', 'reminder'].includes(text(row.kind))) return null;
  const common = { id: text(row.id), date, createdAt: text(row.createdAt ?? row.created_at), note: text(row.note) };
  if (row.kind === 'loading') return {
    ...common, kind: 'loading', carrier: text(row.carrier),
    poList: Array.isArray(row.poList) ? row.poList.filter((po): po is string => typeof po === 'string') : [],
    window: row.window && typeof row.window === 'object'
      ? { start: text((row.window as Record<string, unknown>).start), end: text((row.window as Record<string, unknown>).end) } : undefined
  };
  if (row.kind === 'meeting') return {
    ...common, kind: 'meeting', title: text(row.title), start: text(row.start), end: text(row.end), location: text(row.location),
    attendees: Array.isArray(row.attendees) ? row.attendees.filter((item): item is string => typeof item === 'string') : []
  };
  return { ...common, kind: 'note', title: text(row.title) };
}

export function isOutstandingOrder(order: CalendarOrder): boolean {
  return !terminal.has(order.status);
}

export function buildCalendarDaySummary(date: string, input: {
  orders?: CalendarOrder[];
  loadingDays?: CalendarLoadingDay[];
  events?: CalEvent[];
  today: string;
}): CalendarDaySummary {
  const allOrders = [...new Map((input.orders ?? []).map(order => [order.id, order])).values()];
  const orders = allOrders.filter(order => !cancelled.has(order.status));
  const loadingDay = input.loadingDays?.find(day => day.date === date) ?? null;
  const loadingOrders = orders.filter(order => order.loadingDate === date);
  const dueOrders = orders.filter(order => order.dueDate === date);
  const events = [...new Map((input.events ?? []).filter(event => event.date === date).map(event => [event.id, event])).values()]
    .sort((a, b) => (a.kind === 'meeting' ? a.start ?? '' : '').localeCompare(b.kind === 'meeting' ? b.start ?? '' : ''));
  const outstandingDue = dueOrders.filter(isOutstandingOrder).length;
  const loadingReferences = new Set(loadingOrders.map(order => `id:${order.id}`));
  const ordersByReference = new Map<string, CalendarOrder>();
  for (const order of allOrders) {
    ordersByReference.set(order.id, order);
    if (order.poNumber && order.poNumber !== 'N/A') ordersByReference.set(order.poNumber, order);
  }
  for (const event of events) {
    if (event.kind !== 'loading') continue;
    for (const po of event.poList) {
      const reference = po.trim();
      if (!reference) continue;
      const order = ordersByReference.get(reference);
      if (order && cancelled.has(order.status)) continue;
      loadingReferences.add(order ? `id:${order.id}` : `po:${reference}`);
    }
  }
  const badges: CalendarDayBadge[] = [];
  if (loadingDay && !loadingDay.active) badges.push({ kind: 'closed', count: 0 });
  if (outstandingDue) badges.push({ kind: date < input.today ? 'overdue' : 'due', count: outstandingDue });
  if (loadingDay?.active || loadingOrders.length || events.some(event => event.kind === 'loading')) {
    // Some legacy bookings only have event PO links. Union both sources without
    // counting an assigned order again when its PO also appears on an event.
    badges.push({ kind: 'loading', count: loadingReferences.size });
  }
  for (const kind of ['meeting', 'note'] as const) {
    const count = events.filter(event => event.kind === kind).length;
    if (count) badges.push({ kind, count });
  }
  return { date, loadingDay, loadingOrders, dueOrders, events, badges };
}
