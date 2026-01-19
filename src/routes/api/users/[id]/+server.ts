import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/session';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params;
  const { data: user, error: err } = await locals.supabase.from('profiles').select('*').eq('id', id).single();

  if (err || !user) throw error(404, 'User not found');

  return json(user);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { id } = params;
  const data = await request.json();
  const currentUser = locals.user;

  if (!currentUser || !isAdmin(currentUser)) {
     throw error(403, 'Admin access required');
  }

  // Use supabaseAdmin to bypass RLS for updating other users' profiles
  const { data: updated, error: err } = await supabaseAdmin
    .from('profiles')
    .update({
        display_name: data.displayName,
        primary_section: data.primarySection,
        sections: data.sections,
        roles: data.roles,
        stations: data.stations,
        is_active: data.isActive
    })
    .eq('id', id)
    .select()
    .single();

  if (err) {
      console.error('Failed to update user profile:', err);
      throw error(500, 'Failed to update user');
  }

  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const { id } = params;
    const currentUser = locals.user;

    if (!currentUser || !isAdmin(currentUser)) {
        throw error(403, 'Admin access required');
    }

    // Use supabaseAdmin to bypass RLS for deactivating users
    const { error: err } = await supabaseAdmin.from('profiles').update({ is_active: false }).eq('id', id);

    if (err) {
        console.error('Failed to deactivate user:', err);
        throw error(500, 'Failed to deactivate user');
    }

    return json({ success: true });
};
