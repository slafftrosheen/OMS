import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory, normalizeLoadingDayCreate } from '$lib/server/authz/shared-data';

export const GET: RequestHandler = async ({ url, locals }) => {
  const activeOnly = url.searchParams.get('active') === 'true';
  const { data: days, error: fetchError } = await locals.supabase
    .from('loading_days')
    .select('*')
    .order('date', { ascending: true });
  if (fetchError) {
    console.error('Error fetching loading days:', fetchError);
    throw error(500, 'Failed to fetch loading days');
  }
  const result = days || [];
  return json(activeOnly ? result.filter((day: any) => !day.is_blocked) : result);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!canManageSharedInventory(locals.user.role)) throw error(403, 'Loading-day management requires RD, Boss, or HeadOfProduction');
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw error(400, 'Invalid request body');

  let data: Record<string, unknown>;
  try { data = normalizeLoadingDayCreate(raw); }
  catch (err) { throw error(400, err instanceof Error ? err.message : 'Invalid loading day'); }

  const { data: day, error: insertError } = await locals.supabase.from('loading_days').insert(data).select().single();
  if (insertError) {
    console.error('Error inserting loading day:', insertError);
    throw error(insertError.code === '23505' ? 409 : 400, insertError.code === '23505' ? 'A loading day already exists for that date' : 'Failed to create loading day');
  }
  return json(day, { status: 201 });
};
