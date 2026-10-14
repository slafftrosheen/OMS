/** Shared client contract for canonical order_files pagination.
 * The /api/files JSON body stays a plain array for existing callers.
 */
export const ORDER_FILE_PAGE_SIZE = 50;
const MAX_FILE_ROWS = 10000;
export type OrderFileItem = { id: string; mimeType?: string; mime_type?: string;
  originalName?: string; file_name?: string };

export function orderFilePageUrl(orderId: string, offset: number, limit: number) {
  if (!orderId.trim() || !Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid file-list pagination request');
  return `/api/files?orderId=${encodeURIComponent(orderId)}&limit=${limit}&offset=${offset}`;
}

export async function fetchOrderFilePage<T extends {id: string}>(
  orderId: string, offset = 0, limit = ORDER_FILE_PAGE_SIZE,
  fetcher: typeof fetch = fetch
): Promise<{files: T[]; total: number}> {
  const res = await fetcher(orderFilePageUrl(orderId, offset, limit), {cache:'no-store'});
  if (!res.ok) throw new Error(`Order files unavailable (HTTP ${res.status})`);
  const rawCount = res.headers.get('X-Total-Count');
  if (rawCount === null || !/^(0|[1-9][0-9]*)$/.test(rawCount))
    throw new Error('Order files response lacks an exact count');
  const total = Number(rawCount);
  if (!Number.isSafeInteger(total)) throw new Error('Invalid order attachment total');
  const payload: unknown = await res.json();
  if (!Array.isArray(payload) || payload.some(row=>!row || typeof row.id !== 'string'))
    throw new Error('Invalid order files response');
  return {files:payload as T[],total};
}

export async function fetchAllOrderFiles<T extends {id: string}>(
  orderId: string, fetcher: typeof fetch = fetch
): Promise<T[]> {
  let offset = 0;
  let total: number | null = null;
  const items: T[] = [];
  do {
    const page = await fetchOrderFilePage<T>(orderId, offset, 100, fetcher);
    if (total !== null && page.total !== total)
      throw new Error('Order attachment list changed during loading; refresh again');
    total = page.total;
    if (total > MAX_FILE_ROWS)
      throw new Error('Order has too many attachments to load safely');
    if (!page.files.length && offset < total)
      throw new Error('Incomplete attachment list; refresh and try again');
    items.push(...page.files);
    offset += page.files.length;
  } while (offset < (total ?? 0));
  // Detect duplicate records caused by concurrent pagination mutations.
  if (new Set(items.map(item=>item.id)).size !== items.length)
    throw new Error('Order attachment list changed during loading; refresh again');
  return items;
}

export async function fetchOrderFilesCount(orderId: string, fetcher:typeof fetch = fetch) {
  return (await fetchOrderFilePage(orderId,0,1,fetcher)).total;
}

/** Local browser notification; never authorizes or persists a server mutation. */
const FILES_CHANGED = 'oms:order-files-changed';
export function announceOrderFilesChanged(orderId:string) {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(FILES_CHANGED,{detail:{orderId}}));
}
export function watchOrderFilesChanged(onChange:(orderId:string)=>void) {
  if (typeof window === 'undefined') return () => {};
  const listener=(event:Event)=>{
    const id=(event as CustomEvent<{orderId?:string}>).detail?.orderId;
    if(typeof id==='string') onChange(id);
  };
  window.addEventListener(FILES_CHANGED,listener);
  return ()=>window.removeEventListener(FILES_CHANGED,listener);
}
