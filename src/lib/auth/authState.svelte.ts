// user-store.ts
import { base } from '$app/paths';
import { writable } from 'svelte/store';
import type { User, Section } from './types';

const isBrowser = typeof window !== 'undefined';

// Backward compatibility stores (only used in browser)
const userLegacy = writable<User | null>(null);
const loadingLegacy = writable<boolean>(false);
const errorLegacy = writable<string | null>(null);

export class AuthState {
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
    userLegacy.set(u);
  }

  setLoading(l: boolean) {
    this.loading = l;
    loadingLegacy.set(l);
  }

  setError(e: string | null) {
    this.error = e;
    errorLegacy.set(e);
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
    
    // Clear all global stores to prevent data leakage
    const { resetAllStores } = await import('$lib/state/cleanup');
    resetAllStores();
  }
}

// Module-level singleton for use by exported functions
// The constructor's isBrowser check prevents SSR side effects
export const authState = new AuthState();

// Helper to get current instance from context (browser only)
function getInstance(): AuthState | null {
  if (typeof window === 'undefined') return null;
  try {
    // This will be called from components that have access to context
    // For now, we'll keep a module-level reference set by the layout
    return _currentInstance;
  } catch {
    return null;
  }
}

let _currentInstance: AuthState | null = null;

// Called by +layout.svelte to set the current instance
export function setCurrentInstance(instance: AuthState) {
  _currentInstance = instance;
}

// Backward compatibility: export currentUser as a subscribable store
// so files importing { currentUser } from '$lib/auth/authState.svelte' work
export const currentUser = {
  subscribe: userLegacy.subscribe,
  set: (u: User | null) => { authState.setUser(u); },
  update: (fn: (u: User | null) => User | null) => { authState.setUser(fn(authState.user)); }
};

export function createCurrentUserStore(instance: AuthState) {
  const instUserLegacy = writable<User | null>(instance.user);
  const instLoadingLegacy = writable<boolean>(instance.loading);
  const instErrorLegacy = writable<string | null>(instance.error);
  
  function instSyncToLegacy() {
    instUserLegacy.set(instance.user);
    instLoadingLegacy.set(instance.loading);
    instErrorLegacy.set(instance.error);
  }
  
  return {
    subscribe: instUserLegacy.subscribe,
    set: (u: User | null) => { instance.setUser(u); instSyncToLegacy(); },
    update: (fn: (u: User | null) => User | null) => { instance.setUser(fn(instance.user)); instSyncToLegacy(); }
  };
}

export function switchSection(instance: AuthState, section: Section) {
  if (instance.user && instance.user.sections.includes(section)) {
    instance.user = { ...instance.user, primarySection: section };
  }
}

export function getCurrentUser(instance: AuthState) { return instance.user; }
export function getAuthLoading(instance: AuthState) { return instance.loading; }
export function getAuthError(instance: AuthState) { return instance.error; }
export function loadCurrentUser(instance: AuthState, timeoutMs?: number) { return instance.load(timeoutMs); }
export async function logout(instance: AuthState) { return instance.logout(); }
export async function refreshCurrentUser(instance: AuthState) { return instance.load(); }
