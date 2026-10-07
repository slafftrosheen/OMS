export const APPLYABLE_CHANGE_FIELDS = new Set([
  'title', 'client', 'due_date', 'loading_date', 'priority',
  'notes', 'is_rd', 'rd_notes', 'badges', 'status'
]);

export function buildCreateChangeRequestArgs(orderId: string, input: { description?: string; changes?: unknown; proposed_diff?: unknown }) {
  const description = input.description?.trim();
  if (!description) throw new Error('description is required');
  const proposedDiff = input.proposed_diff ?? input.changes ?? {};
  if (!proposedDiff || typeof proposedDiff !== 'object' || Array.isArray(proposedDiff)) throw new Error('proposed_diff must be an object');
  const unsupported = Object.keys(proposedDiff).filter((key) => !APPLYABLE_CHANGE_FIELDS.has(key));
  if (unsupported.length) throw new Error(`Unsupported change field(s): ${unsupported.join(', ')}`);
  return { p_order_id: orderId, p_description: description, p_proposed_diff: proposedDiff as Record<string, unknown> };
}

export function buildReviewChangeRequestArgs(id: string, decision: 'approved' | 'rejected', notes?: string | null) {
  return { p_change_request_id: id, p_decision: decision, p_notes: notes?.trim() || null };
}

export function normalizeChangeRequestRow(row: Record<string, any>) {
  const description = row.description ?? row.title ?? 'Change request';
  return { ...row, title: description, description, changes: row.proposed_diff ?? row.changes ?? {}, proposed_by_user: row.requester ?? row.proposed_by_user ?? null };
}

export const CHANGE_REQUEST_SELECT = `*, requester:profiles!change_requests_requested_by_fkey(id, username, display_name), reviewer:profiles!change_requests_reviewed_by_fkey(id, username, display_name)`;
export const CHANGE_REQUEST_SELECT_WITH_ORDER = `*, requester:profiles!change_requests_requested_by_fkey(id, username, display_name), reviewer:profiles!change_requests_reviewed_by_fkey(id, username, display_name), order:draft_orders(id, title, po_number)`;
export const CHANGE_REQUEST_CREATE_SCHEMA_NOTE = 'Live DB create RPC accepts order id, description, and proposed diff only.';
