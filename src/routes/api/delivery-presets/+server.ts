import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: presets } = await locals.supabase.from('delivery_presets').select('*').order('name');
  return json(presets || []);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  const { data: preset, error } = await locals.supabase.from('delivery_presets').insert(data).select().single();
  if (error) return json({ error: 'Failed' }, { status: 500 });
  return json(preset);
};
