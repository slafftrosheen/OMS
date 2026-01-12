import { writable } from 'svelte/store';
import { base } from '$app/paths';

type Prefs = {
  theme: 'LightVim'|'DarkVim'|'HighContrastVim',
  density: 'compact'|'cozy'|'comfortable',
  fontScale: number
};

const isBrowser = typeof window !== 'undefined';

// Normalize theme names from older versions
function normalizeTheme(theme: string | null): Prefs['theme'] {
  if (!theme) return 'DarkVim';
  if (theme === 'HighContrast') return 'HighContrastVim';
  if (['LightVim', 'DarkVim', 'HighContrastVim'].includes(theme)) {
    return theme as Prefs['theme'];
  }
  return 'DarkVim';
}

// Use localStorage for instant initial load
const init: Prefs = {
  theme: normalizeTheme(isBrowser ? localStorage.getItem('rf_theme') : null),
  density: (isBrowser ? localStorage.getItem('rf_density') : null) as any || 'cozy',
  fontScale: +(isBrowser ? localStorage.getItem('rf_font') || '1.0' : '1.0')
};

export const ui = writable<Prefs>(init);

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

async function syncPrefsToServer(p: Prefs) {
  if (!isBrowser) return;
  try {
    const res = await fetch(`${base}/api/preferences`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        theme: p.theme,
        density: p.density,
        customSettings: { fontScale: p.fontScale }
      })
    });
    // Silently ignore 401 - user not logged in
    if (!res.ok && res.status !== 401) {
      console.debug('Failed to sync UI preferences');
    }
  } catch (err) {
    // Network error - silently ignore
  }
}

ui.subscribe(p => {
  if (!isBrowser) return;
  document.documentElement.dataset.theme   = p.theme;
  document.documentElement.dataset.density = p.density;
  document.documentElement.style.setProperty('--font-scale', String(p.fontScale));
  // Keep localStorage as cache for instant load
  localStorage.setItem('rf_theme', p.theme);
  localStorage.setItem('rf_density', p.density);
  localStorage.setItem('rf_font', String(p.fontScale));
  
  // Debounce server sync
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => syncPrefsToServer(p), 500);
});

// Load from server on init
if (isBrowser) {
  fetch(`${base}/api/preferences`)
    .then(res => res.ok ? res.json() : null)
    .then(prefs => {
      if (prefs) {
        ui.update(current => ({
          theme: prefs.theme || current.theme,
          density: prefs.density || current.density,
          fontScale: prefs.customSettings?.fontScale || current.fontScale
        }));
      }
    })
    .catch(() => {});
}
