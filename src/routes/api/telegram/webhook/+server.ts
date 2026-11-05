import { json, type RequestHandler } from '@sveltejs/kit';
import { getTelegramRuntime } from '$lib/server/notifications/telegram-runtime';
import { isTelegramSecret, matchesTelegramSecret } from '$lib/server/notifications/telegram';
import { handleTelegramUpdate, TelegramServiceError } from '$lib/server/notifications/telegram-service';
import { telegramErrorResponse, telegramPrivateHeaders } from '$lib/server/notifications/telegram-http';
import { readTelegramWebhookBody, TelegramWebhookBodyError } from '$lib/server/notifications/telegram-body';

/** Telegram's webhook secret is the authentication boundary, never a user cookie. */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const secret = request.headers.get('x-telegram-bot-api-secret-token');
    if (!isTelegramSecret(secret)) throw new TelegramServiceError('forbidden', 401);
    const runtime = await getTelegramRuntime();
    if (!runtime) throw new TelegramServiceError('not_configured');
    if (runtime.config.options?.connectionMode === 'polling') throw new TelegramServiceError('webhook_disabled', 409);
    if (!matchesTelegramSecret(secret, runtime.config.webhookSecret)) {
      throw new TelegramServiceError('forbidden', 401);
    }
    const update = await readTelegramWebhookBody(request);
    await handleTelegramUpdate(runtime.config, runtime.db, update);
    return json({ ok: true }, { headers: telegramPrivateHeaders });
  } catch (error) {
    return telegramErrorResponse(error instanceof TelegramWebhookBodyError
      ? new TelegramServiceError('invalid_request', error.status) : error);
  }
};
