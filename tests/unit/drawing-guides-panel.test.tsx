import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');

function environment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeMessageChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  const values: Record<string, unknown> = {
    MessageChannel: class extends NativeMessageChannel { constructor() { super(); channels.push(this); } },
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, matchMedia: media, IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage']) {
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  }
  win.HTMLElement.prototype.setPointerCapture = () => {};
  win.HTMLElement.prototype.releasePointerCapture = () => {};
  win.HTMLElement.prototype.hasPointerCapture = () => false;
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return { win, restore() {
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  } };
}

async function harness(run: (h: any) => Promise<void>) {
  const env = environment();
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tldraw = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { DrawingGuidesPanel } = await import('../../src/lib/components/canvas/DrawingGuidesPanel');
  const guides = await import('../../src/lib/components/canvas/drawing-guides');
  const settings = await import('../../src/lib/components/canvas/cad-settings');
  const { CadCircleTool } = await import('../../src/lib/components/canvas/CadTwoPointTool');
  const { CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { hasCanvasDraft } = await import('../../src/lib/components/canvas/canvas-document');
  const { locale } = await import('svelte-i18n'); locale.set('en');
  const container = document.createElement('div'); document.body.append(container);
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils: [...tldraw.defaultShapeUtils, CadEllipseShapeUtil], bindingUtils: tldraw.defaultBindingUtils }),
    shapeUtils: [...tldraw.defaultShapeUtils, CadEllipseShapeUtil], bindingUtils: tldraw.defaultBindingUtils,
    tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools, CadCircleTool], getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(0, 0, 800, 600)); editor.updateInstanceState({ isFocused: true });
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...settings.DEFAULT_CAD_SETTINGS, originX: 100, originY: 200 } } });
  const root = createRoot(container); let focusRequest = 0, documentRequests = 0;
  function Panel() {
    const calibration = tldraw.useValue('guide test calibration', () => settings.readCadSettings(editor), [editor]);
    return <EditorContext.Provider value={editor}><DrawingGuidesPanel settings={calibration} focusRequest={focusRequest}
      onDocument={() => { documentRequests++; }} renderAlignment={guide => <div data-testid="alignment-current">{guide?.id ?? 'none'}</div>} /></EditorContext.Provider>;
  }
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  const view = async () => { await act(async () => root.render(<Panel />)); await tick(); };
  const get = (testId: string) => { const node = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement; assert.ok(node, testId); return node; };
  const input = async (testId: string, value: string) => {
    const element = get(testId) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }); await tick();
  };
  const select = async (testId: string, value: string) => {
    await act(async () => { const element = get(testId) as HTMLSelectElement; element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); }); await tick();
  };
  const click = async (testId: string) => { await act(async () => get(testId).click()); await tick(); };
  const change = async (operation: any) => { await act(async () => assert.equal(guides.applyDrawingGuideChange(editor, guides.prepareDrawingGuideChange(editor, operation)), true)); await tick(); };
  const pointer = async (name: string, point: { x: number; y: number }, extra = {}) => {
    await act(async () => editor.dispatch({ type: 'pointer', name, point: { ...point, z: .5 }, target: 'canvas', button: 0, pointerId: 1, isPen: false,
      shiftKey: false, ctrlKey: false, altKey: false, ...extra } as any)); await tick();
  };
  try {
    await view();
    await run({ editor, env, container, guides, settings, locale, get, input, select, click, change, tick, act, pointer, hasCanvasDraft,
      focus: async () => { focusRequest++; await view(); }, documentRequests: () => documentRequests });
  } finally { await act(async () => root.unmount()); editor.dispose(); container.remove(); env.restore(); }
}

