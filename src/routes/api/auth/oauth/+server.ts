import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** GET /api/auth/oauth?provider=google|apple — initiate OAuth flow */
export const GET: RequestHandler = async ({ url, locals }) => {
  const provider = url.searchParams.get('provider') as 'google' | 'apple' | null;
  if (!provider || !['google', 'apple'].includes(provider)) {
    return json({ error: 'Invalid provider. Use google or apple.' }, { status: 400 });
  }

  const { data, error } = await locals.supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${url.origin}/api/auth/callback`,
      queryParams: provider === 'apple' ? { response_mode: 'form_post' } : undefined,
    },
  });

  if (error || !data.url) {
    return json({ error: error?.message ?? 'OAuth init failed' }, { status: 500 });
  }

  throw redirect(302, data.url);
};
