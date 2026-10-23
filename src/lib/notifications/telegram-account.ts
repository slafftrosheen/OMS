/** Public personal settings. Identity is always resolved from the server session. */
import { TELEGRAM_CATEGORIES } from './telegram-options';

export type TelegramCategory = typeof TELEGRAM_CATEGORIES[number];
export interface TelegramPersonalPreferences {
  notificationCategories: TelegramCategory[];
  previewMode: 'full' | 'private';
  /** Additional personal consent; cannot override the R&D AI switch. */
  aiEnabled: boolean;
}
export interface TelegramLinkApproval {
  requestId: string;
  telegramUserId: string;
  username: string | null;
  expiresAt: string;
}
export interface TelegramAccountStatus {
  configured: boolean;
  available: boolean;
  connected: boolean;
  enabled: boolean;
  username: string | null;
  linkedAt: string | null;
  pendingUntil: string | null;
  botUsername: string | null;
  accountId?: string;
  telegramUserId?: string | null;
  pendingApproval?: TelegramLinkApproval | null;
  preferences?: TelegramPersonalPreferences;
  aiAvailable?: boolean;
}
export type TelegramAccountMutation =
  | { action: 'connect' }
  | { action: 'confirm'; requestId: string }
  | { action: 'enabled'; enabled: boolean }
  | { action: 'preferences'; preferences: TelegramPersonalPreferences };

export function defaultTelegramPreferences(): TelegramPersonalPreferences {
  return { notificationCategories: [...TELEGRAM_CATEGORIES], previewMode: 'full', aiEnabled: false };
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function normalizeTelegramPreferences(input: unknown): TelegramPersonalPreferences | null {
  if (!object(input) || !keysAre(input, ['notificationCategories','previewMode','aiEnabled'])) return null;
  const categories = input.notificationCategories;
  if (!Array.isArray(categories) || categories.length > TELEGRAM_CATEGORIES.length ||
      categories.some(category => typeof category !== 'string' || !(TELEGRAM_CATEGORIES as readonly string[]).includes(category)) ||
      typeof input.previewMode !== 'string' || !['full','private'].includes(input.previewMode) ||
      typeof input.aiEnabled !== 'boolean') return null;
  return {
    notificationCategories: TELEGRAM_CATEGORIES.filter(category => categories.includes(category)),
    previewMode: input.previewMode as 'full' | 'private', aiEnabled: input.aiEnabled
  };
}

/** Reject extra identity/credential fields, not merely unknown action names. */
export function parseTelegramAccountMutation(method: string, body: unknown): TelegramAccountMutation | null {
  if (!object(body)) return null;
  if (method === 'POST') {
    if (body.action === 'connect' && keysAre(body, ['action'])) return { action: 'connect' };
    if (body.action === 'confirm' && keysAre(body, ['action','requestId']) && typeof body.requestId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId)) {
      return { action:'confirm', requestId:body.requestId };
    }
  }
  if (method === 'PATCH') {
    if (keysAre(body, ['enabled']) && typeof body.enabled === 'boolean') return { action:'enabled', enabled:body.enabled };
    if (keysAre(body, ['preferences'])) {
      const preferences = normalizeTelegramPreferences(body.preferences);
      if (preferences) return { action:'preferences', preferences };
    }
  }
  return null;
}
