import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');

/** Real repeat controls and native Editor. CSS/layout and browser focus are not simulated. */
async function harness(run: (h: any) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const values: Record<string, unknown> = {
    matchMedia: win.matchMedia, IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  win.Element.prototype.setPointerCapture = function () {};
  win.Element.prototype.hasPointerCapture = function () { return false; };
  win.Element.prototype.releasePointerCapture = function () {};
  win.Element.prototype.scrollIntoView = function () {};
  win.HTMLImageElement.prototype.decode = async () => {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tl = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { DrawingPanelSession } = await import('../../src/lib/components/canvas/DrawingPanelSession');
  const { RepeatGrid } = await import('../../src/lib/components/canvas/RepeatGrid');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { locale, t } = await import('svelte-i18n'); locale.set('en');
  // The Svelte host keeps its translation store subscribed. Retain that real
  // derived-store cache while mounting its React-only children in isolation.
  const stopText = t.subscribe(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil, CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
  const sourceId = tl.createShapeId();
  editor.createShape({ id: sourceId, type: 'cad-bezier', props: { fillRule: 'evenodd', contours: [{ closed: true,
    nodes: [[0, 0], [100, 0], [100, 60], [0, 60]].map(([x, y]) => nodeAt({ x, y })) }] } });
  editor.select(sourceId);
  const root = createRoot(host);
  function Scene({ active }: { active: boolean }) {
    const state = tl.useValue('panel session test', () => ({ page: editor.getCurrentPageId(), settings: cad.readCadSettings(editor), selected: editor.getSelectedShapeIds() }), [editor]);
    return <>
      <DrawingPanelSession key={`${editor.store.id}:${state.page}:cad`} active={active}>
        <RepeatGrid settings={state.settings} selected={state.selected} disabled={false} expanded/>
      </DrawingPanelSession>
      {!active && <label>Objects filter<input data-testid="other-panel" defaultValue=""/></label>}
    </>;
  }
  const render = async (active = true) => {
    await act(async () => root.render(<EditorContext.Provider value={editor}><Scene active={active}/></EditorContext.Provider>));
  };
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const get = (id: string) => { const element = host.querySelector(`[data-testid="${id}"]`) as HTMLElement; assert.ok(element, id); return element; };
  const select = async (element: HTMLSelectElement, value: string) => {
    await act(async () => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); }); await tick();
  };
  const input = async (element: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }); await tick();
  };
  const selectControl = (section: Element, label: string) => {
    const control = [...section.querySelectorAll('label')]
      .find(element => element.querySelector('span')?.textContent === label)
      ?.querySelector('select');
    assert.ok(control, label);
    return control;
  };
  const prepare = async () => {
    const section = get('drawing-repeat') as HTMLDetailsElement; section.open = true;
    await select(selectControl(section, 'Spacing'), 'offset');
    await input(section.querySelectorAll<HTMLInputElement>('input[type="number"]')[2], '3.75');
    await select(selectControl(section, 'Horizontal'), '-1');
    await act(async () => section.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick();
    assert.equal((section.querySelector('.drawing-cad-report button') as HTMLButtonElement).disabled, false);
    return section;
  };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor, tl, cad, sourceId, host, get, render, tick, select, selectControl, input, prepare, snapshot, act }); }
  finally {
    await act(async () => root.unmount()); editor.dispose(); host.remove(); stopText();
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('drawing docker continuity', () => {
  it('retains repeat drafts and an unchanged native geometry review across a panel switch', async () => {
    await harness(async ({ get, render, prepare, selectControl, snapshot, act }) => {
      await render(false);
      assert.equal(document.querySelector('[data-testid="drawing-repeat"]'), null, 'unvisited operation stays unmounted');
      await render(true);
      const before = snapshot(), section = await prepare(), review = document.querySelector('.drawing-cad-report')!;
      await render(false);
      assert.ok(section.closest('[hidden]'), 'inactive operation is excluded through native hidden semantics');
      await act(async () => get('other-panel').focus());
      assert.equal(document.activeElement, get('other-panel'));
      await render(true);
      assert.equal(get('drawing-repeat'), section);
      assert.equal(document.querySelector('.drawing-cad-report')!, review);
      assert.equal(section.querySelectorAll<HTMLInputElement>('input[type="number"]')[2].value, '3.75');
      assert.equal(selectControl(section, 'Horizontal').value, '-1');
      assert.equal((section.querySelector('.drawing-cad-report button') as HTMLButtonElement).disabled, false);
      assert.deepEqual(snapshot(), before, 'panel inspection never writes artwork');
    });
  });

  it('invalidates a retained geometry review when its source changes in another panel', async () => {
    await harness(async ({ editor, sourceId, get, render, prepare, snapshot, tick, act }) => {
      await render(); await prepare(); await render(false);
      await act(async () => editor.updateShape({ id: sourceId, type: 'cad-bezier', x: 30 })); await tick();
      const afterExternalEdit = snapshot();
      await render(true);
      const apply = get('drawing-repeat').querySelector('.drawing-cad-report button') as HTMLButtonElement;
      assert.equal(apply.disabled, true);
      assert.match(document.querySelector('.drawing-cad-report')!.textContent ?? '', /changed|prepare|again/i);
      await act(async () => apply.click());
      assert.deepEqual(snapshot(), afterExternalEdit, 'stale preview cannot apply after returning');
    });
  });

  it('clears an old page’s prepared review on a native page switch', async () => {
    await harness(async ({ editor, tl, cad, render, prepare, tick, act }) => {
      await render(); await prepare(); await render(false);
      await act(async () => {
        const page = tl.PageRecordType.createId();
        editor.createPage({ id: page, name: 'Second drawing', meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
        editor.setCurrentPage(page);
      }); await tick();
      assert.equal(document.querySelector('[data-testid="drawing-repeat"]'), null);
      await render(true);
      assert.equal(document.querySelector('.drawing-cad-report'), null);
      assert.equal(editor.getCurrentPageShapes().length, 0);
    });
  });
});
