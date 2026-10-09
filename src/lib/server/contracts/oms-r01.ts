/** Live Supabase contract mappings; no SQL schema changes required. */

export type StationLogInput = {
  orderId?: string;
  station: string;
  logType?: string;
  message?: string;
  newStage?: string | null;
  details?: Record<string, unknown> | null;
  qualityScore?: number | null;
  isIssue?: boolean;
  tags?: string[];
};

export function stationLogRpcArgs(input: StationLogInput) {
  if (typeof input.station !== 'string' || !input.station.trim() ||
      typeof input.logType !== 'string' || !input.logType.trim()) {
    throw new Error('station and logType are required');
  }
  if (input.orderId !== undefined && (typeof input.orderId !== 'string' || !input.orderId.trim())) {
    throw new Error('orderId must be text');
  }
  if (input.details != null && (typeof input.details !== 'object' || Array.isArray(input.details))) {
    throw new Error('details must be an object');
  }
  if (input.message != null && typeof input.message !== 'string') throw new Error('message must be text');
  const details: Record<string, unknown> = { ...(input.details ?? {}) };
  if (input.orderId) details.order_id = input.orderId;
  if (input.message) details.message = input.message;
  if (input.newStage != null) details.new_stage = input.newStage;
  if (input.qualityScore != null) details.quality_score = input.qualityScore;
  if (input.isIssue != null) details.is_issue = input.isIssue;
  if (input.tags != null) details.tags = input.tags;
  // Deployed RPC: create_station_log(p_station TEXT, p_action TEXT, p_details JSONB)
  return {
    p_station: input.station.trim().toUpperCase(),
    p_action: input.logType.trim(),
    p_details: details
  };
}

export const ACTIVE_ORDER_STATUSES = [
  'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_LOAD', 'ON_HOLD'
] as const;

/** The deployed loading_capacity_overview view uses `state`, not capacity_status. */
export function capacityStateFilter(raw: string | null): string | null {
  if (raw === null || raw === '') return null;
  const normalized: Record<string, string> = {
    ok: 'open', warning: 'tight', open: 'open',
    tight: 'tight', full: 'full', blocked: 'blocked'
  };
  return normalized[raw.toLowerCase()] ?? null;
}

export function mergeOrderExportRows<
  T extends { id: string; loading_date?: string | null },
  D extends { date: string },
  A extends { draft_order_id: string; assignee_id: string }
>(orders: T[], days: D[], assignees: A[]) {
  const dayByDate = new Map(days.map(day => [day.date, day]));
  const usersByOrder = new Map<string, string[]>();
  for (const assignee of assignees) {
    const list = usersByOrder.get(assignee.draft_order_id) ?? [];
    if (!list.includes(assignee.assignee_id)) list.push(assignee.assignee_id);
    usersByOrder.set(assignee.draft_order_id, list);
  }
  return orders.map(order => ({
    ...order,
    loading_day: order.loading_date ? dayByDate.get(order.loading_date) ?? null : null,
    assignees_data: usersByOrder.get(order.id) ?? []
  }));
}

export function exportCell(value: unknown): string {
  const flattened = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Spreadsheet applications interpret cells starting with these symbols as formulas.
  const safe = /^[\t\r\n\s]*[=+@-]/.test(flattened) ? "'" + flattened : flattened;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function exportCsv(rows: Record<string, unknown>[], columns: string[]): string {
  if (!columns.length) return '';
  const header = columns.map(exportCell).join(',');
  return [header, ...rows.map(row => columns.map(key => exportCell(row[key])).join(','))].join('\r\n') + '\r\n';
}
