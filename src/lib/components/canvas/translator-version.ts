import { t } from 'svelte-i18n';

/**
 * svelte-i18n's translator store returns a fresh function on every read, which
 * React's useSyncExternalStore treats as a changed snapshot ("getSnapshot should
 * be cached"). Components only need to know *that* translations changed, so they
 * read this version, which moves only when the store actually emits.
 */
let version = 0;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

export function subscribeTranslator(notify: () => void): () => void {
  listeners.add(notify);
  if (!stop) {
    let initial = true;
    stop = t.subscribe(() => {
      if (initial) return;
      version++;
      for (const listener of listeners) listener();
    });
    initial = false;
  }
  return () => {
    listeners.delete(notify);
    if (!listeners.size && stop) { stop(); stop = null; }
  };
}
export const translatorVersion = () => version;
