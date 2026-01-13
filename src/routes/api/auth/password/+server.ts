import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * PUT /api/auth/password - Change password
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const { currentPassword, newPassword } = await request.json();
  const session = await locals.getSession();

  if (!session) {
    throw error(401, 'Unauthorized');
  }

  // With Supabase Auth, we should use updateUser
  const { error: updateError } = await locals.supabase.auth.updateUser({
      password: newPassword
  });

  if (updateError) {
      return json({ error: updateError.message }, { status: 400 });
  }

  return json({ success: true });
};
