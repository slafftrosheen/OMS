import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// PUT - Update preset
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const supabase = locals.supabase;
  const session = await locals.getSession();
  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const { id } = params;
  const body = await request.json();
  const { name, description, configuration, isPublic } = body;

  // Verify ownership
  const { data: existing } = await supabase
    .from('order_profile_presets')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existing || existing.created_by !== session.user.id) {
    throw error(403, 'Not authorized to update this preset');
  }

  const { data: preset, error: dbError } = await supabase
    .from('order_profile_presets')
    .update({
      name,
      description,
      configuration,
      is_public: isPublic,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (dbError) {
    console.error('Error updating preset:', dbError);
    throw error(500, 'Failed to update preset');
  }

  return json(preset);
};

// DELETE - Delete preset
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const supabase = locals.supabase;
  const session = await locals.getSession();
  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const { id } = params;

  // Verify ownership
  const { data: existing } = await supabase
    .from('order_profile_presets')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existing || existing.created_by !== session.user.id) {
    throw error(403, 'Not authorized to delete this preset');
  }

  const { error: dbError } = await supabase
    .from('order_profile_presets')
    .delete()
    .eq('id', id);

  if (dbError) {
    console.error('Error deleting preset:', dbError);
    throw error(500, 'Failed to delete preset');
  }

  return json({ success: true });
};