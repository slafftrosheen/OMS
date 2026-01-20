// src/hooks.server.ts
import { getSessionUser } from '$lib/server/auth/session';
import { createSupabaseClient } from '$lib/server/supabase';
import type { Handle } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1
});

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
      event.locals.user = await getSessionUser(event);
    } else {
      event.locals.user = null;
    }

    // Protect API routes (excluding public endpoints)
    if (event.url.pathname.startsWith('/api')) {
      const publicApiRoutes = [
        '/api/auth/login',
        '/api/auth/signup',
        '/api/auth/callback',
        '/api/healthz'
      ];

      const isPublicRoute = publicApiRoutes.some(route =>
        event.url.pathname === route || event.url.pathname.startsWith(route + '/')
      );

      if (!session && !isPublicRoute) {
        return new Response(JSON.stringify({ 
          code: 'UNAUTHORIZED',
          message: 'Unauthorized access',
          timestamp: new Date().toISOString()
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else if (!session &&
               !event.url.pathname.startsWith('/login') &&
               !event.url.pathname.startsWith('/auth') &&
               !event.url.pathname.startsWith('/api/auth')) {
      // Protect UI routes (redirect to login)
      return new Response(null, {
          status: 303,
          headers: { location: '/login' }
      });
    }

    const response = await resolve(event, {
      filterSerializedResponseHeaders(name) {
        return name === 'content-range';
      },
    });

    // Security Headers
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co"
    );
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

    return response;
  } catch (err: any) {
    console.error('Critical Server Error in hooks:', err);
    Sentry.captureException(err);
    
    return new Response(JSON.stringify({ 
      code: 'INTERNAL_SERVER_ERROR',
      message: 'A critical server error occurred',
      timestamp: new Date().toISOString()
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};