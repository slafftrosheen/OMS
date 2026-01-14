import pkg from '@supabase/auth-helpers-sveltekit';
const { createServerClient } = pkg;
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestEvent } from '@sveltejs/kit';

export const createSupabaseClient = (event: RequestEvent) => {
  return createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
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
