import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const { slug } = params;
  const lang = url.searchParams.get('lang') || 'en';

  const { data: faq, error: dbError } = await locals.supabase
    .from('faqs')
    .select('*')
    .eq('slug', slug)
    .single();

  if (dbError || !faq) {
    throw error(404, 'FAQ not found');
  }

  // Handle translation fallback
  let responseData = { ...faq };
  if (lang !== 'en' && faq.translations?.[lang]) {
    responseData.question = faq.translations[lang].question || faq.question;
    responseData.answer = faq.translations[lang].answer || faq.answer;
  }

  // Optional: Fetch related FAQs (basic heuristic: same category)
  const { data: related } = await locals.supabase
    .from('faqs')
    .select('id, slug, question')
    .eq('category', faq.category)
    .neq('id', faq.id)
    .limit(3);

  responseData.relatedFaqs = related || [];

  return json(responseData);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { slug } = params;
  const body = await request.json();

  const { data: faq, error: dbError } = await locals.supabase
    .from('faqs')
    .update({
      ...body,
      updated_at: new Date().toISOString()
    })
    .eq('slug', slug)
    .select()
    .single();

  if (dbError) throw error(500, 'Failed to update FAQ');

  return json(faq);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { slug } = params;
  const { error: dbError } = await locals.supabase
    .from('faqs')
    .delete()
    .eq('slug', slug);

  if (dbError) throw error(500, 'Failed to delete FAQ');

  return json({ success: true });
};
