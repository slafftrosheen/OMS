import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireActiveTelegramUser, telegramErrorResponse, telegramPrivateHeaders } from '$lib/server/notifications/telegram-http';
import { TelegramServiceError } from '$lib/server/notifications/telegram-service';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    await requireActiveTelegramUser(locals);
    const { data, error } = await locals.supabase.rpc('telegram_workspace_today');
    if (error) throw new TelegramServiceError('workspace_unavailable');
    if (!data) throw new TelegramServiceError('inactive_user', 403);
    return json(data, { headers: telegramPrivateHeaders });
  } catch (error) {
    return telegramErrorResponse(error);
  }
};
