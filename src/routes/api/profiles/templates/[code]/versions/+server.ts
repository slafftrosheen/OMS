import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { code } = params;

  // Get template ID
  const { data: template, error: err } = await locals.supabase
    .from('profile_templates')
    .select('id')
    .eq('code', code)
    .single();

  if (err || !template) throw error(404, 'Template not found');

  // Get versions
  const { data: versions, error: vErr } = await locals.supabase
    .from('template_versions')
    .select('version, notes, created_at, created_by(username)')
    .eq('template_id', template.id)
    .order('created_at', { ascending: false });

  if (vErr) throw error(500, 'Failed to fetch versions');

  return json(versions.map((v: any) => ({
    version: v.version,
    notes: v.notes,
    createdAt: v.created_at,
    createdBy: v.created_by?.username || 'system'
  })));
};
