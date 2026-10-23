/** Current account identity is taken from server locals, never from request JSON. */
export class AccountAccessError extends Error {
  constructor(public code: 'unauthorized' | 'inactive_user' | 'account_unavailable', public status: number) {
    super(code === 'unauthorized' ? 'Sign in to continue.' : code === 'inactive_user'
      ? 'An active account is required.' : 'Account verification is unavailable.');
  }
}
export async function requireActiveAccount(locals: {
  user?: { id: string } | null;
  supabase: { from(table: string): any };
}): Promise<string> {
  if (!locals.user?.id) throw new AccountAccessError('unauthorized', 401);
  try {
    const { data, error } = await locals.supabase.from('profiles').select('is_active').eq('id', locals.user.id).single();
    if (error || !data) throw new AccountAccessError('account_unavailable', 503);
    if (data.is_active !== true) throw new AccountAccessError('inactive_user', 403);
    return locals.user.id;
  } catch (cause) {
    if (cause instanceof AccountAccessError) throw cause;
    throw new AccountAccessError('account_unavailable', 503);
  }
}
