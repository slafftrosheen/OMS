import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { base } from '$app/paths';

export type Scale = 'sm' | 'md' | 'lg' | 'xl';

const KEY = 'rf_scale';
const SCALE_TO_REM: Record<Scale, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px'
};

function readInitialScale(): Scale {
  if (!browser) return 'md';
  // Use localStorage for instant load, will sync with DB later
  const stored = localStorage.getItem(KEY) as Scale | null;
  if (stored && stored in SCALE_TO_REM) {
    return stored;
  }
  return 'md';
}

function applyScale(value: Scale) {
  if (!browser) return;
  document.documentElement.style.setProperty('--rf-scale', value);
  document.documentElement.style.setProperty('--rf-font-size', SCALE_TO_REM[value]);
  document.documentElement.dataset.scale = value;
  // Keep localStorage as cache for instant load
  localStorage.setItem(KEY, value);
}

async function syncScaleToServer(value: Scale) {
  if (!browser) return;
  try {
    const res = await fetch(`${base}/api/preferences`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scale: value })
    });
    // Silently ignore 401 - user not logged in
    if (!res.ok && res.status !== 401) {
      console.debug('Failed to sync scale preference');
    }
  } catch (err) {
    // Network error - silently ignore
  }
}

const initial = readInitialScale();

export const scale = writable<Scale>(initial);

if (browser) {
  applyScale(initial);
  
  // Load from server and sync
  fetch(`${base}/api/preferences`)
    .then(res => res.ok ? res.json() : null)
    .then(prefs => {
      if (prefs?.scale && prefs.scale in SCALE_TO_REM) {
        scale.set(prefs.scale as Scale);
      }
    })
    .catch(() => {});
}

scale.subscribe((value) => {
  applyScale(value);
  syncScaleToServer(value);
});
