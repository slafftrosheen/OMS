export * from '../../src/app/navigation.js';

export function replaceState(url: string | URL, state: Record<string, unknown>) {
  window.history.replaceState(state, '', url);
}
