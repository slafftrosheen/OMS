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

    // Protect API routes (excluding public endpoints)
    if (event.url.pathname.startsWith('/api')) {
      // Allow public API routes without authentication
      const publicApiRoutes = [
        '/api/auth',
        '/api/preferences' // Preferences API allows unauthenticated access for defaults
      ];

      const isPublicRoute = publicApiRoutes.some(route =>
        event.url.pathname.startsWith(route)
      );

      console.log('API Route Check:', {
        pathname: event.url.pathname,
        hasSession: !!session,
        isPublicRoute,
        shouldBlock: !session && !isPublicRoute
      });

      if (!session && !isPublicRoute) {
        console.log('Blocking access to:', event.url.pathname);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else if (!session &&
               !event.url.pathname.startsWith('/login') &&
               !event.url.pathname.startsWith('/auth') &&
               !event.url.pathname.startsWith('/api/auth') &&
               !event.url.pathname.startsWith('/api/users')) {
      // Protect UI routes (redirect to login)
      // Excluding /login and /auth (callbacks), and auth API endpoints for login/signup
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
