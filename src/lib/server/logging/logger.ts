/**
 * Consolidated Logger Service
 * 
 * Provides structured logging with:
 * - JSON format in production for log aggregators
 * - Human-readable format in development
 * - Log level filtering
 * - Sentry integration (optional)
 * 
 * Replaces: src/lib/server/logger.ts (basic logger)
 */

import { dev } from '$app/environment';
import * as Sentry from '@sentry/sveltekit';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
	level: LogLevel;
	timestamp: string;
	message: string;
	context?: Record<string, any>;
	error?: {
		name: string;
		message: string;
		stack?: string;
	};
	user?: {
		id: string;
		username: string;
	};
	request?: {
		method: string;
		path: string;
		ip: string;
	};
}

class Logger {
	private minLevel: LogLevel = dev ? 'debug' : 'info';

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
		return levels.indexOf(level) >= levels.indexOf(this.minLevel);
	}

	private format(entry: LogEntry): string {
		if (dev) {
			// Human-readable format for development
			const emoji = {
				debug: '🔍',
				info: 'ℹ️',
				warn: '⚠️',
				error: '❌',
				fatal: '💀'
			}[entry.level];

			const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
			return `${emoji} [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`;
		}

		// JSON format for production (log aggregators)
		return JSON.stringify(entry);
	}

	private log(level: LogLevel, message: string, context?: Record<string, any>) {
		if (!this.shouldLog(level)) return;

		const entry: LogEntry = {
			level,
			timestamp: new Date().toISOString(),
			message,
			context
		};

		const formatted = this.format(entry);

		switch (level) {
			case 'debug':
			case 'info':
				console.log(formatted);
				break;
			case 'warn':
				console.warn(formatted);
				// Send warnings to Sentry in production
				if (!dev) {
					Sentry.captureMessage(message, {
						level: 'warning',
						contexts: { custom: context }
					});
				}
				break;
			case 'error':
			case 'fatal':
				console.error(formatted);
				break;
		}
	}

	debug(message: string, context?: Record<string, any>) {
		this.log('debug', message, context);
	}

	info(message: string, context?: Record<string, any>) {
		this.log('info', message, context);
	}

	warn(message: string, context?: Record<string, any>) {
		this.log('warn', message, context);
	}

	error(message: string, error?: Error | Record<string, any>, context?: Record<string, any>) {
		// Handle both error object and context parameter order
		const actualError = error instanceof Error ? error : undefined;
		const actualContext = error instanceof Error ? context : (error as Record<string, any>);

		const entry: LogEntry = {
			level: 'error',
			timestamp: new Date().toISOString(),
			message,
			context: actualContext,
			error: actualError
				? {
						name: actualError.name,
						message: actualError.message,
						stack: dev ? actualError.stack : undefined
				  }
				: undefined
		};

		console.error(this.format(entry));

		// Send errors to Sentry in production
		if (!dev) {
			Sentry.captureException(actualError || new Error(message), {
				contexts: { custom: actualContext }
			});
		}
	}

	fatal(message: string, error?: Error, context?: Record<string, any>) {
		const entry: LogEntry = {
			level: 'fatal',
			timestamp: new Date().toISOString(),
			message,
			context,
			error: error
				? {
						name: error.name,
						message: error.message,
						stack: dev ? error.stack : undefined
				  }
				: undefined
		};

		console.error(this.format(entry));

		// Send fatal errors to Sentry
		if (!dev) {
			Sentry.captureException(error || new Error(message), {
				level: 'fatal',
				contexts: { custom: context }
			});
		}

		// Fatal errors should exit (but not in dev)
		if (!dev) {
			process.exit(1);
		}
	}

	// Request logging middleware
	logRequest(
		method: string,
		path: string,
		statusCode: number,
		duration: number,
		userId?: string
	) {
		this.info(`${method} ${path} ${statusCode} ${duration}ms`, {
			method,
			path,
			statusCode,
			duration,
			userId
		});
	}
}

export const logger = new Logger();