import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

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
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'DOMParser', 'MutationObserver', 'Image', 'localStorage'])
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
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS } } });
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
  try { await run({ editor, tl, cad, sourceId, host, root, EditorContext, get, render, tick, select, selectControl, input, prepare, snapshot, act }); }
  finally {
    await act(async () => root.unmount()); editor.dispose(); host.remove(); stopText();
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('drawing docker continuity', () => {
  it('edits real dimension offset, precision and markers in drawing units with one undo', async () => {
    await harness(async ({ editor, cad, root, EditorContext, act, get, tick, select, input, snapshot, sourceId }: any) => {
      const React = await import('react');
      const { CadDimensionControls } = await import('../../src/lib/components/canvas/CadDimensionControls');
      const { createCadDimension } = await import('../../src/lib/components/canvas/cad-geometry');
      const settings = { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 5 };
      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: settings } });
        assert.equal(createCadDimension(editor, settings, 'horizontal'), true);
        root.render(<EditorContext.Provider value={editor}><CadDimensionControls settings={settings}/></EditorContext.Provider>);
      });
      const before = snapshot(), source = structuredClone(editor.getShape(sourceId));
      await input(get('drawing-dimension-offset'), '-2');
      await input(get('drawing-dimension-size'), '75');
      await select(get('drawing-dimension-precision'), '4');
      await select(get('drawing-dimension-markers'), 'arrow');
      const apply = get('drawing-dimension-apply') as HTMLButtonElement;
      assert.equal(apply.disabled, false);
      await act(async () => apply.click()); await tick();
      const dimension = editor.getOnlySelectedShape();
      assert.ok(Math.abs(cad.canvasLengthToUnit(dimension.props.offset, settings) + 2) < 1e-10);
      assert.equal(dimension.props.decorationScale, .75); assert.equal(dimension.props.precision, 4); assert.equal(dimension.props.marker, 'arrow');
      assert.deepEqual(editor.getShape(sourceId), source); assert.match(get('drawing-dimension-settings').textContent, /Dimension settings applied/);
      await act(async () => editor.undo()); await tick(); assert.deepEqual(snapshot(), before);
    });
  });

  it('retains dimension drafts while hidden and blocks stale, hidden and read-only submissions', async () => {
    await harness(async ({ editor, cad, root, EditorContext, act, get, tick, select, snapshot, sourceId }: any) => {
      const React = await import('react');
      const { CadDimensionControls } = await import('../../src/lib/components/canvas/CadDimensionControls');
      const { DrawingPanelSession } = await import('../../src/lib/components/canvas/DrawingPanelSession');
      const { createCadDimension } = await import('../../src/lib/components/canvas/cad-geometry');
      await act(async () => { assert.equal(createCadDimension(editor, cad.DEFAULT_CAD_SETTINGS, 'horizontal'), true); });
      const render = async (active: boolean) => {
        await act(async () => root.render(<EditorContext.Provider value={editor}><DrawingPanelSession active={active}>
          <CadDimensionControls settings={cad.DEFAULT_CAD_SETTINGS}/>
        </DrawingPanelSession></EditorContext.Provider>));
      };
      const submit = async () => {
        await act(async () => get('drawing-dimension-settings').querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick();
      };
      await render(true); await select(get('drawing-dimension-precision'), '3'); await render(false);
      const beforeHiddenSubmit = snapshot(); await submit(); assert.deepEqual(snapshot(), beforeHiddenSubmit);
      await act(async () => editor.updateShape({ id: sourceId, x: 40 })); await tick();
      await render(true);
      assert.equal((get('drawing-dimension-precision') as HTMLSelectElement).value, '3');
      assert.equal((get('drawing-dimension-apply') as HTMLButtonElement).disabled, true);
      assert.match(get('drawing-dimension-settings').textContent, /source geometry or document units changed/);
      const stale = snapshot(); await submit(); assert.deepEqual(snapshot(), stale);
      await act(async () => (get('drawing-dimension-reload') as HTMLButtonElement).click()); await tick();
      await select(get('drawing-dimension-precision'), '5');
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal((get('drawing-dimension-settings').querySelector('fieldset') as HTMLFieldSetElement).disabled, true);
      const readonly = snapshot(); await submit(); assert.deepEqual(snapshot(), readonly);
    });
  });

  it('exposes all six measurement kinds and an independent angle construction action', async () => {
    await harness(async ({ editor, cad, root, EditorContext, act, get, host }: any) => {
      const React = await import('react');
      const { MeasurePanel } = await import('../../src/lib/components/canvas/WorkbenchPanels');
      const tools: string[] = [];
      await act(async () => {
        editor.createShape({ id: 'shape:corner-measurement', type: 'cad-path', props: { closed: false,
          points: [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }] } });
        editor.select('shape:corner-measurement');
        root.render(<EditorContext.Provider value={editor}><MeasurePanel settings={cad.DEFAULT_CAD_SETTINGS}
          onTool={tool => tools.push(tool)} onDocument={() => {}}/></EditorContext.Provider>);
      });
      const select = get('drawing-dimension-links').querySelector('select') as HTMLSelectElement;
      assert.deepEqual([...select.options].map(option => option.value), ['horizontal', 'vertical', 'aligned', 'angular', 'radius', 'diameter']);
      assert.equal([...select.options].find(option => option.value === 'angular')!.disabled, false);
      assert.match(host.textContent, /Angle between rays90\.00°/);
      const angular = [...host.querySelectorAll('button')].find((button: any) => button.textContent === 'Draw angle dimension') as HTMLButtonElement;
      assert.ok(angular && !angular.disabled); await act(async () => angular.click()); assert.deepEqual(tools, ['cad-dimension-angular']);
    });
  });

  it('reviews midline pairing in the real docker and applies editable curves in one undo', async () => {
    await harness(async ({ editor, cad, root, EditorContext, act, get, tick, select, snapshot }: any) => {
      const React = await import('react');
      const { CadAdvancedPanel } = await import('../../src/lib/components/canvas/CadAdvancedPanel');
      const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
      const { buildCadDxf } = await import('../../src/lib/components/canvas/cad-dxf');
      const settings = { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 10 };
      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: settings } });
        editor.createShapes([
          { id: 'shape:midline-a', type: 'cad-bezier', x: 40, y: 50, meta: { name: 'Upper rail' }, props: { contours: [{ closed: false, nodes: [
            { ...nodeAt({ x: 0, y: 0 }), outX: 20, outY: -50 }, { ...nodeAt({ x: 120, y: 0 }), inX: -20, inY: -50 },
          ] }] } },
          { id: 'shape:midline-b', type: 'cad-bezier', x: 40, y: 150, meta: { name: 'Lower rail' }, props: { contours: [{ closed: false, nodes: [
            { ...nodeAt({ x: 0, y: 0 }), outX: 20, outY: -50 },
            { ...nodeAt({ x: 60, y: -37.5 }), inX: -20, outX: 20, mode: 'smooth' },
            { ...nodeAt({ x: 120, y: 0 }), inX: -20, inY: -50 },
          ] }] } },
        ]);
        editor.select('shape:midline-a', 'shape:midline-b'); editor.mark('before-midline');
        root.render(<EditorContext.Provider value={editor}><CadAdvancedPanel settings={settings} task="edit" focusRequest={{ section: 'midline', sequence: 1 }}/></EditorContext.Provider>);
      });
      const before = snapshot(), section = get('drawing-cad-shaping');
      const prepare = async () => {
        await act(async () => section.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        await tick();
      };
      assert.equal((get('drawing-midline-pairing') as HTMLSelectElement).value, 'auto');
      await prepare();
      assert.equal((get('drawing-cad-apply-plan') as HTMLButtonElement).disabled, false);
      assert.match(section.textContent, /fitted to editable Bézier curves/);
      await select(get('drawing-midline-pairing'), 'same');
      assert.equal((get('drawing-cad-apply-plan') as HTMLButtonElement).disabled, true, 'changed correspondence must invalidate the prior preview');
      await select(get('drawing-midline-matching'), 'length'); await prepare();
      await act(async () => (get('drawing-cad-apply-plan') as HTMLButtonElement).click());
      const result = editor.getOnlySelectedShape();
      assert.equal(result.type, 'cad-bezier');
      assert.equal(result.props.contours[0].closed, false);
      assert.ok(result.props.contours[0].nodes.some((node: any) => Math.hypot(node.inX, node.inY, node.outX, node.outY) > 0));
      assert.ok(editor.getShape('shape:midline-a') && editor.getShape('shape:midline-b'));
      const dxf = buildCadDxf(editor, 'selected', settings);
      assert.equal(dxf.omitted.length, 0); assert.match(dxf.text, /SPLINE/);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('preserves queued midline options across docker switches and blocks a stale read-only apply', async () => {
    await harness(async ({ editor, cad, root, EditorContext, act, get, tick, select, snapshot }: any) => {
      const React = await import('react');
      const { CadAdvancedPanel } = await import('../../src/lib/components/canvas/CadAdvancedPanel');
      const { DrawingPanelSession } = await import('../../src/lib/components/canvas/DrawingPanelSession');
      await act(async () => {
        editor.createShapes([
          { id: 'shape:rail-a', type: 'cad-path', props: { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } },
          { id: 'shape:rail-b', type: 'cad-path', y: 100, props: { closed: false, points: [{ x: 20, y: 0 }, { x: 140, y: 20 }] } },
        ]); editor.select('shape:rail-a', 'shape:rail-b');
      });
      const render = async (active: boolean) => {
        await act(async () => root.render(<EditorContext.Provider value={editor}><DrawingPanelSession active={active}>
          <CadAdvancedPanel settings={cad.DEFAULT_CAD_SETTINGS} task="edit" focusRequest={{ section: 'midline', sequence: 1 }}/>
        </DrawingPanelSession></EditorContext.Provider>));
      };
      await render(true); await select(get('drawing-midline-pairing'), 'reverse'); await select(get('drawing-midline-matching'), 'length');
      await render(false); await render(true);
      assert.equal((get('drawing-midline-pairing') as HTMLSelectElement).value, 'reverse');
      assert.equal((get('drawing-midline-matching') as HTMLSelectElement).value, 'length');
      await act(async () => get('drawing-cad-shaping').querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick();
      const before = snapshot();
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal((get('drawing-cad-apply-plan') as HTMLButtonElement).disabled, true);
      await act(async () => (get('drawing-cad-apply-plan') as HTMLButtonElement).click());
      assert.deepEqual(snapshot(), before);
    });
  });

  it('applies an exact millimetre outline preset in an inch-calibrated drawing', async () => {
    await harness(async ({ editor, cad, root, EditorContext, act, get, select }: any) => {
      const React = await import('react');
      const { OutlinePenPanel } = await import('../../src/lib/components/canvas/OutlinePenPanel');
      const { cadRevision } = await import('../../src/lib/components/canvas/cad-plans');
      const settings = { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 5 };
      await act(async () => root.render(<EditorContext.Provider value={editor}>
        <OutlinePenPanel settings={settings} revision={cadRevision(editor)} disabled={false} />
      </EditorContext.Provider>));
      const panel = get('drawing-outline-pen');
      const width = panel.querySelector('[aria-label="Width"]') as HTMLInputElement;
      await select(panel.querySelector('[aria-label="Standard widths"]'), '0.5');
      assert.ok(Math.abs(Number(width.value) * 25.4 - 0.5) < 1e-10);
      const action = [...panel.querySelectorAll('button')].find(item => (item as HTMLElement).textContent === 'Apply width') as HTMLButtonElement;
      assert.ok(action && !action.disabled);
      await act(async () => action.click());
      const paint = editor.getOnlySelectedShape().meta.omsVectorPaint;
      assert.ok(Math.abs(paint.strokeWidth * cad.cadMmPerPixel(settings) - 0.5) < 1e-10);
    });
  });

  it('keeps invalid queued artwork active and advances after a skip or successful SVG and DXF import', async () => {
    await harness(async ({ editor, cad, host, root, EditorContext, act, get, tick }: any) => {
      const React = await import('react');
      const { CadAdvancedPanel } = await import('../../src/lib/components/canvas/CadAdvancedPanel');
      const initial = [
        { sequence: 1, file: new File(['broken'], 'broken.svg') },
        { sequence: 2, file: new File(['<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm"><rect width="100%" height="100%"/></svg>'], 'panel.svg') },
        { sequence: 3, file: new File([await readFile('tests/fixtures/cad-splines/mixed-ascii.dxf', 'utf8')], 'cut.dxf') },
      ];
      const completed: Array<[number, boolean]> = [];
      function ImportQueue() {
        const [entries, setEntries] = React.useState(initial);
        return <CadAdvancedPanel settings={cad.DEFAULT_CAD_SETTINGS} task="files" importQueue={{ entries, finish: (sequence, imported) => {
          completed.push([sequence, imported]);
          setEntries(current => current.slice(1));
        } }} />;
      }
      const click = async (panel: string, button: string) => {
        const control = [...get(panel).querySelectorAll('button')].find(item => (item as HTMLElement).textContent === button) as HTMLButtonElement | undefined;
        assert.ok(control && !control.disabled, button);
        await act(async () => control.click());
        await tick();
      };
      await act(async () => root.render(<EditorContext.Provider value={editor}><ImportQueue /></EditorContext.Provider>));
      assert.match(get('drawing-import-queue').textContent, /Drawing import queue · 3/);
      await click('vector-import', 'Prepare preview');
      assert.deepEqual(completed, []);
      assert.match(get('vector-import').textContent, /broken\.svg/);
      await click('vector-import', 'Skip this file');
      assert.match(get('vector-import').textContent, /panel\.svg/);
      await click('vector-import', 'Prepare preview');
      await act(async () => (get('vector-apply') as HTMLButtonElement).click());
      assert.match(get('drawing-cad-import').textContent, /cut\.dxf/);
      assert.equal(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'cad-bezier').length, 2);
      await click('drawing-cad-import', 'Prepare preview');
      const acknowledge = get('drawing-cad-import').querySelector('.drawing-cad-report input[type=checkbox]') as HTMLInputElement | null;
      if (acknowledge) await act(async () => acknowledge.click());
      const applyDxf = get('drawing-cad-apply-plan') as HTMLButtonElement;
      assert.equal(applyDxf.disabled, false);
      await act(async () => applyDxf.click());
      assert.equal(host.querySelector('[data-testid="drawing-import-queue"]'), null);
      assert.deepEqual(completed, [[1, false], [2, true], [3, true]]);
      assert.ok(editor.getCurrentPageShapes().length > 2);
    });
  });

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
      assert.equal((section as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="number"]')[2].value, '3.75');
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
