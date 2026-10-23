import { json, type RequestHandler } from '@sveltejs/kit';
import { getTelegramDatabase, getTelegramRuntime } from '$lib/server/notifications/telegram-runtime';
import { connectTelegram, TelegramServiceError } from '$lib/server/notifications/telegram-service';
import { requireActiveTelegramUser, telegramErrorResponse, telegramPrivateHeaders } from '$lib/server/notifications/telegram-http';
import { parseTelegramAccountMutation } from '$lib/notifications/telegram-account';
import { readTelegramAccount, confirmTelegramAccount, saveTelegramPreferences, readTelegramAccountBody, TelegramAccountError } from '$lib/server/notifications/telegram-account-service';

function database() {
  const db = getTelegramDatabase();
  if (!db) throw new TelegramServiceError('account_unavailable');
  return db;
}
function failure(error: unknown) {
  return telegramErrorResponse(error instanceof TelegramAccountError ? new TelegramServiceError(error.code,error.status) : error);
}
async function optionalConfig() {
  try { return (await getTelegramRuntime())?.config ?? null; }
  catch { return null; } // Own preferences/disconnect do not depend on Vault/provider availability.
}
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    const db = database();
    return json(await readTelegramAccount(await optionalConfig(),db,userId), { headers:telegramPrivateHeaders });
  } catch (error) { return failure(error); }
};
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    const mutation = parseTelegramAccountMutation('POST',await readTelegramAccountBody(request));
    if (!mutation || !['connect','confirm'].includes(mutation.action)) throw new TelegramServiceError('invalid_request',400);
    const runtime = await getTelegramRuntime();
    if (!runtime) throw new TelegramServiceError('not_configured');
    if (mutation.action === 'connect') return json({ ...(await connectTelegram(runtime.config,runtime.db,userId)), accountId:userId }, { headers:telegramPrivateHeaders });
    if (mutation.action !== 'confirm') throw new TelegramServiceError('invalid_request',400);
    await confirmTelegramAccount(runtime.db,userId,mutation.requestId);
    return json({ success:true, status:await readTelegramAccount(runtime.config,runtime.db,userId) }, { headers:telegramPrivateHeaders });
  } catch (error) { return failure(error); }
};
export const PATCH: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    const mutation = parseTelegramAccountMutation('PATCH',await readTelegramAccountBody(request));
    if (!mutation) throw new TelegramServiceError('invalid_request',400);
    const db = database();
    if (mutation.action === 'preferences') await saveTelegramPreferences(db,userId,mutation.preferences);
    else if (mutation.action === 'enabled') {
      const result = await db.rpc('set_telegram_enabled', { p_user_id:userId, p_enabled:mutation.enabled });
      if (result.error) throw new TelegramServiceError('preferences_unavailable');
      if (result.data !== true) throw new TelegramServiceError('not_connected',409);
    } else throw new TelegramServiceError('invalid_request',400);
    return json({ success:true, status:await readTelegramAccount(await optionalConfig(),db,userId) }, { headers:telegramPrivateHeaders });
  } catch (error) { return failure(error); }
};
export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    const userId = await requireActiveTelegramUser(locals);
    // Revocation works even if R&D disabled Telegram or removed its credentials.
    const result = await database().rpc('disconnect_telegram', { p_user_id:userId });
    if (result.error || result.data !== true) throw new TelegramServiceError('disconnect_unavailable');
    return json({ success:true }, { headers:telegramPrivateHeaders });
  } catch (error) { return failure(error); }
};
