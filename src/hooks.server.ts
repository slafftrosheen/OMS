// src/hooks.server.ts
import { type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev, building } from '$app/environment';
import { createServerClient } from '@supabase/ssr';
import { env as publicEnv } from '$env/dynamic/public';
import { enforceEnvironmentSecurity } from '$lib/server/env-validator';
import { logger } from '$lib/server/logging/logger';
import type { SessionUser } from '$lib/server/auth/session';
import * as Sentry from '@sentry/node';

// Sentry server-side init (no DSN → no-op).
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn && !dev) {
    Sentry.init({
        dsn: sentryDsn,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1
    });
}

// Run validation on startup
enforceEnvironmentSecurity();

// Get the Supabase URL and Key
// Prioritize environment variables, fallback to defaults
let supabaseUrl = publicEnv?.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
let supabaseAnonKey = publicEnv?.PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

// Fallback for build/dev if missing
if (!supabaseUrl && (building || dev)) {
	supabaseUrl = 'http://localhost:8000';
	console.warn('⚠️ using placeholder Supabase URL');
}
if (!supabaseAnonKey && (building || dev)) {
	supabaseAnonKey = 'placeholder-key';
}

// Ensure string type
supabaseUrl = supabaseUrl || '';
supabaseAnonKey = supabaseAnonKey || '';

// Supabase client initialization
const supabaseHandler: Handle = async ({ event, resolve }) => {
	// Safety check for runtime
	let url = supabaseUrl;
	let key = supabaseAnonKey;

	if (!url || !key) {
		// If we still don't have credentials in runtime (not building), we might fail
		// But let's try to use placeholder to avoid crash, logging error
		if (!building) logger.error('Missing Supabase credentials in runtime');
		url = url || 'http://localhost:8000';
		key = key || 'placeholder-key';
	}

	// Create Supabase client with cookie handling
	event.locals.supabase = createServerClient(url, key, {
		cookies: {
			get: (key) => event.cookies.get(key),
			set: (key, value, options) => {
				event.cookies.set(key, value, { 
					...options, 
					path: '/',
					secure: event.url.protocol === 'https:'
				});
			},
			remove: (key, options) => {
				event.cookies.delete(key, { 
					...options, 
					path: '/',
					secure: event.url.protocol === 'https:'
				});
			}
		}
	});

	// Helper function to get session
	event.locals.getSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return session;
	};

	// Get current session and populate user info from profile
	const session = await event.locals.getSession();
	if (session) {
		try {
			const { getSessionUser } = await import('$lib/server/auth/session');
			event.locals.user = await getSessionUser(event);
		} catch (e) {
			logger.error('Failed to load user profile in hooks', e as Error);
			event.locals.user = null;
		}
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range';
		}
	});
};

// Security headers handler
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Cache control for HTML pages to prevent stale version issues
	// This ensures browsers always revalidate HTML, preventing 404s for JS chunks
	const contentType = response.headers.get('content-type') || '';
	if (contentType.includes('text/html')) {
		response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
	}

	// Remove manual CSP override to let SvelteKit handle it natively

	// HSTS removed — local network uses HTTP only (TLS handled externally by Traefik if needed)

	// Other security headers
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-XSS-Protection', '1; mode=block');
	response.headers.set(
		'Permissions-Policy',
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
	);

	// Remove server information
	response.headers.delete('X-Powered-By');
	response.headers.delete('Server');

	return response;
};

// Authentication handler
const authHandler: Handle = async ({ event, resolve }) => {
	// Check if this is an API route
	const isApiRoute = event.url.pathname.startsWith('/api');

	if (!isApiRoute) {
		return resolve(event);
	}

	// Define public API routes that don't require authentication
	const publicApiRoutes = [
		{ path: '/api/auth', methods: ['GET', 'POST', 'DELETE'] },
		{ path: '/api/users', methods: ['POST'] }, // Allow signup
		{ path: '/api/health', methods: ['GET'] },
		{ path: '/api/healthz', methods: ['GET'] },
		{ path: '/api/preferences', methods: ['GET'] }, // Returns defaults for anonymous users
		{ path: '/api/materials', methods: ['GET'] }, // Read-only materials data
	];

	// Check if the current request matches any public route
	const isPublicRoute = publicApiRoutes.some(route => {
		const pathMatches = event.url.pathname === route.path;
		const methodMatches = route.methods.includes(event.request.method);
		return pathMatches && methodMatches;
	});

	// If it's not a public route and there's no user, block the request
	if (!isPublicRoute && !event.locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return resolve(event);
};

// Rate limiting handler
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const rateLimitHandler: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	// Get user ID if logged in (since this runs after supabaseHandler)
	const userId = event.locals.user?.id;
	const ip = event.getClientAddress();

	// Identifier: Use UserID if available, else IP
	const identifier = userId || ip;

	const now = Date.now();
	const windowMs = 60000; // 1 minute
	const maxRequests = userId ? 100 : 20; // 100 for auth users, 20 for anon

	// Clean up old entries
	if (Math.random() < 0.01) {
		for (const [key, value] of rateLimitMap.entries()) {
			if (value.resetAt < now) {
				rateLimitMap.delete(key);
			}
		}
	}

	const key = `${identifier}:${event.url.pathname}`;
	const record = rateLimitMap.get(key);

	if (!record || record.resetAt < now) {
		rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
	} else {
		record.count++;
		if (record.count > maxRequests) {
			return new Response(JSON.stringify({
				error: 'Too many requests',
				message: 'Rate limit exceeded. Please try again later.'
			}), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': String(Math.ceil((record.resetAt - now) / 1000))
				}
			});
		}
	}

	const response = await resolve(event);
	response.headers.set('X-RateLimit-Limit', String(maxRequests));
	response.headers.set(
		'X-RateLimit-Remaining',
		String(maxRequests - (record?.count || 0))
	);

	return response;
};

// Thin Sentry span wrapper (@sentry/node doesn't ship sentryHandle).
const sentryHandle: Handle = async ({ event, resolve }) => {
    return Sentry.startSpan(
        { name: `${event.request.method} ${event.url.pathname}`, op: 'http.server' },
        () => resolve(event)
    );
};

export const handle = sequence(
    sentryHandle,
    supabaseHandler,
    rateLimitHandler,
    securityHeaders,
    authHandler
);

// Global error handler with sanitization
const customHandleError: HandleServerError = async ({ error, event, status, message }) => {
	const errorId = crypto.randomUUID();

	const context = {
		errorId,
		status,
		path: event.url.pathname,
		method: event.request.method,
		userId: event.locals.user?.id,
		userAgent: event.request.headers.get('user-agent'),
		timestamp: new Date().toISOString()
	};

	// Log with appropriate level
	if (status >= 500) {
		logger.error('Server error', error as Error, context);
	} else if (status >= 400) {
		logger.warn(`Client error: ${message}`, context);
	}

	// Return sanitized error to client
	return {
		message: dev ? message : 'An error occurred. Please try again later.',
		errorId: dev ? errorId : undefined,
		status,
		code: (error as any)?.code || 'UNKNOWN_ERROR'
	};
};

export const handleError: HandleServerError = async (input) => {
    Sentry.captureException(input.error);
    return customHandleError(input);
};
