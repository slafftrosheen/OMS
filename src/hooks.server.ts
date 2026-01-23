// src/hooks.server.ts
import { type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev, building } from '$app/environment';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '$env/static/private';

// Environment validation
function validateEnvironment() {
	if (building) return;

	const missingVars = [];

	// Check for Supabase URL
	if (!SUPABASE_URL) {
		missingVars.push('SUPABASE_URL');
	}

	// Check for Supabase Anon Key
	if (!SUPABASE_ANON_KEY) {
		missingVars.push('SUPABASE_ANON_KEY');
	}

	// Check for Supabase Service Role Key (required for server-side operations)
	if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
		missingVars.push('SUPABASE_SERVICE_ROLE_KEY');
	}

	if (missingVars.length > 0) {
		throw new Error(
			`Missing required environment variables: ${missingVars.join(', ')}`
		);
	}

	// Check for insecure default credentials in production
	if (!dev) {
		const dangerousDefaults = [
			{ key: 'JWT_SECRET', pattern: /^(secret|test|dev)/i },
			{ key: 'SESSION_SECRET', pattern: /^(secret|test|dev)/i }
		];

		for (const { key, pattern } of dangerousDefaults) {
			const value = process.env[key];
			if (value && pattern.test(value)) {
				console.warn(
					`⚠️  WARNING: Production environment detected with insecure default credentials for ${key}.`
				);
			}
		}

		console.log('✅ Environment validation passed');
	}
}

// Run validation on startup
validateEnvironment();

// Supabase handler - MUST BE FIRST
const supabaseHandler: Handle = async ({ event, resolve }) => {
	// Create a Supabase client specific to this request
	event.locals.supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		cookies: {
			getAll() {
				return event.cookies.getAll();
			},
			setAll(cookiesToSet) {
				cookiesToSet.forEach(({ name, value, options }) =>
					event.cookies.set(name, value, { ...options, path: '/' })
				);
			}
		}
	});

	// Helper function to get the session
	event.locals.getSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return session;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

// Security headers handler
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Content Security Policy
	const cspDirectives = [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' https://github.githubassets.com",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data:",
		"connect-src 'self' https://*.supabase.co wss://*.supabase.co",
		"media-src 'self' blob:",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"upgrade-insecure-requests"
	];

	// Apply security headers
	response.headers.set(
		'Content-Security-Policy',
		dev ? cspDirectives.join('; ').replace('upgrade-insecure-requests', '') : cspDirectives.join('; ')
	);

	// Strict Transport Security (HSTS) - only in production with HTTPS
	if (!dev) {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains; preload'
		);
	}

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
	// Get session using the helper we added
	const session = await event.locals.getSession();

	if (session?.user) {
		// Fetch user profile from database
		const { data: profile } = await event.locals.supabase
			.from('profiles')
			.select('*')
			.eq('id', session.user.id)
			.single();

		if (profile) {
			event.locals.user = {
				id: profile.id,
				email: session.user.email,
				username: profile.username,
				displayName: profile.display_name,
				primarySection: profile.primary_section,
				sections: profile.sections,
				roles: profile.roles,
				stations: profile.stations || []
			};
		}
	}

	// Protect API routes (except public ones)
	const isApiRoute = event.url.pathname.startsWith('/api');
	const isPublicApi = [
		'/api/auth',
		'/api/health'
	].some(path => event.url.pathname.startsWith(path));

	if (isApiRoute && !isPublicApi && !event.locals.user) {
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

	const ip = event.getClientAddress();
	const now = Date.now();
	const windowMs = 60000; // 1 minute
	const maxRequests = 100;

	// Clean up old entries
	if (Math.random() < 0.01) {
		for (const [key, value] of rateLimitMap.entries()) {
			if (value.resetAt < now) {
				rateLimitMap.delete(key);
			}
		}
	}

	const key = `${ip}:${event.url.pathname}`;
	const record = rateLimitMap.get(key);

	if (!record || record.resetAt < now) {
		rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
	} else {
		record.count++;
		if (record.count > maxRequests) {
			return new Response('Too Many Requests', {
				status: 429,
				headers: {
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

// Combine all handlers - ORDER MATTERS!
export const handle = sequence(
	supabaseHandler, // MUST BE FIRST - initializes locals.supabase and locals.getSession
	rateLimitHandler,
	securityHeaders,
	authHandler // Uses locals.supabase and locals.getSession
);

// Global error handler with sanitization
export const handleError: HandleServerError = async ({ error, event, status, message }) => {
	const errorId = crypto.randomUUID();

	// Log full error server-side
	console.error('[ERROR]', {
		id: errorId,
		timestamp: new Date().toISOString(),
		status,
		path: event.url.pathname,
		method: event.request.method,
		user: event.locals.user?.id,
		error: dev ? error : message,
		stack: dev ? (error as Error)?.stack : undefined
	});

	// Return sanitized error to client
	return {
		message: dev ? message : 'An error occurred',
		errorId: dev ? errorId : undefined
	};
};