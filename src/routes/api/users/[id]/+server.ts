import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/session';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { z } from 'zod';

/**
 * Validates password strength requirements (same policy as POST /api/users)
 */
function isValidPassword(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

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

/**
 * PATCH /api/users/:id — admin actions that are not profile edits.
 * Currently only `reset_password`, which the Admin → Users modal calls.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const { id } = params;
  const currentUser = locals.user;

  if (!currentUser || !isAdmin(currentUser)) {
    throw error(403, 'Admin access required');
  }

  const data = await request.json();

  if (data.action !== 'reset_password') {
    throw error(400, 'Unsupported action');
  }

  if (!data.newPassword || !isValidPassword(data.newPassword)) {
    return json({
      error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    }, { status: 400 });
  }

  const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password: data.newPassword
  });

  if (resetErr) {
    console.error('Failed to reset user password:', resetErr);
    return json({ error: 'Failed to reset password: ' + resetErr.message }, { status: 500 });
  }

  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const { id } = params;
    const currentUser = locals.user;

    if (!currentUser || !isAdmin(currentUser)) {
        throw error(403, 'Admin access required');
    }

    if (!z.string().uuid().safeParse(id).success) throw error(400, 'Invalid user ID');
    if (id === currentUser.id) throw error(400, 'You cannot delete your own account');

    // One database transaction removes Auth credentials/sessions, the profile
    // and private rows, and releases references from shared production history.
    const { data: deleted, error: err } = await supabaseAdmin.rpc('oms_delete_user', {
      p_user_id: id,
      p_actor_id: currentUser.id
    });

    if (err) {
        console.error('Failed to delete user:', err);
        throw error(err.code === '42501' ? 403 : 500, 'Failed to delete user');
    }
    if (!deleted) throw error(404, 'User not found');

    return json({ success: true });
};
