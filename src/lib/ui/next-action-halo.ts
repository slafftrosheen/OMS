import type { Action } from 'svelte/action';
import './next-action-halo.css';

/**
 * Highlight the one useful next action in a workflow. The caller decides which
 * action is next; native disabled, read-only and busy states always win.
 *
 * <button use:nextActionHalo={readyToSave} disabled={saving}>Save hours</button>
 */
export const nextActionHalo: Action<HTMLElement, boolean | undefined> = (node, active = false) => {
  const apply = (enabled: boolean | undefined) => {
    if (enabled) node.setAttribute('data-next-action', 'true');
    else node.removeAttribute('data-next-action');
  };

  apply(active);
  return {
    update: apply,
    destroy() { node.removeAttribute('data-next-action'); }
  };
};
