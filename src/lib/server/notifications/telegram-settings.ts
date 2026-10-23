import { z } from 'zod';
import { DEFAULT_TELEGRAM_OPTIONS, TELEGRAM_CATEGORIES, TELEGRAM_COMMANDS, type TelegramOptions, type TelegramAdminStatus } from '$lib/notifications/telegram-options';
import { isTelegramSecret, readTelegramConfig, type TelegramConfig } from './telegram';
import { TelegramServiceError } from './telegram-service';
import { telegramSettingsGeneration } from './telegram-runtime-fence';

const secret = z.string().trim().max(256).optional();
const appUrl = z.string().trim().max(500).refine(value => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, 'Use an HTTP or HTTPS OMS address without credentials, query or fragment.');
const schema = z.object({
  connectionMode: z.enum(['polling', 'webhook']).default('webhook'),
  pollingTimeoutSeconds: z.number().int().min(10).max(50).default(25),
  enabled: z.boolean(), botUsername: z.string().trim().max(33).transform(v => v.replace(/^@/, '')),
  appUrl, commandsEnabled: z.boolean(), aiEnabled: z.boolean(),
  commands: z.array(z.enum([...TELEGRAM_COMMANDS, 'ask'])).max(9),
  notificationCategories: z.array(z.enum(TELEGRAM_CATEGORIES)).max(4),
  timezone: z.string().min(1).max(80).refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }),
  batchSize: z.number().int().min(1).max(10), concurrency: z.number().int().min(1).max(2),
  maxAttempts: z.number().int().min(1).max(5), retryBaseSeconds: z.number().int().min(10).max(300),
  automaticDelivery: z.boolean(), deliveryIntervalSeconds: z.number().int().min(10).max(300)
}).strict();

export interface TelegramSettingsRecord {
  options: TelegramOptions;
  botToken: string;
  webhookSecret: string;
  deliverySecret: string;
  source: TelegramAdminStatus['source'];
  revision?: string;
}

export function environmentTelegramSettings(env: Record<string, string | undefined>): TelegramSettingsRecord {
  return {
    options: { ...DEFAULT_TELEGRAM_OPTIONS,
      // An existing environment installation must not silently lose its webhook.
      connectionMode: env.TELEGRAM_BOT_TOKEN?.trim() ? 'webhook' : 'polling',
      enabled: env.TELEGRAM_ENABLED?.trim().toLowerCase() === 'true',
      botUsername: (env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, ''), appUrl: (env.PUBLIC_APP_URL || env.PUBLIC_BASE_URL || '').replace(/\/$/, '') },
    botToken: env.TELEGRAM_BOT_TOKEN?.trim() ?? '', webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '',
    deliverySecret: env.TELEGRAM_DELIVERY_SECRET?.trim() ?? '', source: env.TELEGRAM_BOT_TOKEN?.trim() ? 'environment' : 'none'
  };
}

/** A persisted disabled switch must never be overridden by TELEGRAM_ENABLED. */
export function resolveTelegramSettings(data: unknown, env: Record<string, string | undefined>): TelegramSettingsRecord {
  if (!data) return environmentTelegramSettings(env);
  if (typeof data !== 'object') throw new TelegramServiceError('settings_unavailable');
  const row = data as Record<string, unknown>;
  const parsed = schema.safeParse({ ...DEFAULT_TELEGRAM_OPTIONS, ...(row.options as object) });
  if (!parsed.success) throw new TelegramServiceError('settings_unavailable');
  return {
    options: parsed.data as TelegramOptions, botToken: typeof row.botToken === 'string' ? row.botToken : '',
    webhookSecret: typeof row.webhookSecret === 'string' ? row.webhookSecret : '',
    deliverySecret: typeof row.deliverySecret === 'string' ? row.deliverySecret : '', source: 'settings',
    ...(typeof row.revision === 'string' ? { revision: row.revision } : {})
  };
}

