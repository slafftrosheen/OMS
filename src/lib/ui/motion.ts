/** Réclame Fabriek motion helpers (Round 5).
 * Decisive, no bounce; every helper is a no-op under reduced motion. */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.motion === 'off';
}

/** Routes whose pages own heavy canvases or live media: no page cross-fade there. */
const STILL_ROUTES = ['/toolkit/canvas', '/orders/new', '/chat'];
export function wantsPageTransition(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to || from === to) return false;
  const still = (path: string) => STILL_ROUTES.some(r => path === r || path.startsWith(r + '/')) || /\/orders\/[^/]+\/edit(\/|$)/.test(path);
  return !still(from) && !still(to);
}

/** Direction hint for the page slide: deeper paths move forward, shallower back. */
export function transitionDirection(from: string, to: string): 'forward' | 'back' | 'swap' {
  const depth = (p: string) => p.split('/').filter(Boolean).length;
  return depth(to) > depth(from) ? 'forward' : depth(to) < depth(from) ? 'back' : 'swap';
}

/** Parse a displayed KPI value ("1 240", "86%", "€3.5k") into number + affixes. */
export function parseCount(text: string): { prefix: string; value: number; suffix: string; decimals: number; group: string } | null {
  const match = /^(\D*?)(-?\d{1,3}(?:([ ,\u00a0\u202f])\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)(\D*)$/.exec(text.trim());
  if (!match) return null;
  const group = match[3] ?? '';
  let digits = match[2];
  if (group) digits = digits.split(group).join('');
  const decimalMark = /[.,](\d+)$/.exec(digits);
  const decimals = decimalMark ? decimalMark[1].length : 0;
  const value = Number(digits.replace(',', '.'));
  return Number.isFinite(value) ? { prefix: match[1], value, suffix: match[4], decimals, group } : null;
}

export function formatCount(parts: NonNullable<ReturnType<typeof parseCount>>, value: number): string {
  let body = Math.abs(value).toFixed(parts.decimals);
  if (parts.group) {
    const [int, frac] = body.split('.');
    body = int.replace(/\B(?=(\d{3})+(?!\d))/g, parts.group) + (frac ? '.' + frac : '');
  }
  return `${parts.prefix}${value < 0 ? '-' : ''}${body}${parts.suffix}`;
}

/** Svelte action: counts a numeric text up from zero when it first appears
 * and from the previous value when it changes. Text stays correct for AT. */
export function countUp(node: HTMLElement, text: string | number) {
  let current = String(text ?? '');
  let frame = 0;
  let shown: number | null = null;
  function run(target: string) {
    cancelAnimationFrame(frame);
    const parts = parseCount(target);
    if (!parts || prefersReducedMotion() || Math.abs(parts.value) > 1e9) { node.textContent = target; shown = parts?.value ?? null; return; }
    const from = shown ?? 0, to = parts.value, duration = Math.min(900, 300 + Math.abs(to - from) * 4);
    const start = performance.now();
    node.setAttribute('aria-label', target);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
      node.textContent = formatCount(parts, from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else { node.textContent = target; node.removeAttribute('aria-label'); shown = to; }
    };
    frame = requestAnimationFrame(step);
  }
  run(current);
  return {
    update(next: string | number) { const value = String(next ?? ''); if (value !== current) { current = value; run(value); } },
    destroy() { cancelAnimationFrame(frame); }
  };
}

/** Svelte action: numbers direct children with --i so .rf-stagger can cascade them. */
export function stagger(node: HTMLElement, max = 12) {
  const apply = () => Array.from(node.children).forEach((child, i) => (child as HTMLElement).style.setProperty('--i', String(Math.min(i, max))));
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(node, { childList: true });
  return { destroy() { observer.disconnect(); } };
}

/** Round 6 · the one shared element that morphs between the order list and the order page. */
export const ORDER_MORPH_NAME = 'rf-order-title';
/** Click handler helper: names the clicked row's title so it flies into the order page header.
 * Any earlier marked element is cleared first, so the name stays unique on the page. */
export function markOrderMorph(source: Element | null, selector = '.title-cell'): boolean {
  if (typeof document === 'undefined' || !source || prefersReducedMotion()) return false;
  document.querySelectorAll<HTMLElement>('[data-rf-morph]').forEach(el => { el.style.removeProperty('view-transition-name'); delete el.dataset.rfMorph; });
  const target = source.closest('tr')?.querySelector<HTMLElement>(selector) ?? null;
  if (!target) return false;
  target.style.setProperty('view-transition-name', ORDER_MORPH_NAME);
  target.dataset.rfMorph = '1';
  return true;
}
