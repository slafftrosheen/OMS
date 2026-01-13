import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

  if (!currentUser || (currentUser.roles?.Admin !== 'Admin' && currentUser.roles?.Admin !== 'SuperAdmin')) {
     throw error(403, 'Admin access required');
  }

  const { data: updated, error: err } = await locals.supabase
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

  if (err) throw error(500, 'Failed to update user');

  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    // Note: Deleting a user from profiles doesn't delete from auth.users.
    // We should ideally use Admin API to delete user.
    // If not possible, we can just mark as inactive or delete profile (which might break FKs).
    // Best practice: mark inactive.

    const { id } = params;
    const { error: err } = await locals.supabase.from('profiles').update({ is_active: false }).eq('id', id);
    if (err) throw error(500, 'Failed to deactivate user');
    return json({ success: true });
};
