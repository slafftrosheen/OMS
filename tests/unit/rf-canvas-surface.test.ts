import { describe, it, expect } from 'vitest';
import { resolveCanvasSurface, setCanvasSurface, pageIsDark } from '../../src/lib/components/canvas/canvas-surface';

function withCanvasSurface(run: (root: HTMLElement) => void) {
  const store = new Map<string, string>();
  const root = { dataset: { theme: 'ByPlace', place: 'office' } } as unknown as HTMLElement;
  const stubs = {
    document: { documentElement: root },
    localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) },
    window: { dispatchEvent: () => true },
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  try {
    for (const [key, value] of Object.entries(stubs)) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    run(root);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

describe('canvas surface', () => {
  it('defaults to paper in the office and blueprint on the floor / dark themes', () => withCanvasSurface(root => {
    expect(resolveCanvasSurface()).toBe('paper');
    root.dataset.place = 'floor';
    expect(resolveCanvasSurface()).toBe('blueprint');
    root.dataset.theme = 'DarkVim'; root.dataset.place = 'office';
    expect(pageIsDark(root)).toBe(true);
    root.dataset.theme = 'LightVim';
    expect(resolveCanvasSurface()).toBe('paper');
  }));
  it('remembers the user choice over the place default', () => withCanvasSurface(root => {
    setCanvasSurface('blueprint');
    expect(resolveCanvasSurface()).toBe('blueprint');
    expect(root.dataset.canvas).toBe('blueprint');
    root.dataset.place = 'floor';
    setCanvasSurface('paper');
    expect(resolveCanvasSurface()).toBe('paper');
  }));
});
