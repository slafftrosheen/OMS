import { writable } from 'svelte/store';
import { base } from '$app/paths';
import { RequestScope } from '$lib/state/request-scope';

export type Role = 'RD' | 'Boss' | 'HeadOfProduction' | 'StationHead' | 'Operator';
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
  roles?: Partial<Record<Section, Role>>;
  role?: Role;
  stations?: Array<{ stationId: string; isHead: boolean }>;
};

const isBrowser = typeof window !== 'undefined';

// Store for all users (for mentions, lookups, etc.)
export const users = writable<User[]>([]);
export const usersLoading = writable<boolean>(false);

// Store for the currently selected user ID (for impersonation/switching in UI)
export const currentUserId = writable<string | number>('');

const directoryReads = new RequestScope();

export function resetUserDirectory() {
  directoryReads.reset();
  users.set([]);
  usersLoading.set(false);
  currentUserId.set('');
}

/** Load the directory once when several open views request it together. */
export function loadUsers(): Promise<void> {
  if (!isBrowser) return Promise.resolve();
  usersLoading.set(true);
  return directoryReads.run('users', async ({ signal, isCurrent }) => {
    try {
      const response = await fetch(`${base}/api/users`, { signal });
      if (!response.ok) return;
      const data = await response.json();
      if (isCurrent() && Array.isArray(data)) users.set(data);
    } catch (error) {
      if (isCurrent()) console.error('Failed to load users:', error);
    }
  }).finally(() => usersLoading.set(directoryReads.size > 0));
}