export function normalizeTelegramSettingsInput(value: unknown, current: TelegramSettingsRecord) {
  // Older open settings tabs must preserve the new transport fields instead of switching modes.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (candidate.options && typeof candidate.options === 'object' && !Array.isArray(candidate.options)) {
      value = { ...candidate, options: { connectionMode: current.options.connectionMode ?? 'webhook',
        pollingTimeoutSeconds: current.options.pollingTimeoutSeconds ?? 25, ...candidate.options } };
    }
  }
  const input = z.object({ options: schema, botToken: z.string().trim().max(256).optional(), webhookSecret: secret, deliverySecret: secret }).strict().safeParse(value);
  if (!input.success) throw new TelegramServiceError('invalid_settings', 400);
  const next: TelegramSettingsRecord = { ...current, options: input.data.options as TelegramOptions, source: 'settings' };
  for (const name of ['botToken', 'webhookSecret', 'deliverySecret'] as const) {
    if (input.data[name]) next[name] = input.data[name]!;
  }
  next.options.commands = [...new Set(next.options.commands)];
  next.options.notificationCategories = [...new Set(next.options.notificationCategories)];
  next.options.appUrl = next.options.appUrl.replace(/\/$/, '');
  if (next.botToken && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(next.botToken)) throw new TelegramServiceError('invalid_settings', 400);
  if (next.options.botUsername && (!/^[A-Za-z0-9_]{5,32}$/.test(next.options.botUsername) || !/bot$/i.test(next.options.botUsername))) throw new TelegramServiceError('invalid_settings', 400);
  for (const name of ['webhookSecret', 'deliverySecret'] as const) {
    if (next[name] && !isTelegramSecret(next[name])) throw new TelegramServiceError('invalid_settings', 400);
  }
  if (next.webhookSecret && next.webhookSecret === next.deliverySecret) throw new TelegramServiceError('invalid_settings', 400);
  if (next.options.connectionMode === 'webhook' && next.options.appUrl) {
    const url = new URL(next.options.appUrl);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new TelegramServiceError('invalid_settings', 400);
  }
  if (next.options.enabled && (!next.botToken || !next.options.botUsername
    || (next.options.connectionMode === 'webhook' && (!next.webhookSecret || !next.deliverySecret || !next.options.appUrl)))) throw new TelegramServiceError('incomplete_settings', 400);
  return next;
}

export function telegramConfigFromSettings(record: TelegramSettingsRecord, env: Record<string, string | undefined>): TelegramConfig | null {
  const config = readTelegramConfig({ ...env,
    TELEGRAM_ENABLED: String(record.options.enabled), TELEGRAM_BOT_TOKEN: record.botToken,
    TELEGRAM_BOT_USERNAME: record.options.botUsername, TELEGRAM_WEBHOOK_SECRET: record.webhookSecret,
    TELEGRAM_DELIVERY_SECRET: record.deliverySecret, PUBLIC_APP_URL: record.options.appUrl,
    // An intentionally empty optional address must not resurrect an environment URL.
    PUBLIC_BASE_URL: ''
  }, record.options.connectionMode ?? 'webhook');
  return config ? { ...config, options: record.options, settingsRevision: record.revision,
    settingsGeneration: record.source === 'settings' ? telegramSettingsGeneration(record) : 'environment' } : null;
}

export function publicTelegramSettings(record: TelegramSettingsRecord, available: boolean, env: Record<string, string | undefined>): TelegramAdminStatus {
  const mask = (value: string) => ({ configured: !!value, masked: value ? `••••${value.slice(-4)}` : '' });
  return { available, source: record.source, options: record.options,
    configured: !!telegramConfigFromSettings({ ...record, options: { ...record.options, enabled: true } }, env),
    credentials: { botToken: mask(record.botToken), webhookSecret: mask(record.webhookSecret), deliverySecret: mask(record.deliverySecret) },
    webhookUrl: record.options.connectionMode !== 'polling' && record.options.appUrl ? `${record.options.appUrl}/api/telegram/webhook` : null,
    dispatchUrl: record.deliverySecret && record.options.appUrl ? `${record.options.appUrl}/api/telegram/dispatch` : null,
    counts: { connected: 0, pending: 0, failed: 0 }
  };
}
