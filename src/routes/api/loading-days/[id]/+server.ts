import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory, validateLoadingDayInput } from '$lib/server/authz/shared-data';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { data: day, error: dbError } = await locals.supabase.from('loading_days').select('*').eq('id', params.id).single();
  if (dbError || !day) throw error(404, 'Not found');
  return json(day);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!canManageSharedInventory(locals.user.role)) throw error(403, 'Loading-day management requires RD, Boss, or HeadOfProduction');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid request body');
  let patch: Record<string, unknown>;
  try { patch = validateLoadingDayInput(body, true); }
  catch (err) { throw error(400, err instanceof Error ? err.message : 'Invalid loading-day data'); }
  const { data: updated, error: dbError } = await locals.supabase.from('loading_days').update(patch).eq('id', params.id).select().single();
  if (dbError || !updated) throw error(500, 'Failed to update loading day');
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!canManageSharedInventory(locals.user.role)) throw error(403, 'Loading-day management requires RD, Boss, or HeadOfProduction');
  const { error: dbError } = await locals.supabase.from('loading_days').delete().eq('id', params.id);
  if (dbError) throw error(500, 'Failed to delete loading day');
  return json({ success: true });
};
