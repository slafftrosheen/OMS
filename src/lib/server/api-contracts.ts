export function globalSearchArgs(query: string, limit: number) {
  return { p_query: query, p_limit: limit };
}

export function advancedSearchArgs(
  query: string | null,
  filters: { status?: string[]; priority?: string[]; client?: string },
  limit: number,
  offset: number
) {
  return {
    p_query: query,
    p_status: filters.status?.length ? filters.status : null,
    p_priority: filters.priority?.length ? filters.priority : null,
    p_client: filters.client?.trim() || null,
    p_limit: limit,
    p_offset: offset
  };
}

export function orderSearchArgs(query: string) {
  return { search_query: query };
}

export function qrGenerationArgs(orderId: string, label?: string | null) {
  return { p_order_id: orderId, p_label: label?.trim() || null };
}

export function normalizeAdvancedFilters(filters: Record<string, unknown>) {
  const status = Array.isArray(filters.status) ? filters.status.filter((x): x is string => typeof x === 'string') : (typeof filters.status === 'string' && filters.status ? [filters.status] : []);
  const priority = Array.isArray(filters.priority) ? filters.priority.filter((x): x is string => typeof x === 'string') : (typeof filters.priority === 'string' && filters.priority ? [filters.priority] : []);
  return { status: status.map((x) => x.toUpperCase()), priority: priority.map((x) => x.toUpperCase()), client: typeof filters.client === 'string' ? filters.client.trim() : '' };
}

export function searchPagination(limitValue: unknown, offsetValue: unknown) {
  const parsedLimit = typeof limitValue === 'number' && Number.isInteger(limitValue) ? limitValue : 50;
  const parsedOffset = typeof offsetValue === 'number' && Number.isInteger(offsetValue) ? offsetValue : 0;
  return { limit: Math.min(100, Math.max(1, parsedLimit)), offset: Math.max(0, parsedOffset) };
}

export function canonicalSearchEntityTypes(value: string | null): string[] {
  const supported = new Set(['order', 'profile', 'material']);
  const requested = value?.split(',').map((entry) => entry.trim()).filter(Boolean);
  return (requested?.length ? requested : ['order', 'profile', 'material']).filter((entry) => supported.has(entry));
}

export function globalSearchResult(row: Record<string, any>) {
  const type = row.kind;
  return {
    entity_type: type,
    entity_id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    description: row.subtitle ?? '',
    url: type === 'order' ? `/orders/${row.id}` : type === 'material' ? `/inventory/${row.id}` : `/admin/users/${row.id}`,
    metadata: { kind: type },
    relevance: row.similarity
  };
}

export function normalizeQrLabel(label?: string | null) { return label?.trim().slice(0, 120) || null; }

export function qrGenerationArgsForOrder(orderId: string, poNumber?: string | null) {
  return qrGenerationArgs(orderId, normalizeQrLabel(poNumber));
}

export function productionOrderStatuses() {
  return ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_LOAD', 'DISPATCHED', 'approved', 'active'];
}

export function mapAnalyticsWorkload(rows: Array<Record<string, any>>, stations: readonly string[]) {
  return Object.fromEntries(stations.map((station) => [station, rows.filter((row) => row.station === station)]));
}

export function dateRangeForTimeframe(timeframe: string, now = new Date()) {
  const from = new Date(now);
  switch (timeframe) {
    case '7d': from.setDate(from.getDate() - 7); break;
    case '90d': from.setDate(from.getDate() - 90); break;
    case '1y': from.setFullYear(from.getFullYear() - 1); break;
    default: from.setDate(from.getDate() - 30); break;
  }
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export function isValidQrSize(size: unknown): size is number {
  return typeof size === 'number' && Number.isInteger(size) && size >= 128 && size <= 1024;
}

export function mapQrSize(size: unknown) { return isValidQrSize(size) ? size : 300; }

export function mapSearchOrderResult(row: Record<string, any>) { return { ...row, href: `/orders/${row.id}` }; }

export function globalSearchResponse(rows: Record<string, any>[], query: string) {
  const results = rows.map(globalSearchResult);
  return { results, query, count: results.length };
}

export function searchRange(limit: unknown, offset: unknown) {
  const range = searchPagination(limit, offset);
  return { ...range, end: range.offset + range.limit - 1 };
}

export function parseAdvancedSearchFilters(filters: Record<string, unknown>) {
  const normalized = normalizeAdvancedFilters(filters);
  return { status: normalized.status.length ? normalized.status : undefined, priority: normalized.priority.length ? normalized.priority : undefined, client: normalized.client || undefined };
}

export function safeSearchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length > 0 && cleaned.length <= 300 ? cleaned : null;
}

export function isValidOrderId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function qrLabelFromOrder(poNumber?: string | null) {
  return poNumber?.trim().slice(0, 120) || null;
}

export const STATION_WORKFLOW = ['CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'] as const;
export const LIVE_RPC_SIGNATURES = {
  global_search: ['p_query', 'p_limit'],
  search_orders: ['search_query'],
  search_orders_advanced: ['p_query', 'p_status', 'p_priority', 'p_client', 'p_limit', 'p_offset'],
  get_order_statistics: ['p_from', 'p_to'],
  get_station_workload: [],
  generate_order_qr_code: ['p_order_id', 'p_label']
} as const;
