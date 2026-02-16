// user-store.ts
import { base } from '$app/paths';
import { writable } from 'svelte/store';
import type { User, Section } from './types';

const isBrowser = typeof window !== 'undefined';

class AuthState {
  user = $state<User | null>(null);
  loading = $state<boolean>(false);
  error = $state<string | null>(null);

  constructor() {
    if (isBrowser) {
      this.load();
    }
  }

  setUser(u: User | null) {
    this.user = u;
    syncToLegacy();
  }

  setLoading(l: boolean) {
    this.loading = l;
    syncToLegacy();
  }

  setError(e: string | null) {
    this.error = e;
    syncToLegacy();
  }

  async load(timeoutMs = 10000): Promise<User | null> {
    if (!isBrowser) return null;
    
    this.setLoading(true);
    this.setError(null);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Auth check timeout')), timeoutMs);
    });

    const fetchPromise = async (): Promise<User | null> => {
      try {
        const res = await fetch(`${base}/api/auth`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-cache'
        });

        if (!res.ok) {
          if (res.status === 401) {
            this.setUser(null);
            this.setLoading(false);
            return null;
          }
          const errorText = await res.text().catch(() => 'Unknown error');
          throw new Error(`Auth check failed: ${res.status} ${errorText}`);
        }

        const data = await res.json();
        if (data.user) {
          const user: User = {
            ...data.user,
            passwordHash: ''
          };
          this.setUser(user);
          this.setLoading(false);
          return user;
        }
        
        this.setUser(null);
        this.setLoading(false);
        return null;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.setError(errorMessage);
        this.setUser(null);
        this.setLoading(false);
        return null;
      }
    };

    try {
      return await Promise.race([fetchPromise(), timeoutPromise]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Auth check failed';
      this.setError(errorMessage);
      this.setUser(null);
      this.setLoading(false);
      return null;
    }
  }

  async logout(): Promise<void> {
    if (!isBrowser) return;
    try {
      await fetch(`${base}/api/auth`, { method: 'DELETE', credentials: 'include' });
    } catch (err) {
      console.error('Logout failed:', err);
    }
    this.setUser(null);
    this.setError(null);
  }
}

export const authState = new AuthState();

// Backward compatibility stores
const userLegacy = writable<User | null>(authState.user);
const loadingLegacy = writable<boolean>(authState.loading);
const errorLegacy = writable<string | null>(authState.error);

function syncToLegacy() {
  userLegacy.set(authState.user);
  loadingLegacy.set(authState.loading);
  errorLegacy.set(authState.error);
}

export const currentUser = {
  subscribe: userLegacy.subscribe,
  set: (u: User | null) => authState.setUser(u),
  update: (fn: (u: User | null) => User | null) => authState.setUser(fn(authState.user))
};

export const authLoading = {
  subscribe: loadingLegacy.subscribe
};

export const authError = {
  subscribe: errorLegacy.subscribe
};

export function switchSection(section: Section) {
  if (authState.user && authState.user.sections.includes(section)) {
    authState.user = { ...authState.user, primarySection: section };
    syncToLegacy();
  }
}

export function getCurrentUser() { return authState.user; }
export function getAuthLoading() { return authState.loading; }
export function getAuthError() { return authState.error; }
export function loadCurrentUser(timeoutMs?: number) { return authState.load(timeoutMs); }
export async function logout() { return authState.logout(); }
export async function refreshCurrentUser() { return authState.load(); }
