import { describe, it, expect } from 'vitest';

// Minimal DOM stubs (this repo's test runner has no jsdom).
const store = new Map<string, string>();
const root = { dataset: {} as Record<string, string | undefined> };
(globalThis as any).document = { documentElement: root };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() };
(globalThis as any).window = { dispatchEvent: () => true };
(globalThis as any).CustomEvent = class { constructor(public type: string, public init?: unknown) {} };

const { resolveCanvasSurface, setCanvasSurface, pageIsDark } = await import('../../src/lib/components/canvas/canvas-surface');
const reset = () => { store.clear(); root.dataset = { theme: 'ByPlace', place: 'office' }; };

describe('canvas surface', () => {
  it('defaults to paper in the office and blueprint on the floor / dark themes', () => {
    reset();
    expect(resolveCanvasSurface()).toBe('paper');
    root.dataset.place = 'floor';
    expect(resolveCanvasSurface()).toBe('blueprint');
    root.dataset.theme = 'DarkVim'; root.dataset.place = 'office';
    expect(pageIsDark(root as any)).toBe(true);
    root.dataset.theme = 'LightVim';
    expect(resolveCanvasSurface()).toBe('paper');
  });
  it('remembers the user choice over the place default', () => {
    reset();
    setCanvasSurface('blueprint');
    expect(resolveCanvasSurface()).toBe('blueprint');
    expect(root.dataset.canvas).toBe('blueprint');
    root.dataset.place = 'floor';
    setCanvasSurface('paper');
    expect(resolveCanvasSurface()).toBe('paper');
  });
});
