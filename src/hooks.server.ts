// src/hooks.server.ts
import { getSessionUser } from '$lib/server/auth/session';
import { createSupabaseClient } from '$lib/server/supabase';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  try {
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

    // Protect API routes
    if (event.url.pathname.startsWith('/api')) {
      const isPublicAuth = event.url.pathname.startsWith('/api/auth');
      const isPublicSignup = event.url.pathname === '/api/users' && event.request.method === 'POST';
      const isPublicPreferences = event.url.pathname === '/api/preferences' && event.request.method === 'GET';

      if (!session && !isPublicAuth && !isPublicSignup && !isPublicPreferences) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else if (!session && !event.url.pathname.startsWith('/login') && !event.url.pathname.startsWith('/auth')) {
      // Protect UI routes (redirect to login)
      // Excluding /login and /auth (callbacks)
      return new Response(null, {
          status: 303,
          headers: { location: '/login' }
      });
    }

    return await resolve(event, {
      filterSerializedResponseHeaders(name) {
        return name === 'content-range';
      },
    });
  } catch (err: any) {
    console.error('Critical Server Error in hooks:', err);
    return new Response(`Server Error: ${err.message}`, { status: 500 });
  }
};
