/// <reference types="@sveltejs/kit" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Type definitions for SvelteKit environment variables
declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    getSession: () => Promise<import('@supabase/supabase-js').Session | null>;
  }

  interface PageData {
    session: import('@supabase/supabase-js').Session | null;
  }
}