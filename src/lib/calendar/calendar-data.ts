import { normalizeCalendarOrder, type CalendarOrder } from './day-summary';

export type CalendarFetchOptions = {
  basePath?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Bounded reads/mutations shared by the calendar. The caller owns stale-result protection. */
export async function fetchCalendarJson(path: string, options: CalendarFetchOptions = {}, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason ?? new Error('Calendar request cancelled'));
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('Calendar request timed out')), options.timeoutMs ?? 12_000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await (options.fetcher ?? fetch)(`${options.basePath ?? ''}${path}`, {
      ...init, signal: controller.signal, cache: 'no-store'
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : '';
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

/** Read every advertised page before publishing counts. Never silently show a partial result. */
export async function fetchCalendarOrders(options: CalendarFetchOptions = {}): Promise<CalendarOrder[]> {
  const orders = new Map<string, CalendarOrder>();
  for (let page = 1; page <= 100; page += 1) {
    const payload = await fetchCalendarJson(`/api/draft-orders?limit=100&page=${page}`, options);
    const result = payload as { data?: unknown; pagination?: { hasMore?: boolean; totalPages?: number } } | null;
    const rows = Array.isArray(payload) ? payload : result?.data;
    if (!Array.isArray(rows)) throw new Error('Invalid calendar orders response');
    for (const row of rows) {
      const order = normalizeCalendarOrder(row);
      if (order) orders.set(order.id, order);
    }
    const hasMore = !Array.isArray(payload) && (result?.pagination?.hasMore === true ||
      (typeof result?.pagination?.totalPages === 'number' && result.pagination.totalPages > page));
    if (!hasMore) return [...orders.values()];
    if (!rows.length) throw new Error('Invalid empty calendar order page');
  }
  throw new Error('Calendar order limit reached; narrow the schedule before loading more than 10,000 orders');
}
