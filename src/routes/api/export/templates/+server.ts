/**
 * Export Templates API
 * Manage reusable export templates
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// GET /api/export/templates - List templates
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const templateType = url.searchParams.get('type');
  const format = url.searchParams.get('format');
  const publicOnly = url.searchParams.get('public') === 'true';

  let query = supabase
    .from('export_templates')
    .select('*')
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (publicOnly) {
    query = query.eq('is_public', true);
  } else {
    query = query.or(`created_by.eq.${user.id},is_public.eq.true`);
  }

  if (templateType) query = query.eq('template_type', templateType);
  if (format) query = query.eq('format', format);

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('[Templates API] List error:', dbError);
    throw error(500, 'Failed to fetch templates');
  }

  return json({ data });
};

// POST /api/export/templates - Create template
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    name,
    description = null,
    templateType,
    format,
    config = {},
    columns = [],
    filters = null,
    styling = null,
    isPublic = false
  } = body;

  if (!name || !templateType || !format) {
    throw error(400, 'Missing required fields: name, templateType, format');
  }

  try {
    const { data, error: dbError } = await supabase
      .from('export_templates')
      .insert({
        name,
        description,
        template_type: templateType,
        format,
        config,
        columns,
        filters,
        styling,
        is_public: isPublic,
        created_by: user.id
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Templates API] Create error:', dbError);
      throw error(500, 'Failed to create template');
    }

    return json({ data }, { status: 201 });

  } catch (err) {
    console.error('[Templates API] Error:', err);
    throw error(500, 'Failed to create template');
  }
};

// DELETE /api/export/templates/[id]
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  try {
    const { error: dbError } = await supabase
      .from('export_templates')
      .delete()
      .eq('id', params.id)
      .eq('created_by', user.id);

    if (dbError) {
      console.error('[Templates API] Delete error:', dbError);
      throw error(500, 'Failed to delete template');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Templates API] Error:', err);
    throw error(500, 'Failed to delete template');
  }
};