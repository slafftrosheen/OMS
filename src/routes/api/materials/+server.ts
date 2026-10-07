import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory, validateMaterialInput } from '$lib/server/authz/shared-data';

export const GET: RequestHandler = async ({ url, locals }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
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

    const { data: materials, error } = await query.abortSignal(controller.signal);

    if (error) {
      console.error('Materials query error:', error);
      return json({ error: error.message, materials: [] }, { status: 500 });
    }

    return json(materials || []);
  } catch (err) {
    console.error('Materials API error:', err);
    return json({ error: 'Failed to load materials', materials: [] }, { status: 500 });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageSharedInventory(locals.user.role)) return json({ error: 'Shared material management requires RD, Boss, or HeadOfProduction' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request body' }, { status: 400 });
  let data: Record<string, unknown>;
  try {
    data = validateMaterialInput({
      ...body,
      name_en: (body as any).nameEn || (body as any).name_en || (body as any).name,
      name_ru: (body as any).nameRu || (body as any).name_ru,
      name_lv: (body as any).nameLv || (body as any).name_lv,
      thickness_options: (body as any).thicknessOptions || (body as any).thickness_options || [],
      metadata: (body as any).metadata || {}
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Invalid material' }, { status: 400 });
  }

  const { data: material, error: dbError } = await locals.supabase.from('materials').insert(data).select().single();
  if (dbError) {
    console.error('Material create failed:', dbError);
    return json({ error: dbError.code === '23505' ? 'Material code already exists' : 'Failed to create material' }, { status: dbError.code === '23505' ? 409 : 500 });
  }
  return json(material, { status: 201 });
};
