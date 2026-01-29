/**
 * Centralized error handling utilities
 */

export interface ErrorContext {
  action: string;
  resourceId?: string;
  userId?: string;
  timestamp: string;
  stack?: string;
}

export class AppError extends Error {
  public readonly context: ErrorContext;
  public readonly isRetryable: boolean;
  
  constructor(
    message: string,
    context: Partial<ErrorContext> = {},
    isRetryable = false
  ) {
    super(message);
    this.name = 'AppError';
    this.isRetryable = isRetryable;
    this.context = {
      action: context.action || 'unknown',
      resourceId: context.resourceId,
      userId: context.userId,
      timestamp: context.timestamp || new Date().toISOString(),
      stack: this.stack
    };
  }
}

/**
 * Handle API errors and return user-friendly messages
 */
export function handleApiError(error: unknown, defaultMessage: string): string {
  console.error(defaultMessage, error);
  
  if (error instanceof AppError) {
    return error.message;
  }
  
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      return 'Network error. Please check your connection and try again.';
    }
    
    // Parse HTTP status from error message
    const statusMatch = error.message.match(/HTTP (\d{3})/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1]);
      switch (status) {
        case 400:
          return 'Invalid request. Please check your input.';
        case 401:
          return 'Unauthorized. Please log in again.';
        case 403:
          return 'Access denied. You don\'t have permission to perform this action.';
        case 404:
          return 'Resource not found.';
        case 409:
          return 'Conflict. The resource has been modified by another user.';
        case 422:
          return 'Validation failed. Please check your input.';
        case 429:
          return 'Too many requests. Please wait a moment and try again.';
        case 500:
        case 502:
        case 503:
        case 504:
          return 'Server error. Please try again later.';
        default:
          return error.message || defaultMessage;
      }
    }
    
    return error.message || defaultMessage;
  }
  
  return defaultMessage;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 10000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors (4xx)
      if (lastError.message.match(/HTTP 4\d{2}/)) {
        throw lastError;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 200; // Add jitter to prevent thundering herd
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Log error to monitoring service (placeholder for integration)
 */
export async function logError(error: Error | AppError, context?: Record<string, any>) {
  // In production, send to error tracking service (Sentry, Rollbar, etc.)
  const errorData = {
    message: error.message,
    stack: error.stack,
    context: context || {},
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'unknown'
  };
  
  if (error instanceof AppError) {
    Object.assign(errorData, { appContext: error.context });
  }
  
  console.error('Error logged:', errorData);
  
  // TODO: Integrate with monitoring service
  // await fetch('/api/errors', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(errorData)
  // });
}

/**
 * Validation error helper
 */
export class ValidationError extends AppError {
  public readonly fields: Record<string, string[]>;
  
  constructor(message: string, fields: Record<string, string[]> = {}) {
    super(message, { action: 'validation' }, false);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/**
 * Assert condition or throw error
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new AppError(message);
  }
}

/**
 * Create error boundary handler for Svelte components
 */
export function createErrorBoundary(componentName: string) {
  return {
    onError: (error: Error) => {
      const appError = new AppError(
        `Error in ${componentName}: ${error.message}`,
        { action: `render:${componentName}` },
        false
      );
      logError(appError);
      return true; // Prevent error from propagating
    }
  };
}
