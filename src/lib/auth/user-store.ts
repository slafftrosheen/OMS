// user-store.ts
// Re-export from consolidated users store for backward compatibility
import { writable, derived } from 'svelte/store';
import type { User, Section } from './types';
import { base } from '$app/paths';

const isBrowser = typeof window !== 'undefined';

// Main current user store
export const currentUser = writable<User | null>(null);

// Utility for switching section
export function switchSection(section: Section) {
  currentUser.update(u => {
    if (u && u.sections.includes(section)) {
      return { ...u, primarySection: section };
    }
    return u;
  });
}

/**
 * Load current user from session
 */
export async function loadCurrentUser(): Promise<User | null> {
  if (!isBrowser) return null;
  
  try {
    const res = await fetch(`${base}/api/auth`);
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        const user: User = {
          username: data.user.username,
          displayName: data.user.displayName,
          passwordHash: '',
          primarySection: data.user.primarySection,
          sections: data.user.sections,
          roles: data.user.roles,
          stations: data.user.stations || []
        };
        currentUser.set(user);
        return user;
      }
    }
  } catch (err) {
    console.error('Failed to load current user:', err);
  }
  currentUser.set(null);
  return null;
}

/**
 * Logout current user
 */
export async function logout(): Promise<void> {
  if (!isBrowser) return;
  
  try {
    await fetch(`${base}/api/auth`, { method: 'DELETE' });
  } catch (err) {
    console.error('Logout failed:', err);
  }
  currentUser.set(null);
}
