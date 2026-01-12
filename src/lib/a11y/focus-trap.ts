export function trap(node: HTMLElement) {
  const focusable = () =>
    Array.from(
      node.querySelectorAll<HTMLElement>(
        'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled'));

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const els = focusable();
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }

  node.addEventListener('keydown', onKey);
  return {
    destroy() {
      node.removeEventListener('keydown', onKey);
    }
  };
}
