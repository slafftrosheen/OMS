import { json, type RequestHandler } from '@sveltejs/kit';
import { getTelegramRuntime } from '$lib/server/notifications/telegram-runtime';
import { connectTelegram, readTelegramStatus, unavailableTelegramStatus, TelegramServiceError } from '$lib/server/notifications/telegram-service';
import { requireActiveTelegramUser, telegramErrorResponse, telegramPrivateHeaders } from '$lib/server/notifications/telegram-http';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    const runtime = await getTelegramRuntime();
    return json(runtime ? await readTelegramStatus(runtime.config, runtime.db, userId) : unavailableTelegramStatus(null), { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    const body = await request.json().catch(() => null);
    if (body?.action !== 'connect') throw new TelegramServiceError('invalid_request', 400);
    const runtime = await getTelegramRuntime();
    if (!runtime) throw new TelegramServiceError('not_configured');
    return json(await connectTelegram(runtime.config, runtime.db, userId), { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    const body = await request.json().catch(() => null);
    if (typeof body?.enabled !== 'boolean') throw new TelegramServiceError('invalid_request', 400);
    const runtime = await getTelegramRuntime();
    if (!runtime) throw new TelegramServiceError('not_configured');
    const { data, error } = await runtime.db.rpc('set_telegram_enabled', { p_user_id: userId, p_enabled: body.enabled });
    if (error) throw new TelegramServiceError('preferences_unavailable');
    if (data !== true) throw new TelegramServiceError('not_connected', 409);
    return json({ success: true, status: await readTelegramStatus(runtime.config, runtime.db, userId) }, { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};

export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    const runtime = await getTelegramRuntime();
    if (!runtime) throw new TelegramServiceError('not_configured');
    const { error } = await runtime.db.rpc('disconnect_telegram', { p_user_id: userId });
    if (error) throw new TelegramServiceError('disconnect_unavailable');
    return json({ success: true }, { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};
