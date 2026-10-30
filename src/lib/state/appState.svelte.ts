import { writable } from 'svelte/store';
import { queuePreferenceUpdate, subscribePreferences, type Preferences } from '$lib/preferences';

export type Prefs = {
  theme: 'LightVim' | 'DarkVim' | 'HighContrastVim';
  density: 'compact' | 'cozy' | 'comfortable';
  fontScale: number;
};

const isBrowser = typeof window !== 'undefined';
const densities: Prefs['density'][] = ['compact', 'cozy', 'comfortable'];

export function normalizeTheme(value: unknown): Prefs['theme'] {
  if (value === 'HighContrast' || value === 'HighContrastVim') return 'HighContrastVim';
  return value === 'LightVim' ? 'LightVim' : 'DarkVim';
}

function readLocal(key: string): string | null {
  if (!isBrowser) return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function normalizeFont(value: number, fallback = 1): number {
  return Number.isFinite(value) ? Math.min(1.3, Math.max(0.85, value)) : fallback;
}

const localDensity = readLocal('rf_density');
const localFont = readLocal('rf_font');
let current: Prefs = {
  theme: normalizeTheme(readLocal('rf_theme')),
  density: densities.includes(localDensity as Prefs['density']) ? localDensity as Prefs['density'] : 'cozy',
  fontScale: localFont ? normalizeFont(Number(localFont)) : 1
};
const store = writable<Prefs>(current);

function applyDocument() {
  if (!isBrowser || typeof document === 'undefined') return;
  document.documentElement.dataset.theme = current.theme;
  document.documentElement.dataset.density = current.density;
  document.documentElement.style.setProperty('--font-scale', String(current.fontScale));
  try {
    localStorage.setItem('rf_theme', current.theme);
    localStorage.setItem('rf_density', current.density);
    localStorage.setItem('rf_font', String(current.fontScale));
  } catch { /* Settings still work when browser storage is unavailable. */ }
}

function patch(values: Partial<Prefs>, persist = true) {
  if (!isBrowser) return;
  const next: Prefs = {
    theme: values.theme === undefined ? current.theme : normalizeTheme(values.theme),
    density: values.density && densities.includes(values.density) ? values.density : current.density,
    fontScale: values.fontScale === undefined ? current.fontScale : normalizeFont(values.fontScale, current.fontScale)
  };
  current = next;
  store.set(next);
  applyDocument();
  if (persist) {
    const changes: Preferences = {};
    if (values.theme !== undefined) changes.theme = next.theme;
    if (values.density !== undefined) changes.density = next.density;
    if (values.fontScale !== undefined) changes.customSettings = { fontScale: next.fontScale };
    queuePreferenceUpdate(changes);
  }
}

// A single source of truth for topbar, quick controls and settings.
export const ui = {
  subscribe: store.subscribe,
  patch,
  set: (next: Prefs) => patch(next),
  update: (updater: (value: Prefs) => Prefs) => {
    const next = updater({ ...current });
    const changes: Partial<Prefs> = {};
    if (next.theme !== current.theme) changes.theme = next.theme;
    if (next.density !== current.density) changes.density = next.density;
    if (next.fontScale !== current.fontScale) changes.fontScale = next.fontScale;
    if (Object.keys(changes).length) patch(changes);
  }
};

subscribePreferences(preferences => {
  const values: Partial<Prefs> = {};
  if (preferences.theme) values.theme = normalizeTheme(preferences.theme);
  if (densities.includes(preferences.density as Prefs['density'])) values.density = preferences.density as Prefs['density'];
  if (typeof preferences.customSettings?.fontScale === 'number') values.fontScale = preferences.customSettings.fontScale;
  patch(values, false);
});
applyDocument();
