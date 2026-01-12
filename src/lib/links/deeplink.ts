// src/lib/links/deeplink.ts
import { get } from 'svelte/store';
import { theme } from '$lib/stores/theme';
import { locale } from 'svelte-i18n';
export function withPrefs(url: string) {
  const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://x');
  u.searchParams.set('theme', get(theme));
  u.searchParams.set('lang', get(locale) || 'en');
  return u.pathname + u.search;
}
