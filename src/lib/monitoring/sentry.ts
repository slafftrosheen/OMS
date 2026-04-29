// src/lib/monitoring/sentry.ts
import * as Sentry from '@sentry/svelte';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';

export function initSentry() {
	if (dev) {
		console.log('Sentry disabled in development');
		return;
	}

    // Try to get DSN from various sources
    const dsn = publicEnv?.PUBLIC_SENTRY_DSN || (typeof process !== 'undefined' ? process.env?.SENTRY_DSN : undefined);

    if (!dsn) {
        console.warn('Sentry DSN not found. Sentry integration is disabled.');
        return;
    }

	Sentry.init({
		dsn,
		environment: (typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined) || 'production',
		
		// Performance monitoring
		tracesSampleRate: 0.1, // 10% of transactions
		
		// Session replay
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
		
		// Filter sensitive data
		beforeSend(event, hint) {
			// Remove sensitive data from breadcrumbs
			if (event.breadcrumbs) {
				event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
					if (breadcrumb.data) {
						delete breadcrumb.data.password;
						delete breadcrumb.data.token;
						delete breadcrumb.data.session_token;
					}
					return breadcrumb;
				});
			}

			// Remove sensitive headers
			if (event.request?.headers) {
				delete event.request.headers['authorization'];
				delete event.request.headers['cookie'];
			}

			return event;
		},
		
		// Ignore common errors
		ignoreErrors: [
			'Non-Error promise rejection captured',
			'ResizeObserver loop limit exceeded',
			'NetworkError',
			'Load failed' // Common mobile network errors
		]
	});
}

// Enhanced error logging
export function logError(
	error: Error,
	context?: Record<string, any>
) {
	if (dev) {
		console.error('[ERROR]', error, context);
		return;
	}

	Sentry.captureException(error, {
		extra: context,
		level: 'error'
	});
}

// Performance monitoring (Sentry v8 API)
export function startTransaction(
	name: string,
	op: string
) {
	if (dev) return null;
	// Sentry v8 replaced startTransaction with startSpanManual.
	return Sentry.startSpanManual({ name, op }, (span) => span);
}
