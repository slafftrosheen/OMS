import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: logs } = await locals.supabase.from('station_logs').select('*').order('created_at', { ascending: false });
  return json(logs || []);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  const session = await locals.getSession();

  const { data: log } = await locals.supabase.from('station_logs').insert({
      ...data,
      user_id: session?.user?.id
  }).select().single();

  return json(log);
};
