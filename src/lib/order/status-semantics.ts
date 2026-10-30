/** Read-side lifecycle vocabulary shared by lists, badges and calendar projections.
 * Compatibility aliases are NOT authorization and must never approve transitions. */
const lifecycle = {
  DRAFT: 'draft', PENDING_REVIEW: 'pending_review', PENDING: 'pending_review',
  APPROVED: 'confirmed', CONFIRMED: 'confirmed', ACTIVE: 'in_production',
  QUEUED: 'in_production', IN_PROGRESS: 'in_production', IN_PRODUCTION: 'in_production',
  READY_TO_LOAD: 'ready_to_load', READY_TO_SHIP: 'ready_to_load',
  DISPATCHED: 'dispatched', ARCHIVED: 'archived', CANCELLED: 'cancelled',
  CANCELED: 'cancelled', REJECTED: 'cancelled', VOIDED: 'voided',
  ON_HOLD: 'on_hold', DONE: 'completed', COMPLETED: 'completed', OPEN: 'open'
} as const;
export type OrderLifecycle = typeof lifecycle[keyof typeof lifecycle];
export const orderStatusText = (value: unknown): string => typeof value === 'string' ? value.trim().toUpperCase() : '';
export function orderLifecycle(value: unknown): OrderLifecycle | null {
  const status = orderStatusText(value);
  return Object.prototype.hasOwnProperty.call(lifecycle, status) ? lifecycle[status as keyof typeof lifecycle] : null;
}
export function isTerminalOrderStatus(value: unknown): boolean {
  const state = orderLifecycle(value);
  return state === 'dispatched' || state === 'archived' || state === 'cancelled' || state === 'voided' || state === 'completed';
}
export function isCancelledOrderStatus(value: unknown): boolean {
  const state = orderLifecycle(value);
  return state === 'cancelled' || state === 'voided';
}
/** Explicit (even unknown) status wins. Legacy badges are only a missing-status fallback. */
export function orderStatusFromRecord(row: { status?: unknown; isDraft?: unknown; badges?: unknown }): string {
  const status = orderStatusText(row.status);
  if (status) return status;
  if (row.isDraft === true) return 'DRAFT';
  const badges = new Set(Array.isArray(row.badges) ? row.badges.map(orderStatusText) : []);
  return ['DONE', 'DRAFT', 'READY_TO_SHIP', 'IN_PROGRESS', 'OPEN'].find(value => badges.has(value)) ?? '';
}
