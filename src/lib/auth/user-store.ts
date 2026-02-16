// user-store.ts
import { base } from '$app/paths';
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
  }

  setLoading(l: boolean) {
    this.loading = l;
  }

  setError(e: string | null) {
    this.error = e;
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

// Backward compatibility wrappers
export const currentUser = {
  subscribe: (fn: (u: User | null) => void) => {
    const cleanup = $effect.root(() => {
      $effect(() => { fn(authState.user); });
    });
    return cleanup;
  },
  set: (u: User | null) => authState.setUser(u),
  update: (fn: (u: User | null) => User | null) => authState.setUser(fn(authState.user))
};

export const authLoading = {
  subscribe: (fn: (l: boolean) => void) => {
    const cleanup = $effect.root(() => {
      $effect(() => { fn(authState.loading); });
    });
    return cleanup;
  }
};

export const authError = {
  subscribe: (fn: (e: string | null) => void) => {
    const cleanup = $effect.root(() => {
      $effect(() => { fn(authState.error); });
    });
    return cleanup;
  }
};

export function switchSection(section: Section) {
  if (authState.user && authState.user.sections.includes(section)) {
    authState.user = { ...authState.user, primarySection: section };
  }
}

export function getCurrentUser() { return authState.user; }
export function getAuthLoading() { return authState.loading; }
export function getAuthError() { return authState.error; }
export function loadCurrentUser(timeoutMs?: number) { return authState.load(timeoutMs); }
export async function logout() { return authState.logout(); }
export async function refreshCurrentUser() { return authState.load(); }