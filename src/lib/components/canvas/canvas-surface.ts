/**
 * Canvas surface — Reclame Fabriek OMS · Round 3
 * "Drafting paper" (light) is the default. "Night blueprint" (dark drawing area,
 * light panels) is one click away in the canvas View menu. Each user's choice is
 * remembered on this device. With no saved choice the surface follows the place:
 * paper in the office, blueprint on floor screens and in dark / high-contrast themes.
 * The surface only changes how the drawing is shown — exports always use the light palette.
 */
import { useSyncExternalStore } from 'react';

export type CanvasSurface = 'paper' | 'blueprint';
const KEY = 'rf.canvas.surface';
const EVENT = 'rf:canvas-surface';
let sessionSurface: CanvasSurface | null = null;

function readStored(): CanvasSurface | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'paper' || v === 'blueprint' ? v : null;
  } catch { return null; }
}

/** Dark page themes: Night shift, high contrast, or By place on a floor screen. */
export function pageIsDark(root: HTMLElement = document.documentElement): boolean {
  const theme = root.dataset.theme ?? '';
  if (!theme) return true; // brand.css default is dark
  if (theme === 'DarkVim' || theme.startsWith('HighContrast')) return true;
  return theme === 'ByPlace' && root.dataset.place === 'floor';
}

export function resolveCanvasSurface(): CanvasSurface {
  if (typeof document === 'undefined') return 'paper';
  return sessionSurface ?? readStored() ?? (pageIsDark() ? 'blueprint' : 'paper');
}

export function applyCanvasSurface(surface: CanvasSurface = resolveCanvasSurface()) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.canvas = surface;
}

export function setCanvasSurface(surface: CanvasSurface) {
  try {
    localStorage.setItem(KEY, surface);
    sessionSurface = null;
  } catch {
    sessionSurface = surface;
  }
  applyCanvasSurface(surface);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: surface }));
}

export function toggleCanvasSurface() {
  setCanvasSurface(resolveCanvasSurface() === 'blueprint' ? 'paper' : 'blueprint');
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    sessionSurface = null;
    applyCanvasSurface();
    notify();
  };
  const mo = new MutationObserver(() => { applyCanvasSurface(); notify(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-place'] });
  window.addEventListener(EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => { mo.disconnect(); window.removeEventListener(EVENT, notify); window.removeEventListener('storage', onStorage); };
}

/** React hook: current surface, re-renders on change (menu, other tab, theme/place change). */
export function useCanvasSurface(): CanvasSurface {
  return useSyncExternalStore(subscribe, resolveCanvasSurface, () => 'paper');
}

/** Watch everything that can change the surface; returns a disposer. */
export function watchCanvasSurface(onChange: (surface: CanvasSurface) => void): () => void {
  const run = () => onChange(resolveCanvasSurface());
  run();
  return subscribe(run);
}
