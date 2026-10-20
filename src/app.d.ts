import type { Session, SupabaseClient } from '@supabase/supabase-js';

declare global {
  /** Compiled by Vite; changes only after building a new OMS application bundle. */
  const __OMS_BUILD_REVISION__: string;
  const __OMS_BUILD_TIME__: string;

  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      getSession: () => Promise<Session | null>;
      user: import('$lib/server/auth/session').SessionUser | null;
    }
    // interface PageData {}
    // interface Error {}
    // interface Platform {}
  }
}

export {};
