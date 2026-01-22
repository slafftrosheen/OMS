import { error } from '@sveltejs/kit';

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_SERVER_ERROR'
  | 'RATE_LIMITED';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  timestamp: string;
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
) {
  const body: ApiErrorBody = {
    code,
    message,
    details,
    timestamp: new Date().toISOString()
  };

  throw error(status, JSON.stringify(body));
}
