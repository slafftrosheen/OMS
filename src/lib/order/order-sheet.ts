/** The saved draft form is the shared production specification, not a new model. */
export interface OrderSheetProfile extends Record<string, unknown> {
  id?: string;
  dbId?: string;
  clientKey?: string;
  profileTemplateId?: string | null;
  profile_template_id?: string | null;
  quantity?: number;
  quantity1?: number;
  quantity2?: number;
  quantity3?: number;
  quantity4?: number;
  configuration?: Record<string, unknown> | null;
  notes?: string | null;
}

export interface OrderSheetSnapshot extends Record<string, unknown> {
  id: string;
  status: string;
  profiles: OrderSheetProfile[];
  updatedAt: string;
  createdBy?: string;
  poNumber?: string | null;
  internalRef?: string | null;
  title?: string;
  clientName?: string;
  deadline?: string | null;
  loadingDate?: string | null;
  priority?: string;
  notes?: string | null;
  deliveryAddress?: string | null;
  deliveryContact?: string | null;
  deliveryPhone?: string | null;
  deliveryEmail?: string | null;
  isRd?: boolean;
  rdNotes?: string | null;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Refuse a wrong/incomplete response instead of displaying an empty default form. */
export function readOrderSheetSnapshot(value: unknown, expectedId: string): OrderSheetSnapshot | null {
  if (!record(value) || value.id !== expectedId || typeof value.status !== 'string'
    || typeof value.updatedAt !== 'string' || !value.updatedAt
    || !Array.isArray(value.profiles) || !value.profiles.every(record)) return null;
  return value as OrderSheetSnapshot;
}

/** Mirrors the existing draft PUT policy; presentation cannot grant permission. */
export function mayEditOrderSheet(
  user: { id?: string; role?: string | null } | null | undefined,
  order: { status?: unknown; createdBy?: unknown; created_by?: unknown } | null | undefined
): boolean {
  if (!user?.id || !order || !['DRAFT', 'draft', 'PENDING_REVIEW'].includes(String(order.status))) return false;
  return ['RD', 'Boss', 'HeadOfProduction'].includes(user.role ?? '')
    || (order.createdBy ?? order.created_by) === user.id;
}

/** A changed account or role/station assignment invalidates a loaded presentation. */
export function orderSheetAccountKey(user: {
  id?: string; role?: string | null; stations?: readonly { stationId: string; isHead?: boolean }[];
} | null | undefined): string {
  if (!user?.id) return '';
  return JSON.stringify([user.id, user.role ?? '', (user.stations ?? [])
    .map(station => [station.stationId, station.isHead === true])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))]);
}

export function profileSheetKey(profile: OrderSheetProfile, index: number): string {
  return profile.dbId || profile.id || profile.clientKey || `saved-profile-${index}`;
}

export function hasNativeProfileConfiguration(value: unknown): value is Record<string, unknown> {
  return record(value) && ['CNC_FREZER', 'BENDER', 'FRONT', 'PAINTING', 'ASSEMBLING']
    .some(section => record(value[section]));
}

export function savedProfileDetails(value: unknown): [string, string][] {
  if (!record(value)) return [];
  return Object.entries(value).filter(([key]) => key !== 'profileName' && key !== 'signType')
    .map(([key, item]) => [key.replaceAll('_', ' '), typeof item === 'string' ? item : JSON.stringify(item) ?? '—']);
}
