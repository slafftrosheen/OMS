import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  let query = locals.supabase
    .from('materials')
    .select('*')
    .order('code');

  // Filter by category if provided
  const category = url.searchParams.get('category');
  if (category) {
    query = query.eq('category', category);
  }

  // Filter by multiple categories if provided (comma-separated)
  const categoriesParam = url.searchParams.get('categories');
  if (categoriesParam) {
    const categories = categoriesParam.split(',').map(cat => cat.trim());
    query = query.in('category', categories);
  }

  const { data: materials, error } = await query;

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json(materials);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  
  const { data: material, error } = await locals.supabase
    .from('materials')
    .insert({
      category: data.category,
      code: data.code,
      name_en: data.nameEn || data.name,
      name_ru: data.nameRu,
      name_lv: data.nameLv,
      thickness_options: data.thicknessOptions || [],
      metadata: data.metadata || {}
    })
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  return json(material, { status: 201 });
};
