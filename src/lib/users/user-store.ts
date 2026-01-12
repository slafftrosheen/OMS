import { writable } from 'svelte/store';
import { base } from '$app/paths';

export type Role = 'SuperAdmin' | 'Admin' | 'StationLead' | 'Operator' | 'Viewer';
export type Section = 'Admin' | 'Production' | 'Logistics';
export type StationTag =
  | 'CAD'
  | 'CNC'
  | 'SANDING'
  | 'BENDING'
  | 'WELDING'
  | 'PAINT'
  | 'ASSEMBLY'
  | 'QC'
  | 'LOGISTICS';

export type User = {
  id: number | string;
  username?: string;
  name: string;
  displayName?: string;
  primarySection?: Section;
  sections?: Section[];
  roles?: Record<Section, Role>;
  role?: Role;  // Legacy compatibility
  stations?: StationTag[];
};

const isBrowser = typeof window !== 'undefined';

// Store for all users (for mentions, lookups, etc.)
export const users = writable<User[]>([]);
export const usersLoading = writable<boolean>(false);

/**
 * Load users from database
 */
export async function loadUsers(): Promise<void> {
  if (!isBrowser) return;
  
  usersLoading.set(true);
  try {
    const res = await fetch(`${base}/api/users`);
    if (res.ok) {
      const data = await res.json();
      users.set(data);
    }
  } catch (err) {
    console.error('Failed to load users:', err);
  } finally {
    usersLoading.set(false);
  }
}
