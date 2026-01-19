import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/auth - Login
 * This is now handled by Supabase Auth on the client side.
 * However, we can use this endpoint to facilitate server-side sign-in if needed,
 * but typically with Supabase + SvelteKit, we use the helpers to manage session via cookies.
 *
 * If the frontend is sending username/password here, we should redirect it to use Supabase JS client.
 * But since we are "fully refactoring", we should assume the frontend might need updates or we should proxy the auth request to Supabase.
 *
 * Proxying auth request to Supabase (signInWithPassword):
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  let { email, password } = body;
  const { username } = body;

  if (!password) {
    return json({ error: 'Password required' }, { status: 400 });
  }

  // If username provided but no email, lookup user ID first
  if (!email && username) {
    let profile;
    let profileError;

    try {
      const result = await locals.supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .single();

      profile = result.data;
      profileError = result.error;
    } catch (err) {
      console.error('Unexpected error during profile lookup:', err);
      return json({ error: 'Database error during profile lookup' }, { status: 500 });
    }

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
      console.error('Profile lookup error:', profileError);
      console.error('Error details:', {
        code: profileError.code,
        message: profileError.message,
        hint: profileError.hint,
        details: profileError.details
      });
      return json({ error: `Database error: ${profileError.message}` }, { status: 500 });
    }

    if (profile && profile.id) {
      // Get email from auth.users table using the user ID
      const { data: authUser, error: authError } = await locals.supabase
        .from('auth.users')
        .select('email')
        .eq('id', profile.id)
        .single();

      if (authError) {
        console.error('Auth user lookup error:', authError);
        return json({ error: 'Database error retrieving user email' }, { status: 500 });
      }

      if (authUser && authUser.email) {
        email = authUser.email;
      } else {
        return json({ error: 'Username not found' }, { status: 404 });
      }
    } else {
      return json({ error: 'Username not found' }, { status: 404 });
    }
  }

  if (!email) {
    return json({ error: 'Email or Username required' }, { status: 400 });
  }

  const { data, error } = await locals.supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return json({ error: error.message }, { status: 401 });
  }

  // Session is automatically handled by the Supabase client and cookies
  // We can return the user profile.

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  return json({
    user: {
      id: profile?.id || data.user.id,
      email: data.user.email,
      username: profile?.username,
      displayName: profile?.display_name,
      primarySection: profile?.primary_section,
      sections: profile?.sections,
      roles: profile?.roles,
      stations: profile?.stations || []
    }
  });
};

/**
 * DELETE /api/auth - Logout
 */
export const DELETE: RequestHandler = async ({ locals }) => {
  const { error } = await locals.supabase.auth.signOut();
  if (error) {
    return json({ error: error.message }, { status: 500 });
  }
  return json({ success: true });
};

/**
 * GET /api/auth - Get current session
 */
export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ user: null });
  }

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return json({
    user: {
      id: profile?.id || session.user.id,
      email: session.user.email,
      username: profile?.username,
      displayName: profile?.display_name,
      primarySection: profile?.primary_section,
      sections: profile?.sections,
      roles: profile?.roles,
      stations: profile?.stations || []
    }
  });
};
