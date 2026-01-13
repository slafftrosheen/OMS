import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: materials } = await locals.supabase.from('materials').select('*').order('code');
  return json(materials || []);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  const { data: material, error } = await locals.supabase.from('materials').insert(data).select().single();
  if (error) return json({ error: 'Failed' }, { status: 500 });
  return json(material);
};
