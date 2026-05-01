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

    // Head of Production and above
    case 'editOrder':
    case 'addProductionFiles':
    case 'confirmProduction':
    case 'viewAllOrders':
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
