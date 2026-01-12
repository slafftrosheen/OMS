import { describe, it, expect } from 'vitest';
import { can } from './permission-utils.js';

describe('permission-utils', () => {
  it('SuperAdmin has all permissions in Admin section', () => {
    const user = {
      username: 'boss',
      displayName: 'Boss',
      passwordHash: 'hash',
      primarySection: 'Admin',
      sections: ['Admin', 'Production', 'Logistics'],
      roles: {
        Admin: 'SuperAdmin',
        Production: 'SuperAdmin',
        Logistics: 'SuperAdmin'
      }
    };
    
    expect(can(user, 'Admin', 'createOrder')).toBe(true);
    expect(can(user, 'Admin', 'editInventory')).toBe(true);
    expect(can(user, 'Admin', 'approveChange')).toBe(true);
    expect(can(user, 'Admin', 'assignLoading')).toBe(true);
  });
  
  it('Operator can view and update orders in Production', () => {
    const user = {
      username: 'cnc',
      displayName: 'CNC Operator',
      passwordHash: 'hash',
      primarySection: 'Production',
      sections: ['Production'],
      roles: {
        Admin: 'Viewer',
        Production: 'Operator',
        Logistics: 'Viewer'
      },
      stations: ['CNC']
    };
    
    expect(can(user, 'Production', 'viewOrders')).toBe(true);
    expect(can(user, 'Production', 'updateOrder')).toBe(true);
    expect(can(user, 'Production', 'assignLoading')).toBe(false);
  });
  
  it('StationLead can assign loading in Production', () => {
    const user = {
      username: 'lead',
      displayName: 'Station Lead',
      passwordHash: 'hash',
      primarySection: 'Production',
      sections: ['Production'],
      roles: {
        Admin: 'Viewer',
        Production: 'StationLead',
        Logistics: 'Viewer'
      }
    };
    
    expect(can(user, 'Production', 'viewOrders')).toBe(true);
    expect(can(user, 'Production', 'updateOrder')).toBe(true);
    expect(can(user, 'Production', 'assignLoading')).toBe(true);
  });
  
  it('Viewer can only view, not edit', () => {
    const user = {
      username: 'viewer',
      displayName: 'View Only',
      passwordHash: 'hash',
      primarySection: 'Production',
      sections: ['Production'],
      roles: {
        Admin: 'Viewer',
        Production: 'Viewer',
        Logistics: 'Viewer'
      }
    };
    
    expect(can(user, 'Production', 'viewOrders')).toBe(true);
    expect(can(user, 'Production', 'updateOrder')).toBe(false);
    expect(can(user, 'Production', 'assignLoading')).toBe(false);
  });
  
  it('returns false for null user', () => {
    expect(can(null, 'Admin', 'createOrder')).toBe(false);
  });
  
  it('returns false for unknown feature', () => {
    const user = {
      username: 'boss',
      displayName: 'Boss',
      passwordHash: 'hash',
      primarySection: 'Admin',
      sections: ['Admin'],
      roles: {
        Admin: 'Operator',
        Production: 'Viewer',
        Logistics: 'Viewer'
      }
    };
    
    expect(can(user, 'Admin', 'unknownFeature')).toBe(false);
  });
  
  it('StationLead in Logistics can export manifest', () => {
    const user = {
      username: 'logistics',
      displayName: 'Logistics Lead',
      passwordHash: 'hash',
      primarySection: 'Logistics',
      sections: ['Logistics'],
      roles: {
        Admin: 'Viewer',
        Production: 'Viewer',
        Logistics: 'StationLead'
      }
    };
    
    expect(can(user, 'Logistics', 'viewCalendar')).toBe(true);
    expect(can(user, 'Logistics', 'updateCalendar')).toBe(true);
    expect(can(user, 'Logistics', 'exportManifest')).toBe(true);
  });
});
