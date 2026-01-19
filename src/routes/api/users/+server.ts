// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/session';
import { supabaseAdmin } from '$lib/server/supabase-admin';

/**
 * @description GET /api/users - Retrieves a list of all users.
 * This endpoint supports filtering by activity status and section.
 *
 * @param {URL} url - The request URL object.
 * @param {object} locals - The SvelteKit `locals` object, containing the Supabase client.
 *
 * @query {boolean} [active=true] - If set to `false`, the query will include inactive users.
 * @query {string} [section] - Filters users by a specific section (e.g., 'Production', 'Logistics').
 *
 * @returns {Response} - A JSON response containing an array of user objects.
 * On error, returns a 500 status with an empty array.
 *
 * @example
 * // Example user object in the response:
 * {
 *   id: 'uuid-string',
 *   username: 'john.doe',
 *   name: 'John Doe',
 *   displayName: 'John Doe',
 *   primarySection: 'Production',
 *   sections: ['Production', 'Assembly'],
 *   roles: { Admin: 'Viewer', Production: 'Operator' },
 *   stations: ['Sanding', 'Welding'],
 *   isActive: true,
 *   lastLoginAt: 'iso-date-string'
 * }
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
 * @description POST /api/users - Creates a new user. This is an admin-only endpoint.
 *
 * @param {Request} request - The SvelteKit `Request` object.
 * @param {object} locals - The SvelteKit `locals` object, containing user session data.
 *
 * @body {string} username - The new user's username.
 * @body {string} displayName - The new user's display name.
 * @body {string} password - The new user's password (must be at least 8 characters).
 * @body {string} [email] - The new user's email. If not provided, a placeholder will be generated.
 * @body {string} [primarySection='Production'] - The user's primary section.
 * @body {string[]} [sections=['Production']] - A list of sections the user belongs to.
 * @body {object} [roles] - The user's roles for each section.
 * @body {string[]} [stations=[]] - A list of stations the user is assigned to.
 *
 * @returns {Response} - A JSON response containing the newly created user object.
 *
 * @errors
 * - 400 Bad Request: If `username`, `displayName`, or `password` are missing or invalid.
 * - 403 Forbidden: If the requesting user is not an admin.
 * - 409 Conflict: If the username or email already exists.
 * - 500 Internal Server Error: If there is a failure during user creation.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const currentUser = locals.user;
  // Check if the request is coming from an admin
  const isUserAdmin = currentUser && isAdmin(currentUser);

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
    // Use Admin Client to create a user without affecting the current session.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        user_metadata: {
            username: data.username,
            full_name: data.displayName
        },
        email_confirm: true // Auto-confirm the email address.
    });

    if (authError) {
        throw authError;
    }

    if (!authData.user) {
        throw new Error('Failed to create user');
    }

    // Prepare profile update data
    // Restrict assignment of roles/sections to admin users only
    const updateData: any = {
        primary_section: 'Production',
        sections: ['Production'],
        roles: { Admin: 'Viewer', Production: 'Operator', Logistics: 'Viewer' },
        stations: [],
        is_active: true
    };

    if (isUserAdmin) {
        if (data.primarySection) updateData.primary_section = data.primarySection;
        if (data.sections) updateData.sections = data.sections;
        if (data.roles) updateData.roles = data.roles;
        if (data.stations) updateData.stations = data.stations;
    }

    // Update the user's profile with additional fields.
    // Use supabaseAdmin to bypass RLS since the new user (or anon) might not have permission to update it yet.
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(updateData)
        .eq('id', authData.user.id)
        .select()
        .single();

    if (profileError) {
        throw profileError;
    }

    // Create a default set of preferences for the new user.
    await supabaseAdmin.from('user_preferences').insert({ user_id: authData.user.id });

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
