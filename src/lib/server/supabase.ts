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
    const keys = Object.keys(process?.env || {}).filter(k => k.includes('SUPABASE')).join(', ');
    throw new Error(`Missing PUBLIC_SUPABASE_URL. Found keys: [${keys}]`);
  }

  // Strict URL validation
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

  if (!supabaseAnonKey) {
    throw new Error('Missing PUBLIC_SUPABASE_ANON_KEY');
  }

  // Debug log to confirm what we are passing
  console.log(`[Supabase] Initializing client with URL: ${supabaseUrl.substring(0, 12)}... (Length: ${supabaseUrl.length})`);

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
