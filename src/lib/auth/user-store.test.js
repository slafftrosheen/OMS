import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { currentUser, switchSection } from './user-store.js';

describe('user-store', () => {
  it('initializes with null user', () => {
    const user = get(currentUser);
    expect(user).toBe(null);
  });
  
  it('can set and get current user', () => {
    const testUser = {
      username: 'test',
      displayName: 'Test User',
      passwordHash: 'hash',
      primarySection: 'Admin',
      sections: ['Admin', 'Production'],
      roles: {
        Admin: 'SuperAdmin',
        Production: 'StationLead',
        Logistics: 'Viewer'
      }
    };
    
    currentUser.set(testUser);
    const user = get(currentUser);
    expect(user).toEqual(testUser);
    
    // Reset for other tests
    currentUser.set(null);
  });
  
  it('switchSection updates primarySection for valid section', () => {
    const testUser = {
      username: 'test',
      displayName: 'Test User',
      passwordHash: 'hash',
      primarySection: 'Admin',
      sections: ['Admin', 'Production', 'Logistics'],
      roles: {
        Admin: 'SuperAdmin',
        Production: 'StationLead',
        Logistics: 'Viewer'
      }
    };
    
    currentUser.set(testUser);
    switchSection('Production');
    
    const user = get(currentUser);
    expect(user?.primarySection).toBe('Production');
    
    // Reset for other tests
    currentUser.set(null);
  });
  
  it('switchSection does not update for invalid section', () => {
    const testUser = {
      username: 'test',
      displayName: 'Test User',
      passwordHash: 'hash',
      primarySection: 'Admin',
      sections: ['Admin'],
      roles: {
        Admin: 'SuperAdmin',
        Production: 'Viewer',
        Logistics: 'Viewer'
      }
    };
    
    currentUser.set(testUser);
    switchSection('Production'); // User doesn't have access to Production
    
    const user = get(currentUser);
    expect(user?.primarySection).toBe('Admin'); // Should remain unchanged
    
    // Reset for other tests
    currentUser.set(null);
  });
});
