/** Public, non-secret Telegram options shared by the R&D form and server. */
export const TELEGRAM_COMMANDS = ['help', 'today', 'orders', 'order', 'notifications', 'read', 'pause', 'resume'] as const;
export const TELEGRAM_CATEGORIES = ['ORDER', 'CHAT', 'INVENTORY', 'SYSTEM'] as const;
export type TelegramCommandName = typeof TELEGRAM_COMMANDS[number] | 'ask';
export type TelegramConnectionMode = 'polling' | 'webhook';
export interface TelegramReceiverStatus {
  available: boolean;
  state: 'disabled' | 'webhook' | 'waiting' | 'polling' | 'backoff' | 'unavailable';
  lastPollAt: string | null;
  lastUpdateAt: string | null;
  lastError: string | null;
  retryAt: string | null;
}
export interface TelegramOptions {
  /** Missing values retain the legacy webhook mode. New installations choose polling. */
  connectionMode?: TelegramConnectionMode;
  pollingTimeoutSeconds?: number;
  enabled: boolean;
  botUsername: string;
  appUrl: string;
  commandsEnabled: boolean;
  aiEnabled: boolean;
  commands: TelegramCommandName[];
  notificationCategories: Array<typeof TELEGRAM_CATEGORIES[number]>;
  timezone: string;
  batchSize: number;
  concurrency: number;
  maxAttempts: number;
  retryBaseSeconds: number;
  automaticDelivery: boolean;
  deliveryIntervalSeconds: number;
}
export const DEFAULT_TELEGRAM_OPTIONS: TelegramOptions = {
  connectionMode: 'webhook', pollingTimeoutSeconds: 25,
  enabled: false, botUsername: '', appUrl: '', commandsEnabled: true, aiEnabled: false,
  commands: [...TELEGRAM_COMMANDS, 'ask'], notificationCategories: [...TELEGRAM_CATEGORIES],
  timezone: 'Europe/Riga', batchSize: 10, concurrency: 2, maxAttempts: 5, retryBaseSeconds: 30,
  automaticDelivery: true, deliveryIntervalSeconds: 30
};
export interface TelegramAdminStatus {
  available: boolean;
  source: 'settings' | 'environment' | 'none';
  options: TelegramOptions;
  configured: boolean;
  credentials: Record<'botToken' | 'webhookSecret' | 'deliverySecret', { configured: boolean; masked: string }>;
  webhookUrl: string | null;
  dispatchUrl: string | null;
  counts: { connected: number; pending: number; failed: number };
  receiver?: TelegramReceiverStatus;
}
