/** Presentation-only helpers for the Telegram Mini App SDK.
 * Nothing here authenticates or authorises: the signed-in OMS account does. */
export type TelegramScheme = 'light' | 'dark';
export type TelegramHaptic = 'select' | 'light' | 'success' | 'warning' | 'error';
export interface TelegramWebAppLike {
  colorScheme?: TelegramScheme;
  version?: string;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  HapticFeedback?: {
    selectionChanged?: () => void;
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'success' | 'warning' | 'error') => void;
  };
}

export const TELEGRAM_SCHEME_KEY = 'oms-telegram-scheme';
const HEX = /^#[0-9a-f]{6}$/i;

export function telegramWebApp(): TelegramWebAppLike | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { Telegram?: { WebApp?: TelegramWebAppLike } }).Telegram?.WebApp ?? null;
}

const atLeast = (app: TelegramWebAppLike, version: string) => {
  try { return !!app.isVersionAtLeast?.(version); } catch { return false; }
};

/** Telegram's scheme decides Paper vs Night Shift while OMS runs inside Telegram. */
export function telegramScheme(app: TelegramWebAppLike | null): TelegramScheme | null {
  return app?.colorScheme === 'dark' || app?.colorScheme === 'light' ? app.colorScheme : null;
}

export function rememberTelegramScheme(scheme: TelegramScheme | null) {
  if (typeof document === 'undefined') return;
  if (scheme) document.documentElement.dataset.tgScheme = scheme;
  else delete document.documentElement.dataset.tgScheme;
  try {
    if (scheme) sessionStorage.setItem(TELEGRAM_SCHEME_KEY, scheme);
    else sessionStorage.removeItem(TELEGRAM_SCHEME_KEY);
  } catch { /* private mode */ }
}

/** Paint Telegram's header and background in the same tone as the page. */
export function paintTelegramChrome(app: TelegramWebAppLike | null, color: string) {
  if (!app || !HEX.test(color) || !atLeast(app, '6.1')) return;
  try { app.setHeaderColor?.(color); app.setBackgroundColor?.(color); } catch { /* older clients */ }
  if (atLeast(app, '7.10')) try { app.setBottomBarColor?.(color); } catch { /* older clients */ }
}

/** Swipe-to-close fights scrolling in chat, lists and canvas. Keep it off in OMS. */
export function holdTelegramSwipes(app: TelegramWebAppLike | null) {
  if (app && atLeast(app, '7.7')) try { app.disableVerticalSwipes?.(); } catch { /* older clients */ }
}

export function telegramHaptic(kind: TelegramHaptic, app: TelegramWebAppLike | null = telegramWebApp()) {
  const feedback = app && atLeast(app, '6.1') ? app.HapticFeedback : undefined;
  if (!feedback) return;
  try {
    if (kind === 'select') feedback.selectionChanged?.();
    else if (kind === 'light') feedback.impactOccurred?.('light');
    else feedback.notificationOccurred?.(kind);
  } catch { /* haptics are optional */ }
}

/** Telegram's content safe area as CSS custom properties (px). */
export function telegramInsets(app: TelegramWebAppLike | null) {
  const content = app?.contentSafeAreaInset ?? {}, device = app?.safeAreaInset ?? {};
  const px = (value: unknown) => Number.isFinite(value) && Number(value) >= 0 ? Math.min(200, Number(value)) : 0;
  return {
    '--tg-inset-top': `${px(content.top) + px(device.top)}px`,
    '--tg-inset-bottom': `${px(content.bottom) + px(device.bottom)}px`
  };
}
