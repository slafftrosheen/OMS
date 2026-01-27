// src/lib/server/logger.ts
import { dev } from '$app/environment';
import * as Sentry from '@sentry/sveltekit';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogContext {
    userId?: string;
    requestId?: string;
    path?: string;
    method?: string;
    [key: string]: unknown;
}

class Logger {
    private isDev = dev;

    private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? JSON.stringify(context) : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message} ${contextStr}`;
    }

    debug(message: string, context?: LogContext): void {
        if (this.isDev) {
            console.debug(this.formatMessage('debug', message, context));
        }
    }

    info(message: string, context?: LogContext): void {
        console.info(this.formatMessage('info', message, context));
    }

    warn(message: string, context?: LogContext): void {
        console.warn(this.formatMessage('warn', message, context));
        
        if (!this.isDev) {
            Sentry.captureMessage(message, {
                level: 'warning',
                contexts: { custom: context }
            });
        }
    }

    error(message: string, error?: Error, context?: LogContext): void {
        console.error(this.formatMessage('error', message, context));
        
        if (error) {
            console.error('Error stack:', error.stack);
        }

        if (!this.isDev) {
            Sentry.captureException(error || new Error(message), {
                contexts: { custom: context }
            });
        }
    }

    fatal(message: string, error?: Error, context?: LogContext): void {
        console.error(this.formatMessage('fatal', message, context));
        
        if (error) {
            console.error('Error stack:', error.stack);
        }

        if (!this.isDev) {
            Sentry.captureException(error || new Error(message), {
                level: 'fatal',
                contexts: { custom: context }
            });
        }

        // In production, fatal errors should trigger alerts
        process.exit(1);
    }
}

export const logger = new Logger();