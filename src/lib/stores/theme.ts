import { writable } from 'svelte/store';
import { base } from '$app/paths';
import { loadPreferences } from '$lib/preferences';

export type ThemeName = 'LightVim' | 'DarkVim' | 'HighContrast';
const THEME_KEY = 'rf_theme';
const isBrowser = typeof window !== 'undefined';

// Use localStorage for instant initial load
const stored = isBrowser ? localStorage.getItem(THEME_KEY) : null;
const normalized = stored === 'HighContrastVim' ? 'HighContrast' : stored;
const initial: ThemeName = (normalized as ThemeName) || 'DarkVim';

export const theme = writable<ThemeName>(initial);

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let hasSyncedOnce = false;
let lastSynced: ThemeName | null = initial;

async function syncThemeToServer(t: ThemeName) {
  if (!isBrowser) return;
  try {
    const res = await fetch(`${base}/api/preferences`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: t })
    });
    // Silently ignore 401 - user not logged in
    if (!res.ok && res.status !== 401) {
      console.debug('Failed to sync theme preference');
    }
  } catch (err) {
    // Network error - silently ignore
  }
}

function apply(t: ThemeName) {
  if (!isBrowser) return;
  document.documentElement.setAttribute('data-theme', t);
  // Keep localStorage as cache for instant load
  localStorage.setItem(THEME_KEY, t);
}

if (isBrowser) {
  apply(initial);
  
  // Load from server
  loadPreferences()
    .then(prefs => {
      if (prefs?.theme) {
        const nextTheme = prefs.theme as ThemeName;
        lastSynced = nextTheme;
        if (nextTheme !== initial) {
          theme.set(nextTheme);
        }
      }
    })
    .catch(() => {});
}

theme.subscribe((t) => {
  apply(t);
  if (!hasSyncedOnce) {
    hasSyncedOnce = true;
    lastSynced = t;
    return;
  }
  if (t === lastSynced) {
    return;
  }
  lastSynced = t;
  // Debounce server sync
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => syncThemeToServer(t), 500);
});
