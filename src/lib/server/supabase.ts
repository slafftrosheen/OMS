import pkg from '@supabase/auth-helpers-sveltekit';
const { createServerClient } = pkg;
import { env } from '$env/dynamic/public';
import type { RequestEvent } from '@sveltejs/kit';

export const createSupabaseClient = (event: RequestEvent) => {
  // Fallback to process.env for server-side environments where dynamic env might miss
  const supabaseUrl = env.PUBLIC_SUPABASE_URL || process?.env?.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || process?.env?.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing environment variable: PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing environment variable: PUBLIC_SUPABASE_ANON_KEY');
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
              event.cookies.set(name, value, options);
            });
          } catch {
            // This might happen if we are not in an action/endpoint where we can set cookies
            // e.g. during load functions on server side rendering sometimes
          }
        }
      }
    }
  );
};
