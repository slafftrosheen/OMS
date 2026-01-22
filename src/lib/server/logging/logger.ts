// src/lib/server/logging/logger.ts
import { dev } from '$app/environment';

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

			return `${emoji} [${entry.level.toUpperCase()}] ${entry.message}`;
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

	error(message: string, error?: Error, context?: Record<string, any>) {
		const entry: LogEntry = {
			level: 'error',
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