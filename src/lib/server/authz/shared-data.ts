export const SHARED_DATA_MANAGER_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);

export function canManageSharedInventory(role: string | null | undefined): boolean {
  return !!role && SHARED_DATA_MANAGER_ROLES.has(role);
}


const MATERIAL_FIELDS = [
  'category', 'code', 'name_en', 'name_ru', 'name_lv', 'thickness_options', 'metadata',
  'sku', 'stock', 'min_stock', 'max_stock', 'unit', 'location', 'vendor', 'supplier',
  'color_code', 'hex_color', 'barcode', 'price', 'section', 'item_group', 'subgroup', 'note',
  'leftover_data', 'thickness_mm'
] as const;
const LOADING_DAY_FIELDS = ['date', 'max_capacity', 'notes', 'is_blocked'] as const;

function pickFields(input: Record<string, unknown>, allowed: readonly string[]) {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => allowed.includes(key) && value !== undefined));
}

export function validateMaterialInput(input: Record<string, unknown>, partial = false) {
  const value = pickFields(input, MATERIAL_FIELDS);
  if (!partial) {
    if (typeof value.category !== 'string' || !value.category.trim()) throw new Error('category is required');
    if (typeof value.code !== 'string' || !value.code.trim()) throw new Error('code is required');
    if (typeof value.name_en !== 'string' || !value.name_en.trim()) throw new Error('name is required');
  }
  for (const field of ['stock', 'min_stock', 'max_stock', 'price', 'thickness_mm'] as const) {
    const n = value[field];
    if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 0)) throw new Error(`${field} must be a non-negative number`);
  }
  if (value.thickness_options !== undefined && !Array.isArray(value.thickness_options)) throw new Error('thickness_options must be an array');
  if (value.metadata !== undefined && (!value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata))) throw new Error('metadata must be an object');
  if (partial && !Object.keys(value).length) throw new Error('No valid fields supplied');
  return value;
}

export function validateLoadingDayInput(input: Record<string, unknown>, partial = false) {
  const value = pickFields(input, LOADING_DAY_FIELDS);
  if (!partial && (typeof value.date !== 'string' || Number.isNaN(Date.parse(value.date)))) throw new Error('date is required and must be valid');
  if (value.date !== undefined && (typeof value.date !== 'string' || Number.isNaN(Date.parse(value.date)))) throw new Error('date must be valid');
  if (value.max_capacity !== undefined && (!Number.isInteger(value.max_capacity) || Number(value.max_capacity) < 0 || Number(value.max_capacity) > 10000)) throw new Error('max_capacity must be an integer from 0 to 10000');
  if (value.notes !== undefined && typeof value.notes !== 'string') throw new Error('notes must be text');
  if (value.is_blocked !== undefined && typeof value.is_blocked !== 'boolean') throw new Error('is_blocked must be boolean');
  if (partial && !Object.keys(value).length) throw new Error('No valid fields supplied');
  return value;
}

export function normalizeLoadingDayCreate(input: Record<string, unknown>) {
  const value = validateLoadingDayInput({
    ...input,
    notes: input.notes ?? input.note ?? '',
    max_capacity: input.max_capacity ?? 10,
    is_blocked: input.is_blocked ?? false
  });
  if (input.carrier !== undefined) {
    if (typeof input.carrier !== 'string' || input.carrier.length > 120) throw new Error('carrier must be text up to 120 characters');
    if (input.carrier.trim()) value.notes = `Carrier: ${input.carrier.trim()}${value.notes ? ` - ${value.notes}` : ''}`;
  }
  return value;
}

export function mapSharedDataError(err: unknown): { status: number; message: string } {
  const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: unknown }).status) : 0;
  if (status === 401 || status === 403) return { status, message: err instanceof Error ? err.message : 'Access denied' };
  return { status: 400, message: err instanceof Error ? err.message : 'Invalid request' };
}

export function mapDatabaseError(err: { code?: string } | null): { status: number; message: string } {
  if (err?.code === '23505') return { status: 409, message: 'A record with that unique value already exists' };
  if (err?.code === '23503') return { status: 409, message: 'Record is referenced by other data' };
  return { status: 500, message: 'Database operation failed' };
}

