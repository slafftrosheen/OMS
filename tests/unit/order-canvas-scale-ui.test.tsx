import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { locale } from 'svelte-i18n';
import { DrawingGrid } from '../../src/lib/components/canvas/DrawingGrid';
import { defaultOrderCanvasScale } from '../../src/lib/components/canvas/shapes/form-shapes/form-layout';
import { ORDER_CANVAS_SCALE_META_KEY } from '../../src/lib/order/canvas-layout-scale';
import { OrderFilePocketOverlays, OrderFilePocketsProvider } from '../../src/lib/components/canvas/OrderFilePockets';
import { EditorContext } from '../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs';
import { ScaledCanvasForm } from '../../src/lib/components/canvas/shapes/form-shapes/ScaledCanvasForm';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel } from '../../src/lib/components/canvas/cad-settings';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');

describe('Order canvas physical scale rendering', () => {
  it('scales pocket headings and upload controls with the frame while preserving their natural layout', () => {
    locale.set('en');
    const scale = defaultOrderCanvasScale();
    const frame = { id: 'shape:laser', type: 'frame', meta: { omsFilePocket: 'laser', [ORDER_CANVAS_SCALE_META_KEY]: scale },
      props: { w: 800 * scale, h: 500 * scale, name: 'Laser (DXF)' } };
    const editor: any = {
      getCurrentPageShapesSorted: () => [frame],
      getShapePageTransform: () => ({ toCssString: () => 'matrix(1,0,0,1,0,0)' }),
      getInstanceState: () => ({ isReadonly: false }), isShapeOrAncestorLocked: () => false,
    };
    const markup = renderToStaticMarkup(<EditorContext.Provider value={editor}>
      <OrderFilePocketsProvider local orderId="local"><OrderFilePocketOverlays /></OrderFilePocketsProvider>
    </EditorContext.Provider>);
    const dom = new JSDOM(markup);
    try {
      const section = dom.window.document.querySelector('[data-testid="production-pocket-laser"]') as HTMLElement;
      assert.ok(section);
      const holder = section.parentElement!;
      // This JSDOM version drops the complete CSSOM declaration when a nested
      // CSS variable is present. Inspect the actual rendered style attribute.
      const style = Object.fromEntries(holder.getAttribute('style')!.split(';').map(rule => {
        const colon = rule.indexOf(':'); return [rule.slice(0, colon), rule.slice(colon + 1)];
      }));
      assert.equal(Number.parseFloat(style.width), 776);
      assert.equal(Number.parseFloat(style.left), 12 * scale);
      assert.equal(Number.parseFloat(style.top), 12 * scale);
      assert.equal(style.transform, `scale(${scale})`);
      assert.equal(section.style.fontSize, '13px');
      assert.ok(section.querySelector('button'));
    } finally { dom.window.close(); }
  });

  it('renders two bounded grid tiles at overview zoom, even below native whiteboard grid levels', () => {
    const markup = renderToStaticMarkup(<DrawingGrid x={-231.5} y={471.25} z={.00005} size={10 / (25.4 / 96)} />);
    const dom = new JSDOM(markup);
    try {
      const tiles = Array.from(dom.window.document.querySelectorAll('pattern')) as Element[];
      assert.equal(tiles.length, 2);
      for (const tile of tiles) assert.ok(Number(tile.getAttribute('width')) >= 12);
      assert.equal(dom.window.document.querySelectorAll('.rf-grid-major').length, 1);
      assert.equal(dom.window.document.querySelectorAll('.rf-grid-minor').length, 1);
      assert.equal(markup.includes('NaN'), false);
    } finally { dom.window.close(); }
  });

  it('measures form height in natural layout pixels at every calibration and protects the page envelope', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
    const win = dom.window;
    const channels: MessageChannel[] = [], NativeMessageChannel = globalThis.MessageChannel;
    const observers = new Set<{ callback: () => void; element?: Element }>();
    const globals: Record<string, unknown> = {
      window: win, document: win.document, navigator: win.navigator, Element: win.Element, HTMLElement: win.HTMLElement,
      Node: win.Node, MutationObserver: win.MutationObserver,
      MessageChannel: class extends NativeMessageChannel { constructor() { super(); channels.push(this); } },
      requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
      IS_REACT_ACT_ENVIRONMENT: true,
      ResizeObserver: class {
        element?: Element;
        constructor(public callback: () => void) { observers.add(this); }
        observe(element: Element) { this.element = element; }
        disconnect() { observers.delete(this); }
      },
    };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const { createRoot } = await import('react-dom/client');
    const { act } = React;
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    let current: any, measuredHeight = 913, writes = 0, readonly = false;
    const editor: any = {
      getShape: () => current, getInstanceState: () => ({ isReadonly: readonly }), isShapeOrAncestorLocked: () => false,
      getShapePageTransform: () => ({ applyToPoint: (p: { x: number; y: number }) => ({ x: p.x + current.x, y: p.y + current.y }) }),
      run: (fn: () => void) => fn(), updateShape: (patch: any) => { writes++; current = { ...current, props: { ...current.props, ...patch.props } }; },
    };
    const resize = async () => { await act(async () => { for (const observer of observers) observer.callback(); }); };
    try {
      for (const type of ['profile-7st', 'order-details', 'order-address']) for (const calibration of [1, 1000, 10000]) {
        const settings = { ...DEFAULT_CAD_SETTINGS, scale: calibration }, scale = defaultOrderCanvasScale(settings);
        const width = type === 'profile-7st' ? 1800 : 880;
        current = { id: `shape:${type}-${calibration}`, type, x: 0, y: 0, props: { w: width * scale, h: 900 * scale } };
        writes = 0; readonly = false; measuredHeight = 913;
        await act(async () => root.render(<ScaledCanvasForm shape={current} editor={editor}><div>Form contents</div></ScaledCanvasForm>));
        assert.equal(observers.size, 1);
        const observer = [...observers][0];
        Object.defineProperty(observer.element, 'offsetHeight', { configurable: true, get: () => measuredHeight });
        await resize();
        assert.ok(Math.abs(current.props.h - 913 * scale) < 1e-8, `${type} at 1:${calibration}`);
        assert.ok(Math.abs(current.props.h * cadMmPerPixel(settings) - 913 * 6000 / 1800) < 1e-7);
        assert.equal(writes, 1);
        measuredHeight = 913.1; await resize();
        assert.equal(writes, 1, 'one natural pixel is the observer tolerance');
        measuredHeight = 0; await resize();
        assert.ok(Math.abs(current.props.h - 80 * scale) < 1e-8, 'minimum also scales with the layout');
        const before = current.props.h;
        readonly = true; measuredHeight = 1200; await resize();
        assert.equal(current.props.h, before);
        readonly = false; current.y = 1_000_000 - before; await resize();
        assert.equal(current.props.h, before, 'auto-height cannot extend past the page envelope');
      }
    } finally {
      await act(async () => root.unmount()); channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
      for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  });
});
