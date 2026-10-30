import { normalizeTelegramPreferences, type TelegramAccountStatus, type TelegramLinkApproval, type TelegramPersonalPreferences } from '$lib/notifications/telegram-account';

type Database = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: any }> };
type Config = { botUsername: string; options?: { aiEnabled?: boolean; commandsEnabled?: boolean; commands?: readonly string[] } };
export class TelegramAccountError extends Error {
  constructor(public code: string, public status = 503) { super('Telegram account operation could not be completed.'); }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const chatId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value);
const username = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(value) ? value : null;

/** Projection-only response: no token, link digest, chat payload or other user's profile. */
export async function readTelegramAccount(config: Config | null, db: Database, userId: string): Promise<TelegramAccountStatus> {
  const unavailable: TelegramAccountStatus = { configured: !!config, available:false, connected:false, enabled:false,
    username:null, linkedAt:null, pendingUntil:null, botUsername:config?.botUsername ?? null, accountId:userId };
  try {
    const { data, error } = await db.rpc('telegram_account_status', { p_user_id:userId });
    const preferences = normalizeTelegramPreferences(data?.preferences);
    if (error || !data || data.accountId !== userId || !preferences || typeof data.connected !== 'boolean' || typeof data.enabled !== 'boolean') return unavailable;
    if (data.connected && (!chatId(data.telegramUserId) || !date(data.linkedAt))) return unavailable;
    let pendingApproval: TelegramLinkApproval | null = null;
    const pending = data.pendingApproval;
    if (pending && uuid(pending.requestId) && chatId(pending.telegramUserId) && date(pending.expiresAt) && Date.parse(pending.expiresAt) > Date.now()) {
      pendingApproval = { requestId:pending.requestId, telegramUserId:pending.telegramUserId,
        username:username(pending.username), expiresAt:pending.expiresAt };
    }
    return { ...unavailable, available:true, connected:data.connected, enabled:data.connected && data.enabled,
      username:username(data.username), linkedAt:date(data.linkedAt), pendingUntil:date(data.pendingUntil),
      telegramUserId:data.connected ? data.telegramUserId : null, pendingApproval, preferences,
      aiAvailable:!!config?.options?.aiEnabled && config.options.commandsEnabled !== false && !!config.options.commands?.includes('ask') };
  } catch { return unavailable; }
}
export async function confirmTelegramAccount(db: Database, userId: string, requestId: string): Promise<void> {
  if (!uuid(requestId)) throw new TelegramAccountError('invalid_request',400);
  const result = await db.rpc('confirm_telegram_link', { p_user_id:userId, p_request_id:requestId });
  if (result.error) throw new TelegramAccountError('confirmation_unavailable');
  if (result.data !== true) throw new TelegramAccountError('confirmation_expired',409);
}
export async function saveTelegramPreferences(db: Database, userId: string, preferences: TelegramPersonalPreferences): Promise<void> {
  const valid = normalizeTelegramPreferences(preferences);
  if (!valid) throw new TelegramAccountError('invalid_request',400);
  const result = await db.rpc('set_telegram_personal_preferences', {
    p_user_id:userId, p_categories:valid.notificationCategories, p_preview_mode:valid.previewMode, p_ai_enabled:valid.aiEnabled
  });
  if (result.error || result.data !== true) throw new TelegramAccountError('preferences_unavailable');
}
/** Read a bounded stream; Content-Length is only an early-rejection hint. */
export async function readTelegramAccountBody(request: Request): Promise<unknown> {
  const limit = 8192;
  if (Number(request.headers.get('content-length')) > limit) throw new TelegramAccountError('invalid_request',413);
  const reader = request.body?.getReader();
  if (!reader) throw new TelegramAccountError('invalid_request',400);
  const decoder = new TextDecoder('utf-8', { fatal:true });
  let bytes=0, text='';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new TelegramAccountError('invalid_request',413); }
      text += decoder.decode(chunk.value, { stream:true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof TelegramAccountError) throw error;
    throw new TelegramAccountError('invalid_request',400);
  } finally { reader.releaseLock(); }
}
