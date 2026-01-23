import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

// GET - Fetch thickness options by material type
export const GET: RequestHandler = async ({ url }) => {
  const materialType = url.searchParams.get('materialType');

  let query = supabase
    .from('material_thickness_options')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (materialType) {
    query = query.eq('material_type', materialType.toUpperCase());
  }

  const { data: options, error: dbError } = await query;

  if (dbError) {
    console.error('Error fetching thickness options:', dbError);
    throw error(500, 'Failed to fetch thickness options');
  }

  return json(options);
};