import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: materials, error } = await locals.supabase
    .from('materials')
    .select('*')
    .order('code');

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json(materials);
};