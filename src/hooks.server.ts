// src/hooks.server.ts
import '$lib/server/supabase';
import { getSessionUser } from '$lib/server/auth/session';
import { createSupabaseClient } from '$lib/server/supabase';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createSupabaseClient(event);

  /**
   * A convenience helper so we can just call await event.locals.getSession()
   * instead of setting up the session manually.
   */
  event.locals.getSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession();
    return session;
  };

  const session = await event.locals.getSession();

  if (session) {
    // If we have a supabase session, we try to get our application user.
    // We pass the event because getSessionUser might need to use the supabase client attached to the event.
    event.locals.user = await getSessionUser(event);
  } else {
    event.locals.user = null;
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range';
    },
  });
};
