/**
 * Round 7 · the orders list remembers where you were.
 *
 * - The view (search, filter, sort, page) lives in the URL, so Back, refresh and
 *   shared links land on the same list.
 * - The ids of the filtered, sorted list are kept for this tab, so an order page
 *   can step to the previous / next order of that same list.
 * Pure helpers; the page and the order screen do the wiring.
 */
export type ListStatus = 'all' | 'draft' | 'active' | 'completed' | 'urgent';
export type ListSort = 'id' | 'client' | 'title' | 'due' | 'loadingDate';
export interface ListView { q: string; status: ListStatus; sort: ListSort; asc: boolean; page: number }

export const DEFAULT_LIST_VIEW: Readonly<ListView> = { q: '', status: 'all', sort: 'due', asc: true, page: 1 };
const STATUSES: readonly ListStatus[] = ['all', 'draft', 'active', 'completed', 'urgent'];
const SORTS: readonly ListSort[] = ['id', 'client', 'title', 'due', 'loadingDate'];

export function parseListView(search: string | URLSearchParams): ListView {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const q = (params.get('q') ?? '').trim().slice(0, 120);
  const status = params.get('status') as ListStatus | null;
  const sort = params.get('sort') as ListSort | null;
  const page = Number(params.get('page'));
  return {
    q,
    status: status && STATUSES.includes(status) ? status : DEFAULT_LIST_VIEW.status,
    sort: sort && SORTS.includes(sort) ? sort : DEFAULT_LIST_VIEW.sort,
    asc: params.get('dir') !== 'desc',
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** "?q=PO-2611&status=urgent&sort=client&dir=desc&page=2" with defaults left out; "" when all default. */
export function serializeListView(view: ListView): string {
  const params = new URLSearchParams();
  const q = view.q.trim().slice(0, 120);
  if (q) params.set('q', q);
  if (view.status !== DEFAULT_LIST_VIEW.status) params.set('status', view.status);
  if (view.sort !== DEFAULT_LIST_VIEW.sort) params.set('sort', view.sort);
  if (!view.asc) params.set('dir', 'desc');
  if (view.page > 1) params.set('page', String(Math.floor(view.page)));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Keep unrelated query parameters (e.g. ?place=) and replace only the list's own. */
export function mergeListSearch(current: string, view: ListView): string {
  const params = new URLSearchParams(current);
  for (const key of ['q', 'status', 'sort', 'dir', 'page']) params.delete(key);
  const own = new URLSearchParams(serializeListView(view));
  own.forEach((value, key) => params.set(key, value));
  const text = params.toString();
  return text ? `?${text}` : '';
}

const SEQUENCE_KEY = 'oms.orderSequence.v1';
const MAX_SEQUENCE = 500;
const ID = /^[A-Za-z0-9-]{1,64}$/;
export interface OrderSequence { ids: string[]; listHref: string }

export function rememberOrderSequence(storage: Pick<Storage, 'setItem'> | null | undefined, ids: readonly string[], listHref: string) {
  const clean = ids.filter(id => ID.test(id)).slice(0, MAX_SEQUENCE);
  const href = listHref.startsWith('/orders') && !listHref.startsWith('//') ? listHref.slice(0, 400) : '/orders';
  try { storage?.setItem(SEQUENCE_KEY, JSON.stringify({ ids: clean, listHref: href })); } catch { /* storage full or blocked */ }
}

export function readOrderSequence(storage: Pick<Storage, 'getItem'> | null | undefined): OrderSequence | null {
  try {
    const data = JSON.parse(storage?.getItem(SEQUENCE_KEY) ?? 'null');
    if (!data || !Array.isArray(data.ids) || typeof data.listHref !== 'string') return null;
    const ids = data.ids.filter((id: unknown): id is string => typeof id === 'string' && ID.test(id)).slice(0, MAX_SEQUENCE);
    const listHref = data.listHref.startsWith('/orders') && !data.listHref.startsWith('//') ? data.listHref : '/orders';
    return { ids, listHref };
  } catch { return null; }
}

export interface OrderNeighbours { index: number; total: number; prev: string | null; next: string | null; listHref: string }
/** Null when the order is not part of the remembered list (opened from a link, search or Telegram). */
export function orderNeighbours(sequence: OrderSequence | null, id: string): OrderNeighbours | null {
  if (!sequence) return null;
  const index = sequence.ids.indexOf(id);
  if (index < 0 || sequence.ids.length < 2) return null;
  return {
    index, total: sequence.ids.length, listHref: sequence.listHref,
    prev: index > 0 ? sequence.ids[index - 1] : null,
    next: index < sequence.ids.length - 1 ? sequence.ids[index + 1] : null,
  };
}

/** "[" and "]" step through the list; ignored while typing or with modifiers. */
export function stepKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: EventTarget | null }): -1 | 1 | 0 {
  if (event.ctrlKey || event.metaKey || event.altKey) return 0;
  const el = event.target as (HTMLElement & { isContentEditable?: boolean }) | null | undefined;
  const tag = el && typeof el === 'object' && 'tagName' in el ? String(el.tagName).toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true) return 0;
  if (el && typeof el.closest === 'function' && el.closest('dialog[open], [role="dialog"], .drawing-workspace')) return 0;
  return event.key === '[' ? -1 : event.key === ']' ? 1 : 0;
}
