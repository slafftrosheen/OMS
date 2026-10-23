import type { Order, Badge } from './types';
import { blankStages } from './stages';
import { fetchCalendarJson, type CalendarFetchOptions } from '$lib/calendar/calendar-data';

const allowedBadges = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'READY_TO_SHIP', 'DONE', 'URGENT', 'LOW_STOCK', 'R&D', 'DRAFT']);
const string = (value: unknown) => typeof value === 'string' ? value : '';

/** Preserve API identity and lifecycle separately from its human-readable PO number. */
export function normalizeOrderListRow(d: Record<string, any>): Order {
  const status = string(d.status).toUpperCase();
  return {
    id: string(d.id), poNumber: string(d.poNumber ?? d.po_number), status,
    title: string(d.title ?? d.clientName), client: string(d.clientName ?? d.client),
    due: string(d.deadline ?? d.due_date ?? d.due), loadingDate: string(d.loadingDate ?? d.loading_date),
    badges: [...new Set((Array.isArray(d.badges) ? d.badges : []).filter((b: unknown): b is Badge =>
      typeof b === 'string' && allowedBadges.has(b)))],
    priority: d.priority == null ? undefined : String(d.priority), fields: d.fields ?? [], materials: d.materials ?? [],
    stages: d.stages ?? blankStages(), isDraft: status === 'DRAFT' || status === 'PENDING_REVIEW',
    profiles: d.profiles ?? [], isRD: d.isRD === true || d.isRd === true || d.is_rd === true,
    rdNotes: string(d.notes ?? d.rdNotes), redo: d.redo ?? [], redoReasons: d.redoReasons ?? {},
    redoStage: d.redoStage ?? '', redoReason: d.redoReason ?? '', progress: d.progress ?? {}, cycles: d.cycles ?? [],
    defaultBranch: d.defaultBranch ?? 'main', branches: d.branches ?? [], prs: d.prs ?? [], revisions: d.revisions ?? [],
    defaultRevisionId: d.defaultRevisionId ?? '', assignees: d.assignees ?? {}
  };
}

/** Publish only a complete set, so list badges and totals cannot disagree with the calendar. */
export async function fetchOrderListRows(options: CalendarFetchOptions = {}): Promise<Order[]> {
  const rows = new Map<string, Order>();
  for (let page = 1; page <= 100; page += 1) {
    const payload = await fetchCalendarJson(`/api/draft-orders?limit=100&page=${page}`, options);
    const result = payload as { data?: unknown; pagination?: { hasMore?: boolean; totalPages?: number } } | null;
    const items = Array.isArray(payload) ? payload : result?.data;
    if (!Array.isArray(items)) throw new Error('Invalid order list response');
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) throw new Error('Invalid order identity');
      const row = normalizeOrderListRow(item);
      rows.set(row.id, row);
    }
    const more = !Array.isArray(payload) && (result?.pagination?.hasMore === true ||
      (typeof result?.pagination?.totalPages === 'number' && result.pagination.totalPages > page));
    if (!more) return [...rows.values()];
    if (!items.length) throw new Error('Invalid empty order page');
  }
  throw new Error('Order list exceeds the 10,000 record limit');
}
