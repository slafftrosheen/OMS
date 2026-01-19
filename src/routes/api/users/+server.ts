// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/session';
import { supabaseAdmin } from '$lib/server/supabase-admin';

/**
 * Validates password strength requirements
 */
function isValidPassword(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

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
 * @description POST /api/users - Creates a new user. This can be called by admins or for self-registration.
 *
 * @param {Request} request - The SvelteKit `Request` object.
 * @param {object} locals - The SvelteKit `locals` object, containing user session data.
 *
 * @body {string} username - The new user's username.
 * @body {string} displayName - The new user's display name.
 * @body {string} password - The new user's password (must be at least 8 characters).
 * @body {string} [email] - The new user's email. If not provided, a placeholder will be generated.
 * @body {string} [primarySection='Production'] - The user's primary section (admin-only).
 * @body {string[]} [sections=['Production']] - A list of sections the user belongs to (admin-only).
 * @body {object} [roles] - The user's roles for each section (admin-only).
 * @body {string[]} [stations=[]] - A list of stations the user is assigned to (admin-only).
 *
 * @returns {Response} - A JSON response containing the newly created user object.
 *
 * @errors
 * - 400 Bad Request: If `username`, `displayName`, or `password` are missing or invalid.
 * - 403 Forbidden: If a non-admin user tries to assign roles, sections, or stations.
 * - 409 Conflict: If the username or email already exists.
 * - 500 Internal Server Error: If there is a failure during user creation.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  // Check if this is an admin request vs. self-registration
  const currentUser = locals.user;
  const isAdminUser = currentUser && isAdmin(currentUser);

  // For non-admin users trying to set roles/sections/stations, reject the request
  if (!isAdminUser && (data.roles || data.sections || data.stations || data.primarySection)) {
    return json({ error: 'Non-admin users cannot assign roles, sections, or stations' }, { status: 403 });
  }

  const isSelfRegistration = !isAdminUser;

  if (!data.username || !data.displayName) {
    return json({ error: 'Username and display name required' }, { status: 400 });
  }

  if (!data.password) {
    return json({ error: 'Password required' }, { status: 400 });
  }

  // Validate password strength: at least 8 chars with uppercase, lowercase, number, and special char
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(data.password)) {
    return json({
      error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    }, { status: 400 });
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

    // Determine roles and other attributes based on whether it's self-registration or admin creation
    const profileData = isSelfRegistration
      ? {  // Default values for self-registered users
          id: authData.user.id,
          username: data.username,
          display_name: data.displayName,
          primary_section: 'Production',  // Default for self-registered users
          sections: ['Production'],       // Default for self-registered users
          roles: { Production: 'Operator' }, // Limited default role for self-registered users
          stations: [],
          is_active: true
        }
      : {  // Values for admin-created users (can include elevated privileges)
          id: authData.user.id,
          username: data.username,
          display_name: data.displayName,
          primary_section: data.primarySection || 'Production',
          sections: data.sections || ['Production'],
          roles: data.roles || { Admin: 'Viewer', Production: 'Operator', Logistics: 'Viewer' },
          stations: data.stations || [],
          is_active: true
        };

    // Create the user profile
    // Use supabaseAdmin to bypass RLS policies when creating profiles for new users
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert(profileData)
        .select()
        .single();

    if (profileError) {
        throw profileError;
    }

    // Create a default set of preferences for the new user.
    // Use supabaseAdmin to bypass RLS policies when creating preferences for new users
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
