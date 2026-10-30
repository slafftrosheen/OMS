export interface ModalDialogOptions {
  /** Request dismissal. The caller owns open state and may refuse while busy. */
  onClose: () => void;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocus?: string;
}

const scrollLocks = new WeakMap<Document, { count: number; overflow: string }>();
const dialogStacks = new WeakMap<Document, HTMLDialogElement[]>();

function tabStops(node: HTMLDialogElement) {
  const controls = Array.from(node.querySelectorAll<HTMLElement>(
    'a[href],area[href],button,input,select,textarea,iframe,summary,audio[controls],video[controls],[tabindex],[contenteditable]'
  )).filter(element => {
    const editable = element.isContentEditable && !element.hasAttribute('tabindex') &&
      !element.parentElement?.isContentEditable;
    if ((!editable && element.tabIndex < 0) || element.matches(':disabled') ||
      element.getAttribute('aria-disabled') === 'true' || element.closest('[hidden],[inert]') ||
      element.closest('dialog') !== node || !element.getClientRects().length) return false;
    const visibility = node.ownerDocument.defaultView?.getComputedStyle(element).visibility;
    return visibility !== 'hidden' && visibility !== 'collapse';
  });
  // A radio group contributes one native Tab stop, not each arrow-key option.
  return controls.filter(element => {
    if (element.tagName !== 'INPUT') return true;
    const input = element as HTMLInputElement;
    if (input.type !== 'radio' || !input.name) return true;
    const group = controls.filter(candidate => candidate.tagName === 'INPUT' &&
      (candidate as HTMLInputElement).type === 'radio' &&
      (candidate as HTMLInputElement).name === input.name &&
      (candidate as HTMLInputElement).form === input.form) as HTMLInputElement[];
    return input === (group.find(candidate => candidate.checked) ?? group[0]);
  }).sort((left, right) => {
    const leftOrder = left.tabIndex > 0 ? left.tabIndex : Infinity;
    const rightOrder = right.tabIndex > 0 ? right.tabIndex : Infinity;
    return leftOrder === rightOrder ? 0 : leftOrder - rightOrder;
  });
}

/** Native dialogs own inertness, Escape and focus restoration. A local Tab
 * boundary also prevents cycling into browser chrome from the final control. */
export function modalDialog(node: HTMLDialogElement, initial: ModalDialogOptions) {
  let options = initial;
  const document = node.ownerDocument;
  const previous = document.activeElement as HTMLElement | null;
  let destroyed = false;
  let locked = false;

  function cancel(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (options.closeOnEscape !== false) options.onClose();
  }
  function backdrop(event: MouseEvent) {
    if (event.target === node && options.closeOnBackdrop !== false) options.onClose();
  }
  function tabBoundary(event: KeyboardEvent) {
    if (event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as Element | null;
    if (target?.closest?.('dialog') !== node) return;
    const current = dialogStacks.get(document)?.slice().reverse()
      .find(dialog => dialog.isConnected && dialog.open && dialog.matches(':modal'));
    if (current !== node) return;
    const stops = tabStops(node), first = stops[0], last = stops.at(-1);
    if (!first || !last) { event.preventDefault(); node.focus({ preventScroll: true }); return; }
    const focused = document.activeElement;
    if (!stops.includes(focused as HTMLElement) || (event.shiftKey ? focused === first : focused === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  }
  node.addEventListener('cancel', cancel);
  node.addEventListener('click', backdrop);
  node.addEventListener('keydown', tabBoundary);

  // Actions run before every child binding is ready. Do not schedule a timer
  // which could focus a removed or subsequently opened dialog.
  queueMicrotask(() => {
    if (destroyed || !node.isConnected) return;
    if (!node.open) node.showModal();
    const stack = dialogStacks.get(document) ?? [];
    stack.push(node); dialogStacks.set(document, stack);
    const lock = scrollLocks.get(document);
    if (lock) lock.count++;
    else {
      scrollLocks.set(document, { count: 1, overflow: document.body.style.overflow });
      document.body.style.overflow = 'hidden';
    }
    locked = true;
    if (options.initialFocus) node.querySelector<HTMLElement>(options.initialFocus)?.focus();
  });

  return {
    update(next: ModalDialogOptions) { options = next; },
    destroy() {
      destroyed = true;
      node.removeEventListener('cancel', cancel);
      node.removeEventListener('click', backdrop);
      node.removeEventListener('keydown', tabBoundary);
      const stack = dialogStacks.get(document);
      if (stack) {
        const index = stack.indexOf(node);
        if (index >= 0) stack.splice(index, 1);
        if (!stack.length) dialogStacks.delete(document);
      }
      if (node.open) node.close();
      if (locked) {
        const lock = scrollLocks.get(document);
        if (lock && --lock.count === 0) {
          document.body.style.overflow = lock.overflow;
          scrollLocks.delete(document);
        }
      }
      // close() normally restores focus itself. This fallback covers removal
      // during a parent teardown without stealing focus from another dialog.
      if (previous?.isConnected && (document.activeElement === document.body || document.activeElement === node)) {
        previous.focus({ preventScroll: true });
      }
    }
  };
}
