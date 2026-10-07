import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/session';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params;
  const { data: user, error: err } = await locals.supabase
    .from('profiles')
    .select('*, user_stations(*)')
    .eq('id', id)
    .single();

  if (err || !user) throw error(404, 'User not found');

  return json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      stations: user.user_stations?.map((us: any) => ({
          stationId: us.station_id,
          isHead: us.is_head
      })) || [],
      isActive: user.is_active,
      lastLoginAt: user.last_login_at
  });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { id } = params;
  const data = await request.json();
  const currentUser = locals.user;

  if (!currentUser || !isAdmin(currentUser)) {
     throw error(403, 'Admin access required');
  }

  // 1. Update Profile
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .update({
        display_name: data.displayName,
        role: data.role,
        is_active: data.isActive
    })
    .eq('id', id);

  if (profileErr) {
      console.error('Failed to update user profile:', profileErr);
      throw error(500, 'Failed to update user');
  }

  // 2. Update Stations
  if (data.stations && Array.isArray(data.stations)) {
      // Clear existing
      const { error: deleteErr } = await supabaseAdmin.from('user_stations').delete().eq('user_id', id);
      if (deleteErr) {
          console.error('Failed to clear user stations:', deleteErr);
      }

      // Insert new
      const stationRecords = data.stations.map((s: any) => ({
          user_id: id,
          station_id: s.stationId,
          is_head: s.isHead
      }));

      if (stationRecords.length > 0) {
          const { error: stationErr } = await supabaseAdmin.from('user_stations').insert(stationRecords);
          if (stationErr) {
              console.error('Failed to update user stations:', stationErr);
          }
      }
  }

  return json({ success: true });
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
