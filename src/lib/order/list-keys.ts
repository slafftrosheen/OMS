/** Round 6 · keyboard on the orders list: J / K move, Enter or O opens, E expands, / searches.
 * Pure; ignores keys while the user types or holds a modifier. */
export type ListKeyAction = { type: 'move'; delta: 1 | -1 } | { type: 'open' } | { type: 'expand' } | { type: 'search' } | null;

interface KeyLike { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: EventTarget | null; defaultPrevented?: boolean }

export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null | undefined;
  if (!el || typeof el !== 'object' || !('tagName' in el)) return false;
  const tag = String(el.tagName).toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true ||
    (typeof el.closest === 'function' && !!el.closest('dialog[open], [role="dialog"], .tl-container'));
}

export function listKeyAction(event: KeyLike, hasFocus: boolean): ListKeyAction {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return null;
  switch (event.key) {
    case 'j': case 'J': return { type: 'move', delta: 1 };
    case 'k': case 'K': return { type: 'move', delta: -1 };
    case '/': return { type: 'search' };
    case 'Enter': case 'o': case 'O':
      // Enter on a focused link or button already does its own thing.
      if (event.key === 'Enter' && (event.target as HTMLElement | null)?.closest?.('a, button')) return null;
      return hasFocus ? { type: 'open' } : null;
    case 'e': case 'E': return hasFocus ? { type: 'expand' } : null;
    default: return null;
  }
}

/** -1 means nothing highlighted; the first J lands on row 0, the first K on the last row. */
export function nextListIndex(current: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  if (current < 0 || current >= length) return delta > 0 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, current + delta));
}
