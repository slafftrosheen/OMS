/**
 * Read a CSS custom property from :root with optional alpha.
 *
 * Charts (Chart.js, ApexCharts) need concrete colour strings — they can't
 * resolve `var(--brand)` directly.  This helper reads the computed value of a
 * token once and returns either the raw string or an `rgba(...)` if alpha < 1.
 *
 * Falls back to `fallback` on the server (no `document`) and when the token
 * is undefined.  Designed to be called on every render so theme switches are
 * reflected without a full page reload.
 */

export function tokenColor(name: string, fallback: string, alpha: number = 1): string {
    if (typeof document === 'undefined') return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = raw || fallback;

    if (alpha >= 1) return value;

    // Convert #rgb / #rrggbb / oklch(...) / rgb(...) into an alpha-aware form.
    if (value.startsWith('#')) {
        const hex = value.slice(1);
        const expanded = hex.length === 3
            ? hex.split('').map((c) => c + c).join('')
            : hex;
        const r = parseInt(expanded.slice(0, 2), 16);
        const g = parseInt(expanded.slice(2, 4), 16);
        const b = parseInt(expanded.slice(4, 6), 16);
        if ([r, g, b].every((n) => Number.isFinite(n))) {
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    }

    // For oklch(...) / rgb(...) / etc. fall back to color-mix() so the browser
    // does the heavy lifting.  All supported themes use modern colour spaces.
    return `color-mix(in oklab, ${value} ${Math.round(alpha * 100)}%, transparent)`;
}
