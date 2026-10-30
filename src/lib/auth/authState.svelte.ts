import { base } from '$app/paths';
import { writable } from 'svelte/store';
import type { User, Role } from './types';

function deriveRoleFromLegacy(roles: Record<string, string> | undefined): Role {
  const values = Object.values(roles ?? {});
  if (values.includes('SuperAdmin')) return 'RD';
  if (values.includes('StationLead')) return 'StationHead';
  return 'Operator';
}

const userStore = writable<User | null>(null);

async function fetchSession(signal: AbortSignal): Promise<User | null> {
  const response = await fetch(`${base}/api/auth`, {
    credentials: 'include', cache: 'no-store', signal
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Auth check failed: ${response.status}`);
  const raw = (await response.json())?.user;
  if (!raw || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    username: raw.username ?? '',
    displayName: raw.displayName ?? raw.display_name ?? raw.username ?? '',
    email: raw.email,
    avatarUrl: raw.avatarUrl ?? raw.avatar_url,
    role: raw.role ?? deriveRoleFromLegacy(raw.roles),
    stations: Array.isArray(raw.stations)
      ? raw.stations.map((station: User['stations'][number] | string) =>
        typeof station === 'string' ? { stationId: station, isHead: false } : station)
      : [],
    primarySection: raw.primarySection,
    sections: raw.sections,
    roles: raw.roles
  };
}

/** One explicit session check owns its timer, request and publication. */
export class AuthState {
  user = $state<User | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  private revision = 0;
  private pending: { controller: AbortController; promise: Promise<User | null> } | null = null;

  private publish(user: User | null) {
    this.user = user;
    userStore.set(user);
  }

  cancelLoad() {
    this.revision++;
    this.pending?.controller.abort();
    this.pending = null;
    this.loading = false;
  }

  setUser(user: User | null) {
    // A login or logout supersedes an older session check, even if its response arrives later.
    this.cancelLoad();
    this.error = null;
    this.publish(user);
  }

  load(timeoutMs = 10000): Promise<User | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (this.pending) return this.pending.promise;
    const revision = ++this.revision;
    const controller = new AbortController();
    this.loading = true;
    this.error = null;
    let timedOut = false;
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error(timedOut ? 'Auth check timeout' : 'Auth check cancelled'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Number.isFinite(timeoutMs) ? Math.max(1, timeoutMs) : 10000);

    const promise = Promise.race([fetchSession(controller.signal), cancelled])
      .then(user => {
        if (revision === this.revision) this.publish(user);
        return this.user;
      })
      .catch(error => {
        if (revision === this.revision) {
          this.error = timedOut ? 'Auth check timeout' : error instanceof Error ? error.message : 'Auth check failed';
          this.publish(null);
        }
        return this.user;
      })
      .finally(() => {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', onAbort);
        if (revision === this.revision) {
          this.pending = null;
          this.loading = false;
        }
      });
    this.pending = { controller, promise };
    return promise;
  }

  async logout(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.setUser(null);
    const revision = this.revision;
    try {
      const { resetAllStores } = await import('$lib/state/cleanup');
      if (revision !== this.revision) return;
      resetAllStores();
    } catch (error) {
      console.error('Session cleanup failed:', error);
    }
    if (revision !== this.revision) return;
    try {
      await fetch(`${base}/api/auth`, { method: 'DELETE', credentials: 'include' });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }
}

// Importing auth state never starts a request. The application shell owns bootstrap.
export const authState = new AuthState();
export const currentUser = {
  subscribe: userStore.subscribe,
  set: (user: User | null) => authState.setUser(user),
  update: (fn: (user: User | null) => User | null) => authState.setUser(fn(authState.user))
};

export function loadCurrentUser(instance: AuthState, timeoutMs?: number) { return instance.load(timeoutMs); }
export function logout(instance: AuthState) { return instance.logout(); }