describe('Guidelines docker with a real React and tldraw editor', () => {
  it('shows physical angle-bisector readouts and creates both from selected native lines in one undo step', async () => {
    await harness(async ({ editor, guides, settings, container, get, click, act, tick }) => {
      const points = { a: { id: 'a', index: 'a1', x: 0, y: 0 }, b: { id: 'b', index: 'a2', x: 100, y: 0 } };
      await act(async () => {
        editor.createShapes([
          { id: 'shape:a', type: 'line', x: 120, y: 170, props: { spline: 'line', points } },
          { id: 'shape:b', type: 'line', x: 120, y: 170, rotation: -Math.PI / 3, props: { spline: 'line', points } },
        ]);
        editor.select('shape:a', 'shape:b');
        (container.querySelector('.drawing-guide-construction') as HTMLDetailsElement).open = true;
      }); await tick();
      const originals = structuredClone(editor.getSelectedShapes());
      assert.equal(get('drawing-guide-bisector-artwork-add').matches(':disabled'), false);
      assert.equal(get('drawing-guide-bisector-artwork-angles').textContent, 'Angles between sources: 60° / 120°');
      assert.equal(get('drawing-guide-bisector-artwork-directions').textContent, 'Bisector directions: 30° / 120°');
      assert.equal(get('drawing-guide-bisector-artwork-intersection').textContent, 'Intersection: X 5.29166666667 / Y 7.9375 mm');
      assert.match(container.textContent ?? '', /extended as infinite straight lines/);
      await act(async () => settings.writeCadSettings(editor, { ...settings.readCadSettings(editor), unit: 'in' })); await tick();
      assert.equal(get('drawing-guide-bisector-artwork-intersection').textContent, 'Intersection: X 0.208333333333 / Y 0.3125 in');
      await click('drawing-guide-bisector-artwork-add');
      const added = guides.readDrawingGuides(editor).guides;
      assert.equal(added.length, 2);
      assert.deepEqual(added.map((guide: any) => Number(guide.angle.toFixed(8))), [30, 120]);
      for (const guide of added) {
        assert.ok(Math.abs(guide.pivot.x - 120) < 1e-8); assert.ok(Math.abs(guide.pivot.y - 170) < 1e-8);
      }
      assert.deepEqual(editor.getSelectedShapes(), originals);
      await act(async () => editor.undo()); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      assert.deepEqual(editor.getSelectedShapeIds(), ['shape:a', 'shape:b']);
      await act(async () => editor.redo()); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 2);
      assert.deepEqual(editor.getSelectedShapes(), originals);
    });
  });

  it('labels right-angle guide solutions A/B, reads hidden locked sources and honors editing guards', async () => {
    await harness(async ({ editor, guides, container, locale, get, click, select, change, act, tick }) => {
      await change({ kind: 'add-many', guides: [
        { id: 'guide:x', axis: 'x', position: 200 }, { id: 'guide:y', axis: 'y', position: 100 },
      ] });
      await change({ kind: 'guide-visible', id: 'guide:x', visible: false });
      await change({ kind: 'guide-locked', id: 'guide:x', locked: true });
      await change({ kind: 'guide-locked', id: 'guide:y', locked: true });
      const originals = structuredClone(guides.readDrawingGuides(editor).guides);
      assert.equal(get('drawing-guide-bisector-guides-angles').textContent, 'Angles between sources: 90° / 90°');
      const choices = () => Array.from((get('drawing-guide-bisector-guides-choice') as HTMLSelectElement).options).map(option => option.textContent);
      assert.deepEqual(choices(), ['Bisector A', 'Bisector B', 'Both bisectors']);
      assert.equal(get('drawing-guide-bisector-guides-add').matches(':disabled'), false);
      await act(async () => locale.set('ru')); await tick(); assert.deepEqual(choices(), ['Биссектриса A', 'Биссектриса B', 'Обе биссектрисы']);
      await act(async () => locale.set('lv')); await tick(); assert.deepEqual(choices(), ['Bisektrise A', 'Bisektrise B', 'Abas bisektrises']);
      await act(async () => locale.set('en')); await tick();
      await select('drawing-guide-bisector-guides-choice', 'second');
      assert.equal(get('drawing-guide-bisector-guides-directions').textContent, 'Direction: 135°');
      await click('drawing-guide-bisector-guides-add');
      const added = guides.readDrawingGuides(editor).guides;
      assert.equal(added.length, 3); assert.equal(added[2].angle, 135);
      assert.deepEqual(added.slice(0, 2), originals);
      await act(async () => editor.undo()); await tick();
      assert.deepEqual(guides.readDrawingGuides(editor).guides, originals);
      await select('drawing-guides-list', 'guide:y');
      await change({ kind: 'settings', locked: true });
      assert.equal(get('drawing-guide-bisector-guides-add').matches(':disabled'), true);
      await click('drawing-guide-bisector-guides-add'); assert.equal(guides.readDrawingGuides(editor).guides.length, 2);
      await change({ kind: 'settings', locked: false });
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(get('drawing-guide-bisector-guides-add').matches(':disabled'), true);
      assert.equal(get('drawing-guide-bisector-artwork-add').matches(':disabled'), true);
      assert.match(container.textContent ?? '', /read-only/);
    });
  });

  it('keeps a single bisector available when only one guide slot remains', async () => {
    await harness(async ({ editor, guides, container, get, click, select, change }) => {
      await change({ kind: 'add-many', guides: [
        { id: 'guide:horizontal', axis: 'y', position: 200 }, { id: 'guide:vertical', axis: 'x', position: 100 },
        ...Array.from({ length: 253 }, (_, index) => ({ id: `guide:extra${index}`, axis: 'y', position: index })),
      ] });
      await select('drawing-guides-list', 'guide:horizontal');
      await select('drawing-guide-middle-second', 'guide:vertical');
      assert.equal(get('drawing-guide-bisector-guides-add').matches(':disabled'), true);
      assert.match(container.textContent ?? '', /room for one more guideline/);
      await select('drawing-guide-bisector-guides-choice', 'first');
      assert.equal(get('drawing-guide-bisector-guides-add').matches(':disabled'), false);
      await click('drawing-guide-bisector-guides-add');
      const added = guides.readDrawingGuides(editor).guides;
      assert.equal(added.length, 256); assert.equal(added.at(-1).angle, 45);
    });
  });

  it('rejects artwork geometry changed before the displayed bisector construction can commit', async () => {
    await harness(async ({ editor, guides, container, get, act, tick }) => {
      const points = { a: { id: 'a', index: 'a1', x: 0, y: 0 }, b: { id: 'b', index: 'a2', x: 100, y: 0 } };
      await act(async () => {
        editor.createShapes([
          { id: 'shape:a', type: 'line', props: { spline: 'line', points } },
          { id: 'shape:b', type: 'line', rotation: -Math.PI / 3, props: { spline: 'line', points } },
        ]);
        editor.select('shape:a', 'shape:b');
      }); await tick();
      await act(async () => {
        const add = get('drawing-guide-bisector-artwork-add');
        editor.updateShape({ id: 'shape:b', type: 'line', rotation: -Math.PI / 4 });
        add.click();
      }); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /source geometry changed/);
      assert.equal(get('drawing-guide-bisector-artwork-angles').textContent, 'Angles between sources: 45° / 135°');
    });
  });

  it('creates selection-center pairs in one undo step and the exact middle between parallel guides', async () => {
    await harness(async ({ editor, guides, container, get, click, select, change, act, tick }) => {
      await act(async () => {
        editor.createShapes([
          { id: 'shape:left', type: 'geo', x: 0, y: 10, props: { w: 100, h: 40 } },
          { id: 'shape:right', type: 'geo', x: 200, y: 20, props: { w: 40, h: 40 } },
        ]);
        editor.select('shape:left', 'shape:right');
        (container.querySelector('.drawing-guide-construction') as HTMLDetailsElement).open = true;
      });
      await tick();
      assert.equal(get('drawing-guide-center-both').matches(':disabled'), false);
      assert.equal(get('drawing-guide-gap-y').matches(':disabled'), true, 'overlapping Y bounds do not offer an outside gap');
      await click('drawing-guide-center-both');
      const centers = guides.readDrawingGuides(editor).guides;
      assert.deepEqual(centers.map((guide: any) => [guide.axis, guide.position]), [['x', 120], ['y', 35]]);
      await act(async () => editor.undo()); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      await act(async () => editor.redo()); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 2);
      await change({ kind: 'add', id: 'guide:partner', axis: 'y', position: 120 });
      await select('drawing-guides-list', centers[1].id);
      assert.equal((get('drawing-guide-middle-second') as HTMLSelectElement).value, 'guide:partner');
      await click('drawing-guide-middle-guides');
      const middle = guides.readDrawingGuides(editor).guides.at(-1);
      assert.equal(middle.axis, 'y'); assert.equal(middle.position, 77.5);
      assert.deepEqual(editor.getSelectedShapeIds(), ['shape:left', 'shape:right']);
      await act(async () => editor.undo()); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 3);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(get('drawing-guide-center-both').matches(':disabled'), true);
    });
  });

  it('converts a selected ruler guide by typing its pivot and angle', async () => {
    await harness(async ({ editor, guides, settings, get, input, click, change, act, tick }) => {
      await change({ kind: 'add', id: 'guide:convert', axis: 'x', position: 150 });
      await click('drawing-guide-rotate-angle');
      await input('drawing-guide-move-x', '20');
      await input('drawing-guide-move-y', '30');
      await input('drawing-guide-move-angle', '60');
      assert.equal(guides.readDrawingGuides(editor).guides[0].axis, 'x');
      await click('drawing-guide-move');
      const guide = guides.readDrawingGuides(editor).guides[0];
      const pivot = settings.canvasPointToCad(guide.pivot, settings.readCadSettings(editor));
      assert.equal(guide.axis, 'angle');
      assert.ok(Math.abs(pivot.x - 20) < 1e-8 && Math.abs(pivot.y - 30) < 1e-8);
      assert.equal(guide.angle, 60);
      await act(async () => editor.undo()); await tick();
      assert.ok(get('drawing-guide-rotate-angle'));
      assert.equal(guides.readDrawingGuides(editor).guides[0].position, 150);
    });
  });

  it('protects real CAD draft rollback before the first preview record exists', async () => {
    await harness(async ({ editor, guides, get, change, act, tick, pointer, hasCanvasDraft, container }) => {
      await act(async () => editor.setCurrentTool('cad-circle')); await tick();
      assert.equal(hasCanvasDraft(editor), false); assert.equal(get('drawing-guide-add').matches(':disabled'), false);
      await change({ kind: 'add', id: 'guide:before', axis: 'x', position: 350 });
      await pointer('pointer_down', { x: 100, y: 100 }); await pointer('pointer_up', { x: 100, y: 100 });
      assert.equal(hasCanvasDraft(editor), true); assert.equal(editor.getCurrentPageShapeIds().size, 0, 'first radius point has no preview shape yet');
      assert.equal(get('drawing-guide-add').matches(':disabled'), true); assert.match(container.textContent ?? '', /Finish or cancel/);
      assert.throws(() => guides.prepareDrawingGuideChange(editor, { kind: 'add', axis: 'y', position: 50 }), /busy/);
      await act(async () => editor.cancel()); await tick();
      assert.equal(hasCanvasDraft(editor), false); assert.equal(get('drawing-guide-add').matches(':disabled'), false);
      assert.equal(guides.readDrawingGuides(editor).guides.length, 1);
      await change({ kind: 'add', id: 'guide:after', axis: 'y', position: 50 });
      await act(async () => editor.undo()); await tick(); assert.equal(guides.readDrawingGuides(editor).guides.length, 1);
      await act(async () => editor.redo()); await tick(); assert.equal(guides.readDrawingGuides(editor).guides.length, 2);
      await act(async () => editor.setCurrentTool('cad-circle')); await pointer('pointer_down', { x: 120, y: 100 });
      await pointer('pointer_up', { x: 120, y: 100 }); await act(async () => editor.cancel()); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 2, 'a later canceled draft preserves both earlier guide transactions');
    });
  });

  it('rejects a native move until cancellation and then creates an independently undoable guide', async () => {
    await harness(async ({ editor, guides, get, change, act, tick, pointer }) => {
      await act(async () => { editor.createShape({ id: 'shape:native' as any, type: 'geo', x: 100, y: 100, props: { w: 80, h: 40 } }); editor.select('shape:native' as any); });
      const original = structuredClone(editor.getShape('shape:native' as any));
      await pointer('pointer_down', { x: 110, y: 110 }, { target: 'shape', shape: editor.getShape('shape:native' as any) });
      await pointer('pointer_move', { x: 160, y: 150 });
      assert.equal(editor.getPath(), 'select.translating'); assert.equal(guides.drawingGuidesBusy(editor), true);
      assert.equal(get('drawing-guide-add').matches(':disabled'), true);
      assert.throws(() => guides.prepareDrawingGuideChange(editor, { kind: 'add', axis: 'x', position: 75 }), /busy/);
      await act(async () => editor.cancel()); await tick();
      assert.deepEqual(editor.getShape('shape:native' as any), original);
      assert.equal(guides.drawingGuidesBusy(editor), false); assert.equal(get('drawing-guide-add').matches(':disabled'), false);
      await change({ kind: 'add', id: 'guide:native-after', axis: 'x', position: 75 });
      await act(async () => editor.undo()); await tick(); assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      assert.deepEqual(editor.getShape('shape:native' as any), original);
    });
  });

  it('adds physical horizontal and vertical positions, synchronizes selection and routes focus', async () => {
    await harness(async ({ editor, guides, settings, get, input, select, click, focus, change }) => {
      await focus(); assert.equal(document.activeElement?.getAttribute('data-testid'), 'drawing-guide-add-position');
      await input('drawing-guide-add-position', '10'); await click('drawing-guide-add');
      let saved = guides.readDrawingGuides(editor); assert.equal(saved.guides.length, 1); assert.equal(saved.guides[0].axis, 'y');
      assert.ok(Math.abs(saved.guides[0].position - (200 - 10 * 96 / 25.4)) < 1e-8);
      assert.ok(Math.abs(guides.guidePositionToUnit('y', saved.guides[0].position, settings.readCadSettings(editor)) - 10) < 1e-8);
      assert.equal(get('alignment-current').textContent, saved.guides[0].id);
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '10');
      await focus(); assert.equal(document.activeElement?.getAttribute('data-testid'), 'drawing-guide-move-position');
      await change({ kind: 'settings', visible: false });
      await select('drawing-guide-add-axis', 'x'); await input('drawing-guide-add-position', '5'); await click('drawing-guide-add');
      saved = guides.readDrawingGuides(editor); assert.equal(saved.guides.length, 2); assert.equal(saved.visible, true);
      assert.equal(saved.guides[1].axis, 'x'); assert.ok(Math.abs(guides.guidePositionToUnit('x', saved.guides[1].position, settings.readCadSettings(editor)) - 5) < 1e-8);
      await select('drawing-guides-list', saved.guides[0].id); assert.equal(get('alignment-current').textContent, saved.guides[0].id);
      await click('drawing-guide-locked'); assert.equal(get('drawing-guide-move-position').matches(':disabled'), true);
      assert.equal(get('drawing-guide-delete').matches(':disabled'), true);
      await focus(); assert.equal(document.activeElement?.getAttribute('data-testid'), 'drawing-guide-add-position');
    });
  });

  it('retains but blocks stale numeric drafts until reload or an explicit fresh edit', async () => {
    await harness(async ({ editor, guides, settings, get, input, click, change, act, tick }) => {
      await change({ kind: 'add', id: 'guide:edit', axis: 'x', position: 200 });
      await input('drawing-guide-move-position', '30');
      await change({ kind: 'move', id: 'guide:edit', position: 300 });
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '30');
      assert.equal(get('drawing-guide-move').matches(':disabled'), true);
      assert.equal(get('drawing-guide-move-position').getAttribute('aria-invalid'), 'true');
      await click('drawing-guide-move'); assert.equal(guides.readDrawingGuides(editor).guides[0].position, 300);
      await click('drawing-guide-reset'); assert.equal(get('drawing-guide-move-position').getAttribute('aria-invalid'), 'false');
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '52.9166666667');
      await input('drawing-guide-move-position', '40');
      await act(async () => settings.writeCadSettings(editor, { ...settings.readCadSettings(editor), unit: 'cm' })); await tick();
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '4');
      assert.equal(get('drawing-guide-move').matches(':disabled'), true);
      await input('drawing-guide-move-position', '5'); await click('drawing-guide-move');
      assert.ok(Math.abs(guides.guidePositionToUnit('x', guides.readDrawingGuides(editor).guides[0].position, settings.readCadSettings(editor)) - 5) < 1e-8);
      await input('drawing-guide-move-position', '99');
      await act(async () => get('drawing-guide-move-position').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await tick();
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '5');
      assert.equal(get('drawing-guide-move').matches(':disabled'), true);
    });
  });

  it('resets drafts across pages, preserves page selections and disables document writes when readonly', async () => {
    await harness(async ({ editor, guides, get, input, change, act, tick, container, locale }) => {
      const pageA = editor.getCurrentPageId();
      await change({ kind: 'add', id: 'guide:first', axis: 'x', position: 200 });
      await input('drawing-guide-move-position', '999');
      await act(async () => { editor.createPage({ id: 'page:second' as any, name: 'Second' }); editor.setCurrentPage('page:second' as any); }); await tick();
      assert.equal(get('alignment-current').textContent, 'none'); assert.equal(container.querySelector('[data-testid="drawing-guide-move-position"]'), null);
      assert.equal((get('drawing-guide-add-position') as HTMLInputElement).value, '0');
      await change({ kind: 'add', id: 'guide:second', axis: 'y', position: 75 });
      assert.equal(get('alignment-current').textContent, 'guide:second');
      await act(async () => editor.setCurrentPage(pageA)); await tick();
      assert.equal(get('alignment-current').textContent, 'guide:first');
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '26.4583333333');
      assert.equal(guides.readDrawingGuides(editor).guides[0].position, 200);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      for (const name of ['drawing-guides-visible', 'drawing-guides-locked', 'drawing-guides-snap', 'drawing-guide-add', 'drawing-guide-move-position', 'drawing-guide-visible', 'drawing-guide-locked', 'drawing-guide-delete']) {
        assert.equal(get(name).matches(':disabled'), true, name);
      }
      assert.equal(get('drawing-guides-list').matches(':disabled'), false);
      await act(async () => locale.set('ru')); await tick(); assert.match(container.textContent ?? '', /Направляющие/);
      await act(async () => locale.set('lv')); await tick(); assert.match(container.textContent ?? '', /Vadlīnijas/);
      assert.match(container.querySelector('.drawing-guide-help summary')?.textContent ?? '', /Kā darbojas/);
    });
  });
});
