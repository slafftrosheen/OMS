// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/session';
import { supabaseAdmin } from '$lib/server/supabase-admin';

/**
 * GET /api/users - List all users
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const activeOnly = url.searchParams.get('active') !== 'false';
  const section = url.searchParams.get('section');

  let query = locals.supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  if (section) {
    query = query.contains('sections', [section]);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch users:', error);
    return json([], { status: 500 });
  }

  const formattedUsers = data.map(row => ({
    id: row.id,
    username: row.username,
    name: row.display_name,
    displayName: row.display_name,
    primarySection: row.primary_section,
    sections: row.sections,
    roles: row.roles,
    stations: row.stations || [],
    isActive: row.is_active,
    lastLoginAt: row.last_login_at
  }));

  return json(formattedUsers);
};

/**
 * POST /api/users - Create new user (admin only)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const currentUser = locals.user;
  if (!currentUser || !isAdmin(currentUser)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  if (!data.username || !data.displayName) {
    return json({ error: 'Username and display name required' }, { status: 400 });
  }

  if (!data.password || data.password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  if (!data.email) {
      data.email = `${data.username}@example.com`;
  }

  try {
    // Use Admin Client to create user without affecting current session
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        user_metadata: {
            username: data.username,
            full_name: data.displayName
        },
        email_confirm: true // Auto confirm
    });

    if (authError) {
        throw authError;
    }

    if (!authData.user) {
        throw new Error('Failed to create user');
    }

    // Now update the profile with extra fields
    const { data: profile, error: profileError } = await locals.supabase
        .from('profiles')
        .update({
            primary_section: data.primarySection || 'Production',
            sections: data.sections || ['Production'],
            roles: data.roles || { Admin: 'Viewer', Production: 'Operator', Logistics: 'Viewer' },
            stations: data.stations || [],
            is_active: true
        })
        .eq('id', authData.user.id)
        .select()
        .single();

    if (profileError) {
        throw profileError;
    }

    // Create preferences
    await locals.supabase.from('user_preferences').insert({ user_id: authData.user.id });

    return json({
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      primarySection: profile.primary_section,
      sections: profile.sections,
      roles: profile.roles,
      stations: profile.stations || []
    }, { status: 201 });

  } catch (err: any) {
    console.error('Failed to create user:', err);
    if (err.message?.includes('already registered')) {
         return json({ error: 'Username/Email already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create user: ' + err.message }, { status: 500 });
  }
};
