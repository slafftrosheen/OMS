import { error } from '@sveltejs/kit';

export function apiError(status: number, code: string, message: string) {
  throw error(status, { message, code } as any);
}
