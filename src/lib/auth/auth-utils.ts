// auth-utils.ts
// Legacy file - functionality moved to $lib/auth/user-store.ts
// Keeping for potential backward compatibility

import type { User } from './types';

/**
 * @deprecated Use login from $lib/auth/user-store instead
 */
export async function fakeAuth(_username: string, _password: string): Promise<User | null> {
  console.warn('fakeAuth is deprecated, use login from $lib/auth/user-store');
  return null;
}

/**
 * @deprecated Use loadCurrentUser from $lib/auth/user-store instead
 */
export async function loadStoredUser(): Promise<User | null> {
  console.warn('loadStoredUser is deprecated, use loadCurrentUser from $lib/auth/user-store');
  return null;
}

/**
 * @deprecated Session is managed server-side, use logout from $lib/auth/user-store
 */
export function saveUser(_user: User | null): void {
  console.warn('saveUser is deprecated, use logout from $lib/auth/user-store');
}
