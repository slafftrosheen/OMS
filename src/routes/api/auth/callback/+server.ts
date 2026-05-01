import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** GET /api/auth/callback — Supabase OAuth redirect lands here */
export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');

  if (code) {
    await locals.supabase.auth.exchangeCodeForSession(code);
  }

  throw redirect(303, '/orders');
};

/** POST /api/auth/callback — Apple sends form_post here */
export const POST: RequestHandler = async ({ request, locals }) => {
  const form = await request.formData();
  const code = form.get('code')?.toString();

  if (code) {
    await locals.supabase.auth.exchangeCodeForSession(code);
  }

  throw redirect(303, '/orders');
};
