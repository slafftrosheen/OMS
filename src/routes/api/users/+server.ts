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
    .select('*, user_stations(*)')
    .order('display_name', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
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
    role: row.role,
    stations: row.user_stations?.map((us: any) => ({
        stationId: us.station_id,
        isHead: us.is_head
    })) || [],
    isActive: row.is_active,
    lastLoginAt: row.last_login_at
  }));

  return json(formattedUsers);
};

/**
 * @description POST /api/users - Creates a new user. This can be called by admins or for self-registration.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  // Check if this is an admin request vs. self-registration
  const currentUser = locals.user;
  const isAdminUser = currentUser && isAdmin(currentUser);

  // For non-admin users trying to set roles/sections/stations, reject the request
  if (!isAdminUser && (data.role || data.stations)) {
    return json({ error: 'Non-admin users cannot assign roles or stations' }, { status: 403 });
  }

  const isSelfRegistration = !isAdminUser;

  if (!data.username || !data.displayName) {
    return json({ error: 'Username and display name required' }, { status: 400 });
  }

  if (!data.password) {
    return json({ error: 'Password required' }, { status: 400 });
  }

  // Validate password strength
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
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        user_metadata: {
            username: data.username,
            full_name: data.displayName
        },
        email_confirm: true
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create user');

    const profileData = {
      id: authData.user.id,
      username: data.username,
      display_name: data.displayName,
      role: isSelfRegistration ? 'Operator' : (data.role || 'Operator'),
      is_active: true
    };

    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profileData)
        .select()
        .single();

    if (profileError) throw profileError;

    // Handle station assignments
    if (data.stations && Array.isArray(data.stations)) {
        const stationRecords = data.stations.map((s: any) => ({
            user_id: profile.id,
            station_id: s.stationId,
            is_head: s.isHead
        }));
        if (stationRecords.length > 0) {
            await supabaseAdmin.from('user_stations').insert(stationRecords);
        }
    }

    await supabaseAdmin.from('user_preferences').upsert({ user_id: authData.user.id });

    return json({
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      role: profile.role,
      stations: data.stations || []
    }, { status: 201 });

  } catch (err: any) {
    console.error('Failed to create user:', err);
    if (err.message?.includes('already registered')) {
         return json({ error: 'Username/Email already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create user: ' + err.message }, { status: 500 });
  }
};
