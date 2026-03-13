import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: days } = await locals.supabase.from('loading_days').select('*').order('date');
  return json(days || []);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  const { data: day, error } = await locals.supabase.from('loading_days').insert(data).select().single();
  if (error) return json({ error: 'Failed' }, { status: 500 });
  return json(day);
};
