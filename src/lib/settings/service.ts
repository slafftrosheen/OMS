// src/lib/settings/service.ts
import { base } from '$app/paths';
import { env } from '$env/dynamic/public';
import { theme } from '$lib/stores/theme';
import { scale } from '$lib/stores/scale';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';

const isBrowser = typeof window !== 'undefined';

/**
 * Persist the active theme, locale and scale. During local development we sync to the
 * SvelteKit endpoint so engineers can exercise the API contract. On static
 * builds (e.g. GitHub Pages) we rely on the underlying stores' localStorage
 * persistence and skip the network call to avoid 405 errors from missing
 * server routes.
 */
export async function savePrefs() {
  if (!isBrowser) return;

  const t = get(theme) as any;
  const l = get(locale) as any;
  const s = get(scale) as any;

  const configuredEndpoint = env.PUBLIC_PREF_SYNC_ENDPOINT;
  const shouldSyncRemotely = import.meta.env.DEV || Boolean(configuredEndpoint);
  if (!shouldSyncRemotely) return;

  const endpoint = configuredEndpoint ?? `${base}/api/settings`;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: t, lang: l, scale: s })
    });
  } catch (error) {
    console.debug('Skipping remote preference sync', error);
  }
}