export function canDeleteGlobalFile(linkCount: number, visibleLinkCount: number): boolean {
  return linkCount === visibleLinkCount;
}
export function buildStagePatch(station: string, state: string) {
  return { url: `?station=${encodeURIComponent(station)}`, body: { state } };
}
export function updateStageRows<T extends { station: string; state: string }>(rows: T[], station: string, state: string): T[] {
  return rows.map((row) => row.station === station ? { ...row, state } : row);
}
export const ORDER_STAGE_STATES = ['NOT_STARTED', 'QUEUED', 'IN_PROGRESS', 'BLOCKED', 'REWORK', 'COMPLETED'] as const;
export function buildOrderFileLink(orderId: string, fileId: string, fileType: string, displayName: string) {
  return { draft_order_id: orderId, file_id: fileId, file_type: fileType, display_name: displayName };
}
export function formatFileRecord(row: Record<string, any>) {
  return { id: row.id, file_name: row.original_name || row.filename, originalName: row.original_name || row.filename, storedName: row.filename, mime_type: row.mimetype, mimeType: row.mimetype, file_size: row.size, size: row.size, path: row.filepath, uploaded_by: row.uploaded_by, uploadedBy: row.uploaded_by, created_at: row.created_at, uploadedAt: row.created_at, file_type: row.file_type ?? 'attachment', display_name: row.display_name ?? row.original_name ?? row.filename };
}
export function safeDownloadFilename(value: string): string { return value.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'download'; }
export function storageKeyFromFileRow(row: Record<string, any>): string { return row.metadata?.storage_key || row.filepath; }
export const CHANGE_REQUEST_CREATE_SCHEMA_NOTE = 'Live DB create RPC accepts order id, description, and proposed diff only.';
export const CHANGE_REQUEST_SELECT = `*, requester:profiles!change_requests_requested_by_fkey(id, username, display_name), reviewer:profiles!change_requests_reviewed_by_fkey(id, username, display_name)`;
export const CHANGE_REQUEST_SELECT_WITH_ORDER = `*, requester:profiles!change_requests_requested_by_fkey(id, username, display_name), reviewer:profiles!change_requests_reviewed_by_fkey(id, username, display_name), order:draft_orders(id, title, po_number)`;
export function buildCreateChangeRequestArgs(orderId: string, input: { description?: string; changes?: unknown; proposed_diff?: unknown }) {
  const description = input.description?.trim();
  if (!description) throw new Error('description is required');
  const proposedDiff = input.proposed_diff ?? input.changes ?? {};
  if (!proposedDiff || typeof proposedDiff !== 'object' || Array.isArray(proposedDiff)) throw new Error('proposed_diff must be an object');
  const supported = new Set(['title', 'client', 'due_date', 'loading_date', 'priority', 'notes', 'is_rd', 'rd_notes', 'badges', 'status']);
  const unsupported = Object.keys(proposedDiff).filter((key) => !supported.has(key));
  if (unsupported.length) throw new Error(`Unsupported change field(s): ${unsupported.join(', ')}`);
  return { p_order_id: orderId, p_description: description, p_proposed_diff: proposedDiff as Record<string, unknown> };
}
export function buildReviewChangeRequestArgs(id: string, decision: 'approved' | 'rejected', notes?: string | null) { return { p_change_request_id: id, p_decision: decision, p_notes: notes?.trim() || null }; }
export function normalizeChangeRequestRow(row: Record<string, any>) { const description = row.description ?? row.title ?? 'Change request'; return { ...row, title: description, description, changes: row.proposed_diff ?? row.changes ?? {}, proposed_by_user: row.requester ?? row.proposed_by_user ?? null }; }
export function requireSharedDataManagerRole(role: string | null | undefined) { if (!role || !['RD', 'Boss', 'HeadOfProduction'].includes(role)) throw Object.assign(new Error('Shared inventory management requires RD, Boss, or HeadOfProduction'), { status: 403 }); }
