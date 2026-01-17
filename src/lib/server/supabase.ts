import pkg from '@supabase/auth-helpers-sveltekit';
const { createServerClient } = pkg;
import { env } from '$env/dynamic/public';
import { env as private_env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

export const createSupabaseClient = (event: RequestEvent) => {
  // Try multiple sources for environment variables
  const supabaseUrl = (
    env.PUBLIC_SUPABASE_URL || 
    (private_env as any).PUBLIC_SUPABASE_URL || 
    process?.env?.PUBLIC_SUPABASE_URL || 
    ''
  ).trim();

  const supabaseAnonKey = (
    env.PUBLIC_SUPABASE_ANON_KEY || 
    (private_env as any).PUBLIC_SUPABASE_ANON_KEY || 
    process?.env?.PUBLIC_SUPABASE_ANON_KEY || 
    ''
  ).trim();

  if (!supabaseUrl) {
    throw new Error('Missing environment variable: PUBLIC_SUPABASE_URL');
  }

  // Basic URL validation
  if (!/^https?:\/\//.test(supabaseUrl)) {
    const preview = supabaseUrl.substring(0, 5) + '...';
    throw new Error(`Invalid PUBLIC_SUPABASE_URL format. Value starts with: "${preview}". It must start with http:// or https://`);
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
          }
        }
      }
    }
  );
};
