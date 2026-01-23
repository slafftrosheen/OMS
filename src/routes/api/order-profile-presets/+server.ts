import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

// GET - List all presets for current user
export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const { data: presets, error: dbError } = await supabase
    .from('order_profile_presets')
    .select('*')
    .or(`created_by.eq.${session.user.id},is_public.eq.true`)
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('Error fetching presets:', dbError);
    throw error(500, 'Failed to fetch presets');
  }

  return json(presets);
};

// POST - Create new preset
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const body = await request.json();
  const { name, description, profileCode, configuration, isPublic } = body;

  if (!name || !configuration) {
    throw error(400, 'Name and configuration are required');
  }

  const { data: preset, error: dbError } = await supabase
    .from('order_profile_presets')
    .insert({
      name,
      description: description || null,
      profile_code: profileCode || 'P7st',
      configuration,
      created_by: session.user.id,
      is_public: isPublic || false
    })
    .select()
    .single();

  if (dbError) {
    console.error('Error creating preset:', dbError);
    throw error(500, 'Failed to create preset');
  }

  return json(preset);
};