// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/users - List all users
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const activeOnly = url.searchParams.get('active') !== 'false';
  const section = url.searchParams.get('section');

  let query = supabase
    .from('users')
    .select('id, username, display_name, primary_section, sections, roles, stations, is_active, last_login_at');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  if (section) {
    query = query.contains('sections', [section]);
  }

  query = query.order('display_name', { ascending: true });

  const { data: users, error } = await query;

  if (error) {
    console.error('Failed to fetch users:', error);
    return json([], { status: 500 });
  }

  const formattedUsers = users.map(row => ({
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
export const POST: RequestHandler = async ({ request, locals: { supabase, user: currentUser } }) => {
  if (!currentUser || !currentUser.roles.Admin === 'SuperAdmin') {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const data = await request.json();

  if (!data.username || !data.displayName) {
    return json({ error: 'Username and display name required' }, { status: 400 });
  }

  if (!data.password || data.password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
    email: data.username,
    password: data.password,
    email_confirm: true,
  });

  if (authError) {
    console.error('Failed to create user in auth:', authError);
    if (authError.message.includes('unique constraint')) {
      return json({ error: 'Username already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create user' }, { status: 500 });
  }

  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .update({
      display_name: data.displayName,
      primary_section: data.primarySection || 'Production',
      sections: data.sections || ['Production'],
      roles: data.roles || { Admin: 'Viewer', Production: 'Operator', Logistics: 'Viewer' },
      stations: data.stations || []
    })
    .eq('id', newUser.user.id)
    .select()
    .single();

  if (profileError) {
    console.error('Failed to update user profile:', profileError);
    // Potentially delete the auth user here for rollback
    return json({ error: 'Failed to set up user profile' }, { status: 500 });
  }

  // Create default preferences
  await supabase.from('user_preferences').insert({ user_id: userProfile.id });

  return json({
    id: userProfile.id,
    username: userProfile.username,
    displayName: userProfile.display_name,
    primarySection: userProfile.primary_section,
    sections: userProfile.sections,
    roles: userProfile.roles,
    stations: userProfile.stations || []
  }, { status: 201 });
};
