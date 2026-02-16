import { base } from '$app/paths';
import { loadPreferences } from '$lib/preferences';
import { writable } from 'svelte/store';

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

class UIState {
  theme = $state<Prefs['theme']>(normalizeTheme(isBrowser ? localStorage.getItem('rf_theme') : null));
  density = $state<Prefs['density']>((isBrowser ? localStorage.getItem('rf_density') : null) as any || 'cozy');
  fontScale = $state<number>(+(isBrowser ? localStorage.getItem('rf_font') || '1.0' : '1.0'));

  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastSynced: Prefs | null = null;

  constructor() {
    if (isBrowser) {
      // Set initial document attributes
      this.updateDocument();
      this.loadFromServer();
    }
  }

  updateDocument() {
    if (!isBrowser) return;
    document.documentElement.dataset.theme = this.theme;
    document.documentElement.dataset.density = this.density;
    document.documentElement.style.setProperty('--font-scale', String(this.fontScale));
    
    localStorage.setItem('rf_theme', this.theme);
    localStorage.setItem('rf_density', this.density);
    localStorage.setItem('rf_font', String(this.fontScale));
  }

  async loadFromServer() {
    try {
      const prefs = await loadPreferences();
      if (prefs) {
        this.theme = normalizeTheme(prefs.theme || this.theme);
        this.density = (prefs.density as any) || this.density;
        this.fontScale = prefs.customSettings?.fontScale || this.fontScale;
        this.updateDocument();
        syncToLegacy();
      }
    } catch (error) {
      console.warn('Failed to load preferences for UI state:', error);
    }
  }

  async syncToServer() {
    if (!isBrowser) return;
    
    const current: Prefs = {
      theme: this.theme,
      density: this.density,
      fontScale: this.fontScale
    };

    if (this.lastSynced && 
        this.lastSynced.theme === current.theme && 
        this.lastSynced.density === current.density && 
        this.lastSynced.fontScale === current.fontScale) {
      return;
    }

    try {
      const res = await fetch(`${base}/api/preferences`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          theme: current.theme,
          density: current.density,
          customSettings: { fontScale: current.fontScale }
        })
      });
      if (res.ok) {
        this.lastSynced = { ...current };
      }
    } catch (err) {
      // Ignore sync errors
    }
  }

  triggerSync() {
    this.updateDocument();
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => this.syncToServer(), 500);
  }
}

// Global UI state instance
export const uiState = new UIState();

// Backward compatibility store
const legacyStore = writable<Prefs>({
  theme: uiState.theme,
  density: uiState.density,
  fontScale: uiState.fontScale
});

function syncToLegacy() {
  legacyStore.set({
    theme: uiState.theme,
    density: uiState.density,
    fontScale: uiState.fontScale
  });
}

export const ui = {
  subscribe: legacyStore.subscribe,
  update: (fn: (p: Prefs) => Prefs) => {
    const current: Prefs = {
      theme: uiState.theme,
      density: uiState.density,
      fontScale: uiState.fontScale
    };
    const next = fn(current);
    uiState.theme = next.theme;
    uiState.density = next.density;
    uiState.fontScale = next.fontScale;
    syncToLegacy();
    uiState.triggerSync();
  },
  set: (next: Prefs) => {
    uiState.theme = next.theme;
    uiState.density = next.density;
    uiState.fontScale = next.fontScale;
    syncToLegacy();
    uiState.triggerSync();
  }
};
