import { derived, get } from 'svelte/store';
import { ui, normalizeTheme } from '$lib/state/appState.svelte';

// Older links and quick controls use HighContrast; canonical UI state uses HighContrastVim.
export type ThemeName = 'LightVim' | 'DarkVim' | 'HighContrast';
const selectedTheme = derived(ui, value =>
  value.theme === 'HighContrastVim' ? 'HighContrast' : value.theme
);

function setTheme(value: ThemeName | 'HighContrastVim') {
  ui.patch({ theme: normalizeTheme(value) });
}

export const theme = {
  subscribe: selectedTheme.subscribe,
  set: setTheme,
  update: (updater: (value: ThemeName) => ThemeName) => setTheme(updater(get(selectedTheme)))
};
