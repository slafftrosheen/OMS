/** Svelte-i18n store bridge for React/tldraw shape controls.
 * Subscribe to the translator store, not just locale: lazy RU/LV dictionaries
 * arrive after locale updates and must refresh visible canvas nodes.
 */
import { useSyncExternalStore } from 'react';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

const subscribe = (notify: () => void) => t.subscribe(() => notify());
const snapshot = () => get(t);

export function useToolkitText() {
  const translate = useSyncExternalStore(subscribe, snapshot, snapshot);
  return (key: string, vars: Record<string, string | number> = {}) =>
    translate(`toolkit.nodes.${key}`, vars);
}
