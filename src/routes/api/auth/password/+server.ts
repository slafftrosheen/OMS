import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Validates password strength requirements
 */
function isValidPassword(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\\[\\]{};':"\\|,.<>\\/?]/.test(password);
  
  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

/**
 * PUT /api/auth/password - Change password
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const { currentPassword, newPassword } = await request.json();
  const session = await locals.getSession();

  if (!session) {
    throw error(401, 'Unauthorized');
  }

  // Validate new password strength
  if (!isValidPassword(newPassword)) {
    return json({ error: 'New password must be at least 8 characters with uppercase, lowercase, number, and special character' }, { status: 400 });
  }

  // First, verify the current password by attempting to sign in
  if (currentPassword) {
    const { error: signInError } = await locals.supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword
    });

    if (signInError) {
      return json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    // Sign out the temporary session created during verification
    await locals.supabase.auth.signOut();
  } else {
    return json({ error: 'Current password is required' }, { status: 400 });
  }

  // Update to the new password
  const { error: updateError } = await locals.supabase.auth.updateUser({
      password: newPassword
  });

  if (updateError) {
      return json({ error: updateError.message }, { status: 400 });
  }

  return json({ success: true });
};
