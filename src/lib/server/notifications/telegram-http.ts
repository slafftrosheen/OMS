import { json } from '@sveltejs/kit';
import { TelegramServiceError } from './telegram-service';

export const telegramPrivateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

export async function requireActiveTelegramUser(locals: App.Locals): Promise<string> {
  if (!locals.user?.id) throw new TelegramServiceError('unauthorized', 401);
  const { data, error } = await locals.supabase.from('profiles').select('is_active').eq('id', locals.user.id).single();
  if (error) throw new TelegramServiceError('account_unavailable');
  if (data?.is_active !== true) throw new TelegramServiceError('inactive_user', 403);
  return locals.user.id;
}

export function telegramErrorResponse(error: unknown): Response {
  const known = error instanceof TelegramServiceError;
  const code = known ? error.code : 'unavailable';
  const status = known ? error.status : 503;
  const messages: Record<string, string> = {
    unauthorized: 'Sign in to manage Telegram notifications.',
    inactive_user: 'An active account is required.',
    forbidden: 'Invalid integration credentials.',
    not_configured: 'Telegram has not been configured by your administrator.',
    invalid_request: 'Invalid Telegram request.',
    not_connected: 'Connect your Telegram account first.',
    link_rate_limited: 'Wait 30 seconds before creating another connection link.'
    ,rd_required: 'Only active R&D accounts can manage Telegram settings.'
    ,invalid_settings: 'Check the Telegram settings, public HTTPS address and credential formats.'
    ,incomplete_settings: 'Complete the bot username, API token, public address and both different secrets before enabling Telegram.'
    ,settings_unavailable: 'Telegram settings are unavailable. Check the database and apply the Telegram settings migration.'
    ,provider_unavailable: 'Telegram did not accept this request. Check the saved bot credential and try again.'
  };
  return json({ error: messages[code] ?? 'Telegram is temporarily unavailable. Please try again.', code }, {
    status, headers: { ...telegramPrivateHeaders, ...(status === 429 ? { 'Retry-After': '30' } : {}) }
  });
}
