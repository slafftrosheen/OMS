import { register, init, getLocaleFromNavigator, locale, addMessages } from 'svelte-i18n';
import { base } from '$app/paths';
import en from '../locales/en.json';

const KEY = 'rf_locale';
const SUPPORTED_LOCALES = ['en', 'ru', 'lv'] as const;
type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

addMessages('en', en);
register('ru', () => import('../locales/ru.json'));
register('lv', () => import('../locales/lv.json'));

function normalizeLocale(value: string | null | undefined, fallback: LocaleCode): LocaleCode {
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if ((SUPPORTED_LOCALES as readonly string[]).includes(lower)) {
    return lower as LocaleCode;
  }
  const base = lower.split('-')[0];
  if ((SUPPORTED_LOCALES as readonly string[]).includes(base)) {
    return base as LocaleCode;
  }
  return fallback;
}

async function syncLocaleToServer(localeCode: LocaleCode) {
  if (typeof window === 'undefined') return;
  try {
    await fetch(`${base}/api/preferences`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: localeCode })
    });
  } catch (err) {
    console.debug('Failed to sync locale preference:', err);
  }
}

export async function setupI18n(defaultLocale: LocaleCode = 'en') {
  // Use localStorage for instant load
  const saved = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
  const initial = normalizeLocale(saved || getLocaleFromNavigator(), defaultLocale);
  await init({
    fallbackLocale: 'en',
    initialLocale: initial
  });

  // Load from server and sync if different
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`${base}/api/preferences`);
      if (res.ok) {
        const prefs = await res.json();
        if (prefs?.locale && prefs.locale !== initial) {
          const serverLocale = normalizeLocale(prefs.locale, defaultLocale);
          locale.set(serverLocale);
          localStorage.setItem(KEY, serverLocale);
          document.documentElement.lang = serverLocale;
        }
      }
    } catch (err) {
      console.debug('Failed to load locale from server:', err);
    }
  }
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function setLocale(code: LocaleCode | string) {
  const normalized = normalizeLocale(code, 'en');
  locale.set(normalized);
  if (typeof window !== 'undefined') {
    // Keep localStorage as cache
    localStorage.setItem(KEY, normalized);
    document.documentElement.lang = normalized;
    
    // Debounce server sync
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => syncLocaleToServer(normalized), 500);
  }
}

// Re-export locale for compatibility
export { locale };

// Export available locales
export const locales = SUPPORTED_LOCALES;
