// permission-utils.ts
import type { User, Section, Role } from './types';

export function can(user: User | null, section: Section, feature: string): boolean {
  if (!user) return false;
  const role = user.roles[section];
  if (role === 'SuperAdmin') return true;

  // Map specific feature permissions
  const featureMatrix: Record<Section, Record<string, Role[]>> = {
    Admin: {
      createOrder: ['SuperAdmin'],
      editInventory: ['SuperAdmin'],
      approveChange: ['SuperAdmin'],
      assignLoading: ['SuperAdmin'],
    },
    Production: {
      viewOrders: ['StationLead', 'Operator', 'Viewer'],
      updateOrder: ['StationLead', 'Operator'],
      assignLoading: ['StationLead'],
    },
    Logistics: {
      viewCalendar: ['StationLead', 'Operator', 'Viewer'],
      updateCalendar: ['StationLead', 'Operator'],
      exportManifest: ['StationLead'],
    }
  };
  
  return (featureMatrix[section]?.[feature] ?? []).includes(role);
}
