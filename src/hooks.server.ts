// src/hooks.server.ts
import { type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev, building } from '$app/environment';

// Environment validation
function validateEnvironment() {
	if (building) return;

	const requiredEnvVars = [
		'DATABASE_URL'
	];

	// Check for core required variables
	const missingVars = requiredEnvVars.filter(
		(varName) => !process.env[varName]
	);

	// Check for Supabase URL (allow private or public variant)
	if (!process.env.SUPABASE_URL && !process.env.PUBLIC_SUPABASE_URL) {
		missingVars.push('SUPABASE_URL (or PUBLIC_SUPABASE_URL)');
	}

	// Check for Supabase Anon Key (allow private or public variant)
	if (!process.env.SUPABASE_ANON_KEY && !process.env.PUBLIC_SUPABASE_ANON_KEY) {
		missingVars.push('SUPABASE_ANON_KEY (or PUBLIC_SUPABASE_ANON_KEY)');
	}

	if (missingVars.length > 0) {
		throw new Error(
			`Missing required environment variables: ${missingVars.join(', ')}`
		);
	}

	// Check for insecure default credentials in production
	if (!dev) {
		const dangerousDefaults = [
			{ key: 'DATABASE_URL', pattern: /password=admin|password=postgres|password=123456/ },
			{ key: 'JWT_SECRET', pattern: /^(secret|test|dev)/i },
			{ key: 'SESSION_SECRET', pattern: /^(secret|test|dev)/i }
		];

		for (const { key, pattern } of dangerousDefaults) {
			const value = process.env[key];
			if (value && pattern.test(value)) {
				throw new Error(
					`❌ SECURITY ERROR: Production environment detected with insecure default credentials for ${key}. ` +
					`Please update your environment variables before deployment.`
				);
			}
		}

		console.log('✅ Environment validation passed');
	}
}

// Run validation on startup
validateEnvironment();

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
	// Get session from cookie
	const sessionToken = event.cookies.get('session_token');

	if (sessionToken) {
		try {
			// Verify session with API
			const response = await fetch(
				new URL('/api/auth', event.url.origin),
				{
					method: 'GET',
					headers: {
						Cookie: `session_token=${sessionToken}`
					}
				}
			);

			if (response.ok) {
				const { user } = await response.json();
				event.locals.user = user;
			}
		} catch (error) {
			console.error('Session verification failed:', error);
		}
	}

	// Protect API routes
	const isApiRoute = event.url.pathname.startsWith('/api');
	const isPublicApi = ['/api/auth'].includes(event.url.pathname);

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

// Combine all handlers
export const handle = sequence(
	rateLimitHandler,
	securityHeaders,
	authHandler
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