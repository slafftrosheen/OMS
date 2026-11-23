/** Svelte-i18n store bridge for React/tldraw shape controls.
 * Subscribe to the translator store, not just locale: lazy RU/LV dictionaries
 * arrive after locale updates and must refresh visible canvas nodes.
 */
import { useSyncExternalStore } from 'react';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

import { subscribeTranslator, translatorVersion } from './translator-version';

export function useToolkitText() {
  useSyncExternalStore(subscribeTranslator, translatorVersion, translatorVersion);
  const translate = get(t);
  return (key: string, vars: Record<string, string | number> = {}) =>
    translate(key.startsWith('kind.') ? `toolkit.${key}` : `toolkit.nodes.${key}`, vars);
}
