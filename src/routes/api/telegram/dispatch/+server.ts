import { json, type RequestHandler } from '@sveltejs/kit';
import { getTelegramRuntime } from '$lib/server/notifications/telegram-runtime';
import { matchesTelegramSecret } from '$lib/server/notifications/telegram';
import { dispatchTelegramDeliveries, TelegramServiceError } from '$lib/server/notifications/telegram-service';
import { telegramErrorResponse, telegramPrivateHeaders } from '$lib/server/notifications/telegram-http';
import { dispatchTelegramBotReplies } from '$lib/server/notifications/telegram-bot';

/** Called by the deployment's scheduler; never runs in a user mutation request. */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const runtime = await getTelegramRuntime();
    if (!runtime) throw new TelegramServiceError('not_configured');
    const header = request.headers.get('authorization');
    const secret = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!matchesTelegramSecret(secret, runtime.config.deliverySecret)) throw new TelegramServiceError('forbidden', 401);
    const notifications = await dispatchTelegramDeliveries(runtime.config, runtime.db);
    const replies = await dispatchTelegramBotReplies(runtime.config, runtime.db);
    return json({ ...notifications, replies }, { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};
