// src/lib/server/db.ts
import { createSupabaseClient } from '$lib/server/supabase';
import type { RequestEvent } from '@sveltejs/kit';

export function db(event: RequestEvent) {
  return createSupabaseClient(event);
}
