import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: faqs, error } = await locals.supabase.from('faqs').select('*').order('order_index');
  if (error) return json([]);
  return json(faqs);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  const { data: faq, error } = await locals.supabase.from('faqs').insert(data).select().single();
  if (error) return json({ error: 'Failed' }, { status: 500 });
  return json(faq);
};
