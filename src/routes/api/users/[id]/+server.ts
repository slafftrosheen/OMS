// src/routes/api/users/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { getSessionUser, isAdmin } from '$lib/server/auth/session';

/**
 * GET /api/users/[id] - Get single user
 */
export const GET: RequestHandler = async (event) => {
  const { params } = event;
  const supabase = db(event);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, display_name, email, primary_section, sections, roles, stations, is_active, last_login_at, created_at')
      .eq('id', params.id)
      .single();

    if (userError || !user) {
      throw error(404, 'User not found');
    }

    return json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      primarySection: user.primary_section,
      sections: user.sections,
      roles: user.roles,
      stations: user.stations || [],
      isActive: user.is_active,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to fetch user:', err);
    throw error(500, 'Failed to fetch user');
  }
};

/**
 * PUT /api/users/[id] - Update user (admin only)
 */
export const PUT: RequestHandler = async (event) => {
  const { params, request } = event;
  const supabase = db(event);

  // Check admin authorization
  const currentUser = await getSessionUser(event);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  try {
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        display_name: data.displayName,
        email: data.email,
        primary_section: data.primarySection,
        sections: data.sections,
        roles: data.roles,
        stations: data.stations,
        is_active: data.isActive,
        updated_at: new Date()
      })
      .eq('id', params.id)
      .select('id, username, display_name, email, primary_section, sections, roles, stations, is_active')
      .single();

    if (updateError || !updatedUser) {
      throw error(404, 'User not found');
    }

    return json({
      id: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.display_name,
      email: updatedUser.email,
      primarySection: updatedUser.primary_section,
      sections: updatedUser.sections,
      roles: updatedUser.roles,
      stations: updatedUser.stations || [],
      isActive: updatedUser.is_active
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to update user:', err);
    throw error(500, 'Failed to update user');
  }
};

/**
 * DELETE /api/users/[id] - Deactivate user (admin only, soft delete)
 */
export const DELETE: RequestHandler = async (event) => {
  const { params } = event;
  const supabase = db(event);

  // Check admin authorization
  const currentUser = await getSessionUser(event);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  // Prevent self-deactivation
  if (currentUser.id === params.id) {
    return json({ error: 'Cannot deactivate your own account' }, { status: 400 });
  }

  try {
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ is_active: false, updated_at: new Date() })
      .eq('id', params.id)
      .select('username')
      .single();

    if (updateError || !updatedUser) {
      throw error(404, 'User not found');
    }

    // Invalidate all sessions and log audit event
    await supabase.rpc('deactivate_user_and_log', {
      user_id_to_deactivate: params.id,
      deactivated_by_username: currentUser.username
    });


    return json({ success: true });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to deactivate user:', err);
    throw error(500, 'Failed to deactivate user');
  }
};

/**
 * PATCH /api/users/[id] - Reset user password (admin only)
 */
export const PATCH: RequestHandler = async (event) => {
  const { params, request } = event;
  const supabase = db(event);

  // Check admin authorization
  const currentUser = await getSessionUser(event);
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  if (data.action !== 'reset_password') {
    throw error(400, 'Invalid action');
  }

  try {
    // Generate new temporary password
    const tempPassword = data.newPassword || `temp${Math.random().toString(36).slice(2, 10)}`;

    const { error: adminUpdateError } = await supabase.auth.admin.updateUserById(
      params.id,
      { password: tempPassword }
    );

    if (adminUpdateError) {
      throw adminUpdateError;
    }

    // Log audit event
    await supabase.from('audit_log').insert({
      username: currentUser.username,
      action: 'PASSWORD_RESET_BY_ADMIN',
      entity_type: 'user',
      entity_id: params.id
    });

    return json({
      success: true,
      temporaryPassword: data.newPassword ? undefined : tempPassword
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to reset password:', err);
    throw error(500, 'Failed to reset password');
  }
};
