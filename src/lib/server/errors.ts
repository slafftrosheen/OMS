// src/lib/server/errors.ts
import { json } from '@sveltejs/kit';

export function apiError(status: number, message: string) {
  return json({ error: message }, { status });
}