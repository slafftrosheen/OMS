import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: logs } = await locals.supabase.from('audit_log').select('*').order('created_at', { ascending: false });
  return json(logs || []);
};
