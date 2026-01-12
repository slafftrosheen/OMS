// src/lib/a11y/focusTrap.ts
export function focusTrap(node: HTMLElement) {
  const FOCUSABLE = 'a[href],button,textarea,input,select,[tabindex]:not([tabindex="-1"])';
  let prev: Element | null = null;
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el=>!el.hasAttribute('disabled'));
    if (items.length === 0) return;
    const first = items[0], last = items[items.length-1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  function mount() { prev = document.activeElement; (node.querySelector(FOCUSABLE) as HTMLElement)?.focus(); node.addEventListener('keydown', onKey); }
  function destroy() { node.removeEventListener('keydown', onKey); (prev as HTMLElement | null)?.focus?.(); }
  mount();
  return { destroy };
}
