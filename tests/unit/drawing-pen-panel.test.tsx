import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

async function harness(run: (h: any) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  const values: Record<string, unknown> = { matchMedia: media, IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  const captures = new Map<number, Element>();
  win.Element.prototype.setPointerCapture = function (id: number) { captures.set(id, this); };
  win.Element.prototype.hasPointerCapture = function (id: number) { return captures.get(id) === this; };
  win.Element.prototype.releasePointerCapture = function (id: number) { if (captures.get(id) === this) captures.delete(id); };
  win.HTMLImageElement.prototype.decode = async () => {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tl = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { DrawingPenPanel } = await import('../../src/lib/components/canvas/DrawingPenPanel');
  const { DrawingFreehandControls } = await import('../../src/lib/components/canvas/DrawingFreehandControls');
  const freehand = await import('../../src/lib/components/canvas/cad-freehand');
  const pen = await import('../../src/lib/components/canvas/drawing-pen-settings');
  const runtime = await import('../../src/lib/components/canvas/drawing-pen-input');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const { CadFreehandTool } = await import('../../src/lib/components/canvas/CadFreehandTool');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { locale } = await import('svelte-i18n'); locale.set('en');
  const instances: Array<{ editor: any; root: any; host: HTMLDivElement }> = [];
  const mount = async () => {
    const host = document.createElement('div'); host.tabIndex = 0; document.body.append(host);
    const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil];
    const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
      bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools, CadFreehandTool], getContainer: () => host, initialState: 'select' });
    editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600)); editor.updateInstanceState({ isFocused: true });
    editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
    const root = createRoot(host); instances.push({ editor, root, host });
    await act(async () => root.render(<EditorContext.Provider value={editor}>
      <DrawingPenPanel onFreehand={() => editor.setCurrentTool('cad-freehand')} /><DrawingFreehandControls compact />
    </EditorContext.Provider>));
    const svg = host.querySelector('[data-testid="drawing-pen-test"]') as SVGElement;
    svg.getBoundingClientRect = () => win.DOMRect.fromRect({ x: 0, y: 0, width: 256, height: 112 });
    return { editor, host };
  };
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const first = await mount(), { editor, host } = first;
  const get = (id: string) => { const node = host.querySelector(`[data-testid="${id}"]`) as HTMLElement; assert.ok(node, id); return node; };
  const select = async (id: string, value: string) => {
    await act(async () => { const node = get(id) as HTMLSelectElement; node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }); await tick();
  };
  const input = async (id: string, value: string) => {
    await act(async () => {
      const node = get(id) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }); await tick();
  };
  const key = async (id: string, value: string) => {
    await act(async () => get(id).dispatchEvent(new KeyboardEvent('keydown', { key: value, code: value, bubbles: true, cancelable: true }))); await tick();
  };
  const focus = async (id: string) => { await act(async () => get(id).focus()); await tick(); };
  const blur = async (id: string) => { await act(async () => get(id).blur()); await tick(); };
  const click = async (id: string) => { await act(async () => get(id).click()); await tick(); };
  const pointer = async (name: string, x: number, pressure: number, extra = {}, target: EventTarget = get('drawing-pen-test')) => {
    const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: x, clientY: 56, button: 0, buttons: name === 'pointerup' || name === 'pointercancel' ? 0 : 1 });
    for (const [key, value] of Object.entries({ pointerId: 11, pointerType: 'pen', isPrimary: true, pressure, tiltX: 25, tiltY: -15, twist: 60, ...extra }))
      Object.defineProperty(event, key, { value });
    await act(async () => target.dispatchEvent(event)); await tick();
  };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor, host, win, get, select, input, key, focus, blur, click, pointer, tick, act, snapshot, cad, pen, runtime, freehand, mount, locale }); }
  finally {
    for (const instance of instances.reverse()) { await act(async () => instance.root.unmount()); instance.editor.dispose(); instance.host.remove(); }
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('Pen docker and contextual Freehand controls', () => {
  it('applies physical width and stroke options without editing artwork, and recovers from invalid input', async () => {
    await harness(async ({ editor, freehand, cad, snapshot, get, input, key, select, click, act, tick }) => {
      const before = snapshot(), settings = cad.readCadSettings(editor), autoClose = freehand.readCadFreehandOptions(editor).autoClose;
      await input('drawing-freehand-property-width', '2.5'); await key('drawing-freehand-property-width', 'Enter');
      near(freehand.readCadFreehandOptions(editor).width, cad.unitLengthToCanvas(2.5, settings));
      assert.equal((get('drawing-freehand-width') as HTMLInputElement).value, '2.5');
      await input('drawing-freehand-property-width', '-2'); await key('drawing-freehand-property-width', 'Enter');
      assert.equal(get('drawing-freehand-property-width').getAttribute('aria-invalid'), 'true');
      near(freehand.readCadFreehandOptions(editor).width, cad.unitLengthToCanvas(2.5, settings));
      await key('drawing-freehand-property-width', 'Escape'); assert.equal((get('drawing-freehand-property-width') as HTMLInputElement).value, '2.5');
      await select('drawing-freehand-property-mode', 'ink'); await click('drawing-freehand-property-close');
      assert.equal(freehand.readCadFreehandOptions(editor).mode, 'ink'); assert.equal(freehand.readCadFreehandOptions(editor).autoClose, !autoClose);
      assert.deepEqual(snapshot(), before);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(get('drawing-freehand-property-width').matches(':disabled'), true);
      assert.equal(get('drawing-pen-freehand').matches(':disabled'), true);
      assert.equal(get('drawing-pen-test').getAttribute('aria-disabled'), null);
    });
  });

  it('tests pressure, response, tilt and cancellation without writing a drawing', async () => {
    await harness(async ({ editor, pen, runtime, snapshot, select, pointer, get, click, act, win, tick }) => {
      const before = snapshot(); await select('drawing-pen-response', 'firm');
      assert.equal(pen.readDrawingPenSettings(editor).response, 'firm');
      await pointer('pointerdown', 20, .25); near(runtime.drawingPenDiagnostics(editor).get().mappedPressure, .0625);
      await pointer('pointermove', 120, .8); assert.equal(get('drawing-pen-pressure-value').textContent, '80%');
      assert.equal(get('drawing-pen-tilt').textContent, '25° / -15°');
      assert.equal(get('drawing-pen-response').matches(':disabled'), true);
      await pointer('pointercancel', 120, 0); assert.equal(get('drawing-pen-response').matches(':disabled'), false);
      assert.equal(runtime.drawingPenDiagnostics(editor).get().contact, false);
      await pointer('pointerdown', 30, .4); await act(async () => win.dispatchEvent(new Event('blur'))); await tick();
      assert.equal(get('drawing-pen-response').matches(':disabled'), false);
      await click('drawing-pen-test-clear'); assert.equal(get('drawing-pen-test').querySelectorAll('circle').length, 0);
      assert.deepEqual(snapshot(), before); assert.equal(editor.getCurrentPageShapeIds().size, 0);
    });
  });

  it('isolates simultaneous editor diagnostics and uses unique accessible pressure labels', async () => {
    await harness(async ({ editor, mount, host, pointer, runtime, get }) => {
      const other = await mount();
      const firstMeter = host.querySelector('meter')!, secondMeter = other.host.querySelector('meter')!;
      assert.notEqual(firstMeter.id, secondMeter.id);
      assert.ok(host.querySelector(`label[for="${firstMeter.id}"]`)); assert.ok(other.host.querySelector(`label[for="${secondMeter.id}"]`));
      await pointer('pointerdown', 40, .7); assert.equal(runtime.drawingPenDiagnostics(editor).get().detectedPen, true);
      assert.equal(runtime.drawingPenDiagnostics(other.editor).get().detectedPen, false);
      await pointer('pointerup', 40, 0); assert.equal(get('drawing-pen-mode').matches(':disabled'), false);
    });
  });

  it('keeps preferences usable after ignored form input, read-only canvas contact and lost test-pad capture', async () => {
    await harness(async ({ editor, host, runtime, snapshot, pointer, get, click, act, tick }) => {
      let stop = () => {}; const before = snapshot();
      await act(async () => { stop = runtime.installDrawingPenInput(editor); }); await tick();
      const canvas = document.createElement('div'); canvas.className = 'tl-canvas';
      const form = document.createElement('div'); form.className = 'canvas-form-sheet';
      const field = document.createElement('input'); form.append(field); canvas.append(form); host.append(canvas);
      try {
        await pointer('pointerdown', 20, .5, {}, field);
        assert.equal(get('drawing-pen-mode').matches(':disabled'), false);
        await pointer('pointerup', 20, 0, {}, field);
        assert.equal(runtime.drawingPenDiagnostics(editor).get().contact, false);
        await pointer('pointerdown', 20, .5, {}, get('drawing-pen-pressure'));
        assert.equal(get('drawing-pen-pressure').matches(':disabled'), false);
        await pointer('pointerup', 20, 0, {}, get('drawing-pen-pressure'));
        await click('drawing-pen-pressure');
        await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
        await pointer('pointerdown', 40, .6, {}, canvas); await pointer('pointerup', 40, 0, {}, canvas);
        assert.equal(get('drawing-pen-mode').matches(':disabled'), false);
        await pointer('pointerdown', 30, .4); await pointer('lostpointercapture', 30, .4, { buttons: 1 });
        assert.equal(runtime.drawingPenDiagnostics(editor).get().contact, false);
        assert.equal(get('drawing-pen-mode').matches(':disabled'), false);
        assert.deepEqual(snapshot(), before);
      } finally { await act(async () => { stop(); canvas.remove(); }); await tick(); }
    });
  });

  it('shares fixed calligraphic nib settings and independent live tilt/bearing between property bar and docker', async () => {
    await harness(async ({ editor, get, select, input, key, focus, blur, click, freehand, snapshot }) => {
      const before = snapshot();
      await select('drawing-freehand-property-mode', 'calligraphy');
      assert.equal((get('drawing-freehand-mode') as HTMLSelectElement).value, 'calligraphy');
      assert.equal((get('drawing-freehand-property-nib-angle') as HTMLInputElement).value, '45');
      assert.equal((get('drawing-freehand-property-nib-tilt') as HTMLInputElement).value, '15');
      const preview = get('drawing-freehand-property-nib-preview');
      assert.equal(preview.getAttribute('aria-hidden'), 'true');
      assert.ok(preview.childElementCount > 0);
      const initialPreview = preview.outerHTML;
      await input('drawing-freehand-property-nib-angle', '-30'); await key('drawing-freehand-property-nib-angle', 'Enter');
      assert.equal(freehand.readCadFreehandOptions(editor).nibAngle, -30);
      assert.equal((get('drawing-freehand-nib-angle') as HTMLInputElement).value, '-30');
      assert.notEqual(get('drawing-freehand-property-nib-preview').outerHTML, initialPreview);
      await focus('drawing-freehand-nib-tilt'); await input('drawing-freehand-nib-tilt', '60'); await blur('drawing-freehand-nib-tilt');
      assert.equal(freehand.readCadFreehandOptions(editor).nibTilt, 60);
      assert.equal((get('drawing-freehand-property-nib-tilt') as HTMLInputElement).value, '60');
      await click('drawing-freehand-property-use-tilt');
      assert.equal(freehand.readCadFreehandOptions(editor).useTilt, true);
      assert.equal(freehand.readCadFreehandOptions(editor).useBearing, false);
      assert.equal((get('drawing-freehand-use-tilt') as HTMLInputElement).checked, true);
      assert.equal(get('drawing-freehand-nib-tilt').matches(':disabled'), false);
      await click('drawing-freehand-use-bearing');
      assert.equal(freehand.readCadFreehandOptions(editor).useBearing, true);
      assert.equal((get('drawing-freehand-property-use-bearing') as HTMLInputElement).checked, true);
      assert.equal(get('drawing-freehand-property-nib-angle').matches(':disabled'), false);
      await click('drawing-freehand-use-tilt');
      assert.equal(freehand.readCadFreehandOptions(editor).useTilt, false);
      assert.equal(freehand.readCadFreehandOptions(editor).useBearing, true);
      assert.deepEqual(snapshot(), before);
    });
  });

  it('validates calligraphic angle and tilt on Enter or blur and restores invalid drafts with Escape', async () => {
    await harness(async ({ editor, get, select, input, key, focus, blur, freehand, snapshot }) => {
      const before = snapshot(); await select('drawing-freehand-mode', 'calligraphy');
      for (const [field, property, invalid, edge] of [
        ['nib-angle', 'nibAngle', '-181', '-180'], ['nib-angle', 'nibAngle', '181', '180'],
        ['nib-tilt', 'nibTilt', '14', '15'], ['nib-tilt', 'nibTilt', '91', '90'],
      ]) {
        const id = `drawing-freehand-property-${field}`, previous = freehand.readCadFreehandOptions(editor)[property];
        await focus(id); await input(id, invalid); await key(id, 'Enter');
        assert.equal(get(id).getAttribute('aria-invalid'), 'true');
        assert.equal(freehand.readCadFreehandOptions(editor)[property], previous);
        await key(id, 'Escape');
        assert.equal((get(id) as HTMLInputElement).value, String(previous));
        assert.equal(get(id).getAttribute('aria-invalid'), 'false');
        await input(id, edge); await blur(id);
        assert.equal(freehand.readCadFreehandOptions(editor)[property], Number(edge));
        assert.equal((get(`drawing-freehand-${field}`) as HTMLInputElement).value, edge);
      }
      await focus('drawing-freehand-property-nib-tilt'); await input('drawing-freehand-property-nib-tilt', '');
      await blur('drawing-freehand-property-nib-tilt');
      assert.equal(get('drawing-freehand-property-nib-tilt').getAttribute('aria-invalid'), 'true');
      assert.equal(freehand.readCadFreehandOptions(editor).nibTilt, 90);
      await key('drawing-freehand-property-nib-tilt', 'Escape');
      assert.equal((get('drawing-freehand-property-nib-tilt') as HTMLInputElement).value, '90');
      assert.deepEqual(snapshot(), before);
    });
  });

  it('shows continuation only for curves and nib controls only for calligraphy while retaining next-stroke options', async () => {
    await harness(async ({ editor, host, get, select, click, freehand, snapshot }) => {
      const before = snapshot(), exists = (id: string) => !!host.querySelector(`[data-testid="${id}"]`);
      assert.equal((get('drawing-freehand-property-continue') as HTMLInputElement).checked, true);
      assert.equal(exists('drawing-freehand-property-nib-angle'), false);
      await click('drawing-freehand-property-continue');
      assert.equal(freehand.readCadFreehandOptions(editor).continueCurve, false);
      assert.equal((get('drawing-freehand-continue') as HTMLInputElement).checked, false);
      await select('drawing-freehand-property-mode', 'ink');
      assert.equal(exists('drawing-freehand-property-continue'), false);
      assert.equal(exists('drawing-freehand-nib-tilt'), false);
      await select('drawing-freehand-mode', 'calligraphy');
      assert.equal(exists('drawing-freehand-property-continue'), false);
      assert.equal(exists('drawing-freehand-property-nib-angle'), true);
      assert.equal(exists('drawing-freehand-nib-preview'), true);
      await select('drawing-freehand-mode', 'curve');
      assert.equal(exists('drawing-freehand-property-nib-preview'), false);
      assert.equal((get('drawing-freehand-property-continue') as HTMLInputElement).checked, false);
      assert.deepEqual(snapshot(), before);
    });
  });

  it('disables calligraphy and continuation controls during a real pending stroke or readonly mode', async () => {
    await harness(async ({ editor, get, select, act, tick, snapshot }) => {
      const before = snapshot(); await select('drawing-freehand-property-mode', 'calligraphy');
      await act(async () => {
        editor.setCurrentTool('cad-freehand');
        editor.dispatch({ type: 'pointer', name: 'pointer_down', target: 'canvas', pointerId: 27, button: 0, isPen: false,
          point: { x: 320, y: 220, z: 1 }, shiftKey: false, ctrlKey: false, altKey: false });
      }); await tick();
      for (const prefix of ['drawing-freehand', 'drawing-freehand-property'])
        for (const field of ['mode', 'width', 'nib-angle', 'nib-tilt', 'use-tilt', 'use-bearing']) assert.equal(get(`${prefix}-${field}`).matches(':disabled'), true);
      assert.deepEqual(snapshot(), before);
      await act(async () => editor.cancel()); await tick();
      assert.equal(get('drawing-freehand-property-nib-angle').matches(':disabled'), false);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(get('drawing-freehand-nib-angle').matches(':disabled'), true);
      assert.equal(get('drawing-freehand-property-use-bearing').matches(':disabled'), true);
      await act(async () => editor.updateInstanceState({ isReadonly: false })); await tick();
      await select('drawing-freehand-property-mode', 'curve');
      await act(async () => editor.dispatch({ type: 'pointer', name: 'pointer_down', target: 'canvas', pointerId: 28, button: 0, isPen: false,
        point: { x: 380, y: 260, z: 1 }, shiftKey: false, ctrlKey: false, altKey: false })); await tick();
      assert.equal(get('drawing-freehand-continue').matches(':disabled'), true);
      assert.equal(get('drawing-freehand-property-continue').matches(':disabled'), true);
      await act(async () => editor.cancel()); await tick();
      assert.equal(get('drawing-freehand-property-continue').matches(':disabled'), false);
      assert.deepEqual(snapshot(), before);
    });
  });

  it('renders the pen controls and device guidance in English, Russian and Latvian', async () => {
    await harness(async ({ locale, get, select, act, tick }) => {
      await select('drawing-freehand-mode', 'calligraphy'); const labels = new Set<string>();
      for (const [language, expected] of [['en', 'Test the pen'], ['ru', 'Проверка пера'], ['lv', 'Pārbaudīt pildspalvu']]) {
        await act(async () => locale.set(language)); await tick();
        assert.ok(get('drawing-pen-panel').textContent?.includes(expected));
        assert.ok(get('drawing-pen-panel').textContent?.includes('Windows Ink'));
        const label = get('drawing-freehand-use-bearing').closest('label')?.textContent?.trim();
        assert.ok(label); labels.add(label);
        assert.equal(get('drawing-freehand-nib-preview').getAttribute('aria-hidden'), 'true');
      }
      assert.equal(labels.size, 3);
    });
  });
});
