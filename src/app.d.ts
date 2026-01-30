import type { Session, SupabaseClient } from '@supabase/supabase-js';

declare global {
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

  interface Window {
    pdfjsLib: any;
  }
}

export {};
