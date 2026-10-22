import { json, type RequestHandler } from '@sveltejs/kit';
import { getTelegramRuntime } from '$lib/server/notifications/telegram-runtime';
import { matchesTelegramSecret } from '$lib/server/notifications/telegram';
import { dispatchTelegramDeliveries, TelegramServiceError } from '$lib/server/notifications/telegram-service';
import { telegramErrorResponse, telegramPrivateHeaders } from '$lib/server/notifications/telegram-http';

/** Called by the deployment's scheduler; never runs in a user mutation request. */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const runtime = getTelegramRuntime();
    if (!runtime) throw new TelegramServiceError('not_configured');
    const header = request.headers.get('authorization');
    const secret = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!matchesTelegramSecret(secret, runtime.config.deliverySecret)) throw new TelegramServiceError('forbidden', 401);
    return json(await dispatchTelegramDeliveries(runtime.config, runtime.db), { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};
