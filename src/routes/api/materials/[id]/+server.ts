import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { data: material } = await locals.supabase.from('materials').select('*').eq('id', params.id).single();
  if (!material) throw error(404, 'Not found');
  return json(material);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const data = await request.json();
  const { data: updated } = await locals.supabase.from('materials').update(data).eq('id', params.id).select().single();
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  await locals.supabase.from('materials').delete().eq('id', params.id);
  return json({ success: true });
};
