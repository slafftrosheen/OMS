import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeMaterialType } from '$lib/materials/thickness-options';

// Query using the request-scoped, RLS-aware Supabase client.
export const GET: RequestHandler = async ({ url, locals }) => {
  const supabase = locals.supabase;
  const materialTypeParam = url.searchParams.get('materialType');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    let query = supabase
      .from('material_thickness_options')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (materialTypeParam) {
      const normalizedType = normalizeMaterialType(materialTypeParam);
      const knownTypes = ['ACRYLIC', 'PVC', 'ALUMINUM', 'DIBOND', 'MDF', 'WOOD', 'STEEL', 'FILM'];
      query = knownTypes.includes(normalizedType)
        ? query.ilike('material_type', normalizedType)
        : query.ilike('material_type', '%' + normalizedType.replace(/[\\%_]/g, '\\$&') + '%');
    }

    const { data: options, error: dbError } = await query.abortSignal(controller.signal);
    if (dbError) {
      console.error('Error fetching thickness options:', dbError);
      return json({ error: 'Thickness options are temporarily unavailable' }, { status: 503 });
    }
    return json(options || []);
  } catch (err) {
    console.error('Unexpected error in material-thickness-options API:', err);
    return json({ error: 'Thickness options are temporarily unavailable' }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
};
