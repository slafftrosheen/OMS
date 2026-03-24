import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as private_env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { building } from '$app/environment';

// Helper to get safe env var
const getEnv = (key: string, fallback: string = '') => {
  const val =
    (env && env[key]) ||
    (private_env && (private_env as any)[key]) ||
    (process?.env && process.env[key]);
  return val || fallback;
};

// Create a global Supabase client for server-side admin tasks
// Ensure we have valid values to avoid build crashes
let globalUrl = getEnv('PUBLIC_SUPABASE_URL', 'http://localhost:8000').trim();
let globalKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('PUBLIC_SUPABASE_ANON_KEY', 'anon-key').trim();

// Fallback for build environment — use local placeholder
if (building && (!globalUrl || !globalUrl.startsWith('http'))) {
  globalUrl = 'http://localhost:8000';
}
if (building && !globalKey) {
  globalKey = 'placeholder-key';
}

// Ensure strict non-empty strings for createClient
if (!globalUrl) globalUrl = 'http://localhost:8000';
if (!globalKey) globalKey = 'placeholder-key';

export const supabase = createClient(globalUrl, globalKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

export const createSupabaseClient = (event: RequestEvent) => {
  // Try multiple sources for environment variables
  let supabaseUrl = getEnv('PUBLIC_SUPABASE_URL', '').trim();
  let supabaseAnonKey = getEnv('PUBLIC_SUPABASE_ANON_KEY', '').trim();

  // Fallback for build environment
  if (building) {
    if (!supabaseUrl || !supabaseUrl.startsWith('http')) supabaseUrl = 'http://localhost:8000';
    if (!supabaseAnonKey) supabaseAnonKey = 'placeholder-key';
  }

  if (!supabaseUrl) {
    const keys = Object.keys(process?.env || {}).filter(k => k.includes('SUPABASE')).join(', ');
    // Don't throw during build, just log
    if (!building) {
        throw new Error(`Missing PUBLIC_SUPABASE_URL. Found keys: [${keys}]`);
    }
    supabaseUrl = 'http://localhost:8000';
  }

  // Strict URL validation (skip during build if placeholder)
  if (!building || supabaseUrl !== 'http://localhost:8000') {
      try {
        new URL(supabaseUrl);
      } catch (e) {
        const preview = supabaseUrl.substring(0, 10) + '...';
        throw new Error(`Invalid URL format for PUBLIC_SUPABASE_URL: "${preview}" (Length: ${supabaseUrl.length}). Error: ${(e as Error).message}`);
      }

      // Extra check for protocol (new URL accepts 'file:', etc)
      if (!/^https?:\/\//.test(supabaseUrl)) {
        throw new Error(`PUBLIC_SUPABASE_URL must start with http:// or https://. Got: "${supabaseUrl.substring(0, 10)}..."`);
      }
  }

  if (!supabaseAnonKey) {
    if (!building) throw new Error('Missing PUBLIC_SUPABASE_ANON_KEY');
    supabaseAnonKey = 'placeholder-key';
  }

  // Debug log to confirm what we are passing (only in dev/runtime)
  if (!building) {
      console.log(`[Supabase] Initializing client with URL: ${supabaseUrl.substring(0, 12)}... (Length: ${supabaseUrl.length})`);
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll: () => {
          return event.cookies.getAll();
        },
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Cookie settings for local HTTP network
              const secureOptions = {
                ...options,
                // Local network uses HTTP — secure must be false
                secure: false,
                // Explicitly set sameSite for CSRF protection
                sameSite: 'lax' as const,
                // HttpOnly for XSS protection
                httpOnly: true,
                // Path defaults to root
                path: options.path || '/'
              };
              event.cookies.set(name, value, secureOptions);
            });
          } catch (e) {
            console.error('Error setting cookies:', e);
            // This might happen if we are not in an action/endpoint where we can set cookies
          }
        }
      }
    }
  );
};
