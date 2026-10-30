import { register, init, getLocaleFromNavigator, locale, addMessages, t } from 'svelte-i18n';
import { queuePreferenceUpdate, subscribePreferences } from '$lib/preferences';
import en from '../locales/en.json';

const KEY = 'rf_locale';
let localeChangeVersion = 0;
const SUPPORTED_LOCALES = ['en', 'ru', 'lv'] as const;
type LocaleCode = (typeof SUPPORTED_LOCALES)[number];
let selectedLocale: LocaleCode | undefined;

addMessages('en', en);
register('ru', () => import('../locales/ru.json'));
register('lv', () => import('../locales/lv.json'));

function normalizeLocale(value: string | null | undefined, fallback: LocaleCode): LocaleCode {
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if ((SUPPORTED_LOCALES as readonly string[]).includes(lower)) return lower as LocaleCode;
  const base = lower.split('-')[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base) ? base as LocaleCode : fallback;
}

function applyLocale(code: LocaleCode) {
  localeChangeVersion++;
  selectedLocale = code;
  locale.set(code);
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(KEY, code); } catch { /* Keep the in-memory choice. */ }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = code;
}

export async function setupI18n(defaultLocale: LocaleCode = 'en') {
  let saved: string | null = null;
  if (typeof window !== 'undefined') {
    try { saved = localStorage.getItem(KEY); } catch { /* Browser storage can be disabled. */ }
  }
  const initial = normalizeLocale(saved || getLocaleFromNavigator(), defaultLocale);
  const versionAtStart = localeChangeVersion;
  await init({ fallbackLocale: 'en', initialLocale: initial });
  // Dictionary loading must not undo a newer account hydration or explicit selection.
  if (versionAtStart !== localeChangeVersion && selectedLocale) locale.set(selectedLocale);
  else selectedLocale = initial;
  if (typeof document !== 'undefined') document.documentElement.lang = selectedLocale;
}

export function setLocale(code: LocaleCode | string) {
  const normalized = normalizeLocale(code, 'en');
  applyLocale(normalized);
  queuePreferenceUpdate({ locale: normalized });
}

subscribePreferences(preferences => {
  if (typeof preferences.locale === 'string') applyLocale(normalizeLocale(preferences.locale, 'en'));
});

export { locale, t };
export const locales = SUPPORTED_LOCALES;
