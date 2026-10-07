import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory, validateMaterialInput } from '$lib/server/authz/shared-data';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { data: material, error: dbError } = await locals.supabase.from('materials').select('*').eq('id', params.id).single();
  if (dbError || !material) return json({ error: 'Not found' }, { status: 404 });
  return json(material);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageSharedInventory(locals.user.role)) return json({ error: 'Shared material management requires RD, Boss, or HeadOfProduction' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request body' }, { status: 400 });
  let patch: Record<string, unknown>;
  try { patch = validateMaterialInput(body, true); }
  catch (err) { return json({ error: err instanceof Error ? err.message : 'Invalid material' }, { status: 400 }); }

  const { data: updated, error: dbError } = await locals.supabase.from('materials').update(patch).eq('id', params.id).select().single();
  if (dbError || !updated) return json({ error: dbError?.code === '23505' ? 'Material code already exists' : 'Failed to update material' }, { status: dbError?.code === '23505' ? 409 : 500 });
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageSharedInventory(locals.user.role)) return json({ error: 'Shared material management requires RD, Boss, or HeadOfProduction' }, { status: 403 });
  const { error: dbError } = await locals.supabase.from('materials').delete().eq('id', params.id);
  if (dbError) return json({ error: dbError.code === '23503' ? 'Material is still referenced' : 'Failed to delete material' }, { status: dbError.code === '23503' ? 409 : 500 });
  return json({ success: true });
};
