// user-store.ts
// Re-export from consolidated users store for backward compatibility
import { writable, derived } from 'svelte/store';
import type { User, Section } from './types';
import { base } from '$app/paths';

const isBrowser = typeof window !== 'undefined';

// Main current user store
export const currentUser = writable<User | null>(null);

// Auth loading state
export const authLoading = writable<boolean>(false);
export const authError = writable<string | null>(null);

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
 * Load current user from session with timeout
 * @param timeoutMs - Maximum time to wait for auth check (default: 10000ms)
 */
export async function loadCurrentUser(timeoutMs = 10000): Promise<User | null> {
  if (!isBrowser) return null;
  
  authLoading.set(true);
  authError.set(null);

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Auth check timeout')), timeoutMs);
  });

  // Create the fetch promise
  const fetchPromise = async (): Promise<User | null> => {
    try {
      const res = await fetch(`${base}/api/auth`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Ensure cookies are sent
        // Add cache prevention
        cache: 'no-cache'
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Not authenticated - this is normal
          console.log('User not authenticated');
          currentUser.set(null);
          authLoading.set(false);
          return null;
        }
        
        // Other errors
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Auth check failed: ${res.status} ${errorText}`);
      }

      const data = await res.json();
      
      if (data.user) {
        const user: User = {
          id: data.user.id,
          username: data.user.username,
          displayName: data.user.displayName,
          email: data.user.email,
          avatarUrl: data.user.avatarUrl,
          passwordHash: '',
          primarySection: data.user.primarySection,
          sections: data.user.sections || [],
          roles: data.user.roles || {},
          stations: data.user.stations || []
        };
        
        currentUser.set(user);
        authLoading.set(false);
        return user;
      }
      
      // No user in response
      currentUser.set(null);
      authLoading.set(false);
      return null;
    } catch (err) {
      // Network or parsing error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to load current user:', errorMessage);
      authError.set(errorMessage);
      currentUser.set(null);
      authLoading.set(false);
      return null;
    }
  };

  try {
    // Race between fetch and timeout
    return await Promise.race([fetchPromise(), timeoutPromise]);
  } catch (err) {
    // Timeout or other error
    const errorMessage = err instanceof Error ? err.message : 'Auth check failed';
    console.error('Auth check error:', errorMessage);
    authError.set(errorMessage);
    currentUser.set(null);
    authLoading.set(false);
    return null;
  }
}

/**
 * Logout current user
 */
export async function logout(): Promise<void> {
  if (!isBrowser) return;
  
  try {
    await fetch(`${base}/api/auth`, { 
      method: 'DELETE',
      credentials: 'include' 
    });
  } catch (err) {
    console.error('Logout failed:', err);
  }
  
  currentUser.set(null);
  authError.set(null);
}

/**
 * Refresh current user (force reload from server)
 */
export async function refreshCurrentUser(): Promise<User | null> {
  return loadCurrentUser();
}