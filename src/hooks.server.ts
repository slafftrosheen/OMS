// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { getSessionUser } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createSupabaseServerClient({
    supabaseUrl: PUBLIC_SUPABASE_URL,
    supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
    event
  });

  event.locals.getSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    return session;
  };
  
  event.locals.user = await getSessionUser(event);

  return resolve(event, {
    /**
     * Supabase needs the content-range header to be exposed to the browser.
     * @see https://supabase.com/docs/guides/auth/server-side/oauth-with-pkce-flow-for-ssr
     */
    filterSerializedResponseHeaders(name) {
      return name === 'content-range';
    }
  });
};
