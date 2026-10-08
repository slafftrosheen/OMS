import type { User, Role } from './types';

// ---------------------------------------------------------------
// Role hierarchy helpers
// ---------------------------------------------------------------

const SUPERUSERS: Role[] = ['RD', 'Boss'];

export function isSuperuser(user: User | null): boolean {
  return !!user && SUPERUSERS.includes(user.role);
}

export function isHeadOfProduction(user: User | null): boolean {
  return !!user && user.role === 'HeadOfProduction';
}

export function isStationHead(user: User | null): boolean {
  return !!user && user.role === 'StationHead';
}

export function isOperator(user: User | null): boolean {
  return !!user && user.role === 'Operator';
}

export function hasRoleAtLeast(user: User | null, minRole: Role): boolean {
  if (!user) return false;
  const order: Role[] = ['RD', 'Boss', 'HeadOfProduction', 'StationHead', 'Operator'];
  return order.indexOf(user.role) <= order.indexOf(minRole);
}

// ---------------------------------------------------------------
// Feature-level permission checks
// ---------------------------------------------------------------

export function can(user: User | null, feature: string): boolean {
  if (!user) return false;

  switch (feature) {
    // Full superuser only
    case 'createDraftOrder':
    case 'deleteOrder':
    case 'manageUsers':
    case 'assignRoles':
    case 'viewAiLab':
    case 'useAiLab':
    case 'manageKnowledge':
    case 'viewRDOrders':
      return isSuperuser(user) || isHeadOfProduction(user);

    case 'createRDOrder':
      return isSuperuser(user);

    // Boss only — manual PO assignment is a Boss-level decision
    case 'assignPoNumber':
    case 'voidAndReissue':
      return user.role === 'Boss';

    // Head of Production and above
    case 'editOrder':
    case 'addProductionFiles':
    case 'confirmOrder':
    case 'confirmProduction':
    case 'reviewQueue':
    case 'assignLoadingDay':
    case 'markDispatched':
    case 'viewAllOrders':
    case 'viewPreConfirmedDrafts':
      return hasRoleAtLeast(user, 'HeadOfProduction');

    // Station heads can rename their own station
    case 'editStationName':
      return hasRoleAtLeast(user, 'StationHead');

    // All authenticated users
    case 'viewOrders':
    case 'viewCalendar':
    case 'viewInventory':
    case 'viewProfiles':
    case 'useChat':
    case 'viewNotifications':
      return true;

    default:
      return false;
  }
}

// ---------------------------------------------------------------
// Order lifecycle state machine
// ---------------------------------------------------------------

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'READY_TO_LOAD'
  | 'DISPATCHED'
  | 'ARCHIVED'
  | 'CANCELLED'
  | 'ON_HOLD'
  | 'VOIDED';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT:          'Draft',
  PENDING_REVIEW: 'Pending Review',
  CONFIRMED:      'Confirmed',
  IN_PRODUCTION:  'In Production',
  READY_TO_LOAD:  'Ready to Load',
  DISPATCHED:     'Dispatched',
  ARCHIVED:       'Archived',
  CANCELLED:      'Cancelled',
  ON_HOLD:        'On Hold',
  VOIDED:         'Voided',
};

/**
 * Normalise legacy status values (lower-case 'draft', 'approved', etc.)
 * onto the new uppercase canonical states. Rows already in the wild
 * keep working until backfilled.
 */
export function normaliseStatus(raw: string | null | undefined): OrderStatus {
  if (!raw) return 'DRAFT';
  const upper = raw.toUpperCase();
  switch (upper) {
    case 'DRAFT':           return 'DRAFT';
    case 'PENDING_REVIEW':  return 'PENDING_REVIEW';
    case 'APPROVED':        return 'CONFIRMED';
    case 'CONFIRMED':       return 'CONFIRMED';
    case 'QUEUED':
    case 'IN_PROGRESS':
    case 'IN_PRODUCTION':   return 'IN_PRODUCTION';
    case 'READY_TO_LOAD':   return 'READY_TO_LOAD';
    case 'DISPATCHED':      return 'DISPATCHED';
    case 'COMPLETED':
    case 'ARCHIVED':        return 'ARCHIVED';
    case 'REJECTED':
    case 'CANCELLED':       return 'CANCELLED';
    case 'ON_HOLD':         return 'ON_HOLD';
    case 'VOIDED':          return 'VOIDED';
    default:                return 'DRAFT';
  }
}

/**
 * Whether a user is allowed to view a single draft order based on its
 * status. Mirrors `is_draft_visible_to_user` SQL helper for client-side
 * gating. Server-side enforcement is the RLS policy.
 */
export function canViewOrder(
  user: User | null,
  status: string | null | undefined,
  createdById: string | null | undefined
): boolean {
  if (!user) return false;
  const norm = normaliseStatus(status);
  // Public lifecycle states
  if (norm !== 'DRAFT' && norm !== 'PENDING_REVIEW') return true;
  // Pre-confirmation: creator + privileged roles
  if (createdById && createdById === user.id) return true;
  return isSuperuser(user) || isHeadOfProduction(user);
}

// ---------------------------------------------------------------
// Station-scoped permission
// ---------------------------------------------------------------

export function canEditStation(user: User | null, stationId: string): boolean {
  if (!user) return false;
  if (isSuperuser(user) || isHeadOfProduction(user)) return true;
  if (isStationHead(user)) {
    return user.stations.some(s => s.stationId === stationId && s.isHead);
  }
  return false;
}

export function isAssignedToStation(user: User | null, stationId: string): boolean {
  if (!user) return false;
  return user.stations.some(s => s.stationId === stationId);
}

// ---------------------------------------------------------------
// Draft order notification: HeadOfProduction gets notified
// ---------------------------------------------------------------

export function shouldNotifyOnDraftCreation(user: User | null): boolean {
  return !!user && user.role === 'HeadOfProduction';
}
// ================================================================
// Shared order-status enum for form validation + DB contract alignment
// ================================================================
// Prevents lowercase drift ('draft', 'pending', 'completed') from reaching
// the DB (contract is uppercase: PENDING_REVIEW, CONFIRMED, etc.).

export const VALID_STATUS_VALUES: readonly string[] = [
  'DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION',
  'READY_TO_LOAD', 'DISPATCHED', 'ARCHIVED', 'CANCELLED', 'ON_HOLD', 'VOIDED',
];

export function isValidStatus(value: string | null | undefined): boolean {
  return !!value && VALID_STATUS_VALUES.includes(value.toUpperCase());
}

