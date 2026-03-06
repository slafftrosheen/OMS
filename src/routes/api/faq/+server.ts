import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const search = url.searchParams.get('search');
  const category = url.searchParams.get('categoryId'); // frontend uses categoryId as string/id
  const tag = url.searchParams.get('tag');

  let query = locals.supabase
    .from('faqs')
    .select('*', { count: 'exact' });

  if (search) {
    query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%,category.ilike.%${search}%`);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (tag) {
    query = query.contains('tags', [tag]);
  }

  const { data, count, error: dbError } = await query.order('order_index');

  if (dbError) {
    console.error('FAQ query error:', dbError);
    return json({ items: [], total: 0, categories: [], tags: [] });
  }

  // Fetch all unique categories and tags for the sidebar/filters
  const { data: allFaqs } = await locals.supabase.from('faqs').select('category, tags');
  
  const categories = [...new Set(allFaqs?.map(f => f.category) || [])];
  const tags = [...new Set(allFaqs?.flatMap(f => f.tags || []) || [])];

  return json({
    items: data || [],
    total: count || 0,
    categories,
    tags
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const body = await request.json();
  const { data: faq, error: dbError } = await locals.supabase
    .from('faqs')
    .insert({
      ...body,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (dbError) {
    console.error('FAQ insert error:', dbError);
    throw error(500, 'Failed to create FAQ');
  }

  return json(faq);
};
