import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { slug } = params;
  const { data: faq } = await locals.supabase.from('faqs').select('*').eq('slug', slug).single();
  if (!faq) throw error(404, 'Not found');
  return json(faq);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { slug } = params;
  const data = await request.json();
  const { data: faq } = await locals.supabase.from('faqs').update(data).eq('slug', slug).select().single();
  return json(faq);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { slug } = params;
  await locals.supabase.from('faqs').delete().eq('slug', slug);
  return json({ success: true });
};
