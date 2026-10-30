/** Keep the shared assistant reachable inside an explicitly opted-in native modal.
 * Unmarked confirmation dialogs retain browser-controlled top-layer inertness.
 */
export function assistantLayer(node: HTMLElement) {
  const document = node.ownerDocument;
  const placeholder = document.createComment('assistant-layer');
  node.before(placeholder);
  let destroyed = false;

  function restore() {
    if (placeholder.parentNode && node.previousSibling !== placeholder) placeholder.after(node);
  }

  function sync() {
    if (destroyed) return;
    const host = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[data-assistant-host][open]'))
      .filter(dialog => dialog.isConnected && !node.contains(dialog) && dialog.matches(':modal')).at(-1);
    if (host) {
      if (node.parentNode !== host) host.append(node);
    } else restore();
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'data-assistant-host']
  });
  // A close event can precede the observer delivery; restore before focus returns.
  document.addEventListener('close', sync, true);
  sync();

  return {
    destroy() {
      destroyed = true;
      observer.disconnect();
      document.removeEventListener('close', sync, true);
      restore();
      placeholder.remove();
    }
  };
}
