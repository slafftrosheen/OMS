/** Presentation-only shop-floor helpers. Never use these to authorize a mutation. */
export function priorityLabel(input: unknown): string {
  const priority = String(input ?? '').trim().toUpperCase();
  if (!priority) return 'Normal';
  if (['CRITICAL', 'URGENT', 'RUSH'].includes(priority)) return 'Urgent';
  if (priority === 'HIGH') return 'High';
  if (priority === 'NORMAL' || priority === 'MEDIUM') return 'Normal';
  if (priority === 'LOW') return 'Low';
  if (/^\d+$/.test(priority)) return 'P' + priority;
  return priority.replaceAll('_', ' ');
}

export function stageStateLabel(input: unknown): string {
  const state = String(input ?? 'NOT_STARTED').trim().toUpperCase();
  return state.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export function dueDateLabel(input: string | null | undefined, locale = 'en-GB'): string {
  if (!input) return 'No due date';
  // Noon local time avoids date-only UTC offsets moving a due date to yesterday.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(input) ? input + 'T12:00:00' : input;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Invalid due date';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function isOrderOverdue(due: string | null | undefined, today: string): boolean {
  if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) return false;
  return due.slice(0, 10) < today.slice(0, 10);
}

/** Lower rank is more urgent. Numbered legacy priorities use larger = higher. */
export function priorityRank(priority: unknown): number {
  const s = String(priority ?? 'NORMAL').trim().toUpperCase();
  if (['CRITICAL', 'URGENT', 'RUSH'].includes(s)) return 0;
  if (s === 'HIGH') return 1;
  if (/^\d+$/.test(s)) return Math.max(0, 20 - Number(s));
  if (s === 'NORMAL' || s === 'MEDIUM') return 20;
  if (s === 'LOW') return 30;
  return 25;
}

export function compareStationOrders(
  a: { priority?: unknown; due_date?: string | null; po_number?: string | null },
  b: { priority?: unknown; due_date?: string | null; po_number?: string | null }
): number {
  const rank = priorityRank(a.priority) - priorityRank(b.priority);
  if (rank !== 0) return rank;
  const due = (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
  return due || String(a.po_number ?? '').localeCompare(String(b.po_number ?? ''));
}
