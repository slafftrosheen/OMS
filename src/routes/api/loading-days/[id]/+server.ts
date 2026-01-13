import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { data: day } = await locals.supabase.from('loading_days').select('*').eq('id', params.id).single();
  if (!day) throw error(404, 'Not found');
  return json(day);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const data = await request.json();
  const { data: updated } = await locals.supabase.from('loading_days').update(data).eq('id', params.id).select().single();
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  await locals.supabase.from('loading_days').delete().eq('id', params.id);
  return json({ success: true });
};
