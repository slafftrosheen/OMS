import { onDestroy } from 'svelte';

export * from '../../src/app/navigation.js';

type NavigationGuard = (navigation: { willUnload: boolean; cancel: () => void }) => void;
const guards = new Set<NavigationGuard>();

// Exercise the real page's registered navigation guard in component fixtures.
export function beforeNavigate(guard: NavigationGuard) {
  guards.add(guard);
  onDestroy(() => guards.delete(guard));
}

export function requestFixtureNavigation() {
  let cancelled = false;
  for (const guard of guards) guard({ willUnload: false, cancel: () => { cancelled = true; } });
  return !cancelled;
}

export function replaceState(url: string | URL, state: Record<string, unknown>) {
  window.history.replaceState(state, '', url);
}
