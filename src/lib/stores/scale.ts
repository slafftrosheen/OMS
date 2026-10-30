import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { queuePreferenceUpdate, subscribePreferences } from '$lib/preferences';

export type Scale = 'sm' | 'md' | 'lg' | 'xl';
const KEY = 'rf_scale';
const SCALE_TO_REM: Record<Scale, string> = { sm: '14px', md: '16px', lg: '18px', xl: '20px' };
const isScale = (value: unknown): value is Scale =>
  typeof value === 'string' && Object.hasOwn(SCALE_TO_REM, value);

function readInitialScale(): Scale {
  if (!browser) return 'md';
  try {
    const stored = localStorage.getItem(KEY);
    return isScale(stored) ? stored : 'md';
  } catch { return 'md'; }
}

let current = readInitialScale();
const store = writable<Scale>(current);

function applyScale(value: Scale, persist = true) {
  if (!browser || !isScale(value)) return;
  current = value;
  store.set(value);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--rf-scale', value);
    document.documentElement.style.setProperty('--rf-font-size', SCALE_TO_REM[value]);
    document.documentElement.dataset.scale = value;
  }
  try { localStorage.setItem(KEY, value); } catch { /* Keep the in-memory choice. */ }
  if (persist) queuePreferenceUpdate({ scale: value });
}

export const scale = {
  subscribe: store.subscribe,
  set: (value: Scale) => applyScale(value),
  update: (updater: (value: Scale) => Scale) => applyScale(updater(current))
};

subscribePreferences(preferences => {
  if (isScale(preferences.scale)) applyScale(preferences.scale, false);
});
applyScale(current, false);
