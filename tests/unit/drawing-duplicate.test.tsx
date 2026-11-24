import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

/** Actual Editor duplication, groups, native translating state, store and undo.
 * jsdom supplies DOM APIs; browser layout and focus appearance are not simulated. */
async function harness(run: (h: any) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const values: Record<string, unknown> = { matchMedia: win.matchMedia, IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'DOMParser', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  win.Element.prototype.setPointerCapture = function () {}; win.Element.prototype.hasPointerCapture = function () { return false; };
  win.Element.prototype.releasePointerCapture = function () {}; win.Element.prototype.scrollIntoView = function () {};
  win.HTMLImageElement.prototype.decode = async () => {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tl = await import('@tldraw/tldraw'), cad = await import('../../src/lib/components/canvas/cad-settings');
  const duplicate = await import('../../src/lib/components/canvas/drawing-duplicate');
  const { applyToolkitToolbarAction } = await import('../../src/lib/components/canvas/toolkit-controls');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { CadPathShapeUtil, CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadPolylineTool } = await import('../../src/lib/components/canvas/CadPolylineTool');
  const { CadCircleTool } = await import('../../src/lib/components/canvas/CadTwoPointTool');
  const { hasCanvasDraft } = await import('../../src/lib/components/canvas/canvas-document');
  const { locale, t } = await import('svelte-i18n'); locale.set('en'); const stopText = t.subscribe(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadPathShapeUtil, CadEllipseShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools, CadPolylineTool, CadCircleTool], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 1600, 1200)); editor.updateInstanceState({ isFocused: true });
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS, retained: 'keep' } });
  const root = createRoot(host), tick = async (ms = 25) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
  const add = (x = 100, y = 100, patch = {}) => {
    const id = tl.createShapeId(); editor.createShape({ id, type: 'geo', x, y, props: { w: 80, h: 40, fill: 'solid', dash: 'solid', size: 's' }, ...patch });
    return id;
  };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  const pointer = async (name: string, point: { x: number; y: number }, extra = {}) => {
    await act(async () => editor.dispatch({ type: 'pointer', name, point: { ...editor.pageToScreen(point), z: .5 }, target: 'canvas',
      button: 0, pointerId: 1, isPen: false, shiftKey: false, ctrlKey: false, altKey: false, ...extra })); await tick(40);
  };
  const input = async (element: HTMLInputElement, value: string) => {
    await act(async () => { Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true })); }); await tick();
  };
  try { await run({ editor, tl, cad, duplicate, applyToolkitToolbarAction, add, snapshot, pointer, root, host, React, act, EditorContext, input, tick, locale, hasCanvasDraft }); }
  finally {
    await act(async () => root.unmount()); editor.dispose(); host.remove(); stopText();
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('precise duplicate command', () => {
  it('continues native Alt-drag displacement through the toolbar and repeated Ctrl+D command', async () => harness(async h => {
    const { editor, add, pointer, tick, applyToolkitToolbarAction, snapshot } = h;
    const original = add(); editor.select(original); editor.mark('alt-drag-start');
    await pointer('pointer_down', { x: 110, y: 110 }, { target: 'selection', handle: 'background', altKey: true });
    await tick(150);
    await pointer('pointer_move', { x: 270, y: 190 }, { altKey: true }); await tick(150);
    await pointer('pointer_move', { x: 270, y: 190 }, { altKey: true });
    await pointer('pointer_up', { x: 270, y: 190 }, { altKey: true });
    const first = editor.getOnlySelectedShape(); assert.notEqual(first.id, original);
    near(first.x, 260); near(first.y, 180);
    near(editor.getInstanceState().duplicateProps.offset.x, 160); near(editor.getInstanceState().duplicateProps.offset.y, 80);
    const before = snapshot();
    assert.equal(applyToolkitToolbarAction(editor, 'duplicate'), true);
    const second = editor.getOnlySelectedShape(); near(second.x, 420); near(second.y, 260);
    assert.deepEqual(editor.getInstanceState().duplicateProps.shapeIds, [second.id]);
    assert.equal(applyToolkitToolbarAction(editor, 'duplicate'), true);
    const third = editor.getOnlySelectedShape(); near(third.x, 580); near(third.y, 340);
    near(editor.getShape(original).x, 100); near(editor.getShape(original).y, 100);
    editor.undo(); assert.equal(editor.getShape(third.id), undefined); assert.ok(editor.getShape(second.id));
    editor.undo(); assert.deepEqual(snapshot(), before);
  }));

  it('persists exact zero and unit-aware defaults per page, clears Alt displacement and undoes a settings save', async () => harness(async h => {
    const { editor, duplicate: d, cad, add, snapshot, tl } = h;
    const original = add(); editor.select(original); const page = editor.getCurrentPageId(); editor.mark('default-start');
    const before = snapshot();
    const settings = { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 2 };
    const offset = d.drawingDuplicateOffsetFromDisplay({ x: 1, y: .5 }, settings);
    assert.deepEqual(offset, { x: 48, y: -24 });
    assert.deepEqual(d.drawingDuplicateOffsetToDisplay(offset, { ...settings, unit: 'mm' }), { x: 25.4, y: 12.7 });
    assert.equal(d.writeDrawingDuplicateOffset(editor, offset), true);
    assert.equal(editor.getCurrentPage().meta.retained, 'keep');
    assert.deepEqual(d.readDrawingDuplicateOffset(editor), offset);
    editor.undo(); assert.deepEqual(snapshot(), before); editor.redo();
    editor.updateInstanceState({ duplicateProps: { shapeIds: [original], offset: { x: 400, y: 300 } } });
    assert.equal(d.writeDrawingDuplicateOffset(editor, offset), true);
    assert.equal(editor.getInstanceState().duplicateProps, null);
    assert.equal(d.duplicateDrawingSelection(editor), true);
    near(editor.getOnlySelectedShape().x, 148); near(editor.getOnlySelectedShape().y, 76);
    assert.equal(d.writeDrawingDuplicateOffset(editor, { x: 0, y: 0 }), true);
    const point = editor.getOnlySelectedShape(); assert.equal(d.duplicateDrawingSelection(editor), true);
    near(editor.getOnlySelectedShape().x, point.x); near(editor.getOnlySelectedShape().y, point.y);
    const otherPage = tl.PageRecordType.createId('duplicate-defaults'); editor.createPage({ id: otherPage, name: 'Second' }); editor.setCurrentPage(otherPage);
    assert.deepEqual(d.readDrawingDuplicateOffset(editor), d.DEFAULT_DRAWING_DUPLICATE_OFFSET);
    editor.setCurrentPage(page); assert.deepEqual(d.readDrawingDuplicateOffset(editor), { x: 0, y: 0 });
    const stored = structuredClone(editor.store.getStoreSnapshot('document'));
    assert.deepEqual(stored.store[page].meta[d.DRAWING_DUPLICATE_META_KEY], { version: 1, x: 0, y: 0 });
  }));

  it('moves an unchanged new copy and repeats its actual displacement, while ignoring unrelated native IDs', async () => harness(async h => {
    const { editor, duplicate: d, add } = h; const id = add(), other = add(900, 600); editor.select(id);
    editor.updateInstanceState({ duplicateProps: { shapeIds: [other], offset: { x: 500, y: 500 } } });
    assert.equal(d.duplicateDrawingSelection(editor), true);
    const first = editor.getOnlySelectedShape(); near(first.x, 124); near(first.y, 124);
    editor.updateShape({ id: first.id, type: first.type, x: 250, y: 165 });
    assert.equal(d.duplicateDrawingSelection(editor), true);
    const second = editor.getOnlySelectedShape(); near(second.x, 400); near(second.y, 230);
    assert.equal(d.duplicateDrawingSelection(editor), true);
    near(editor.getOnlySelectedShape().x, 550); near(editor.getOnlySelectedShape().y, 295);
  }));

  it('duplicates a rotated editable vector group once, including styling, with one undo and explicit in-place copy', async () => harness(async h => {
    const { editor, duplicate: d, tl, snapshot } = h;
    const group = tl.createShapeId(), a = tl.createShapeId(), b = tl.createShapeId();
    const paint = { fill: '#225588', fillOpacity: .7, stroke: '#bb4411', strokeWidth: 3 };
    editor.createShapes([{ id: group, type: 'group', x: 140, y: 140, rotation: Math.PI / 5 },
      { id: a, type: 'cad-path', parentId: group, x: 0, y: 0, props: { points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 60 }], closed: true }, meta: { omsVectorPaint: paint, omsObjectName: 'Cut face' } },
      { id: b, type: 'geo', parentId: group, x: 100, y: 0, props: { w: 30, h: 50, fill: 'solid', color: 'red' } }]);
    editor.setSelectedShapes([group, a]); editor.mark('group-start');
    const before = snapshot(), origin = editor.getShapePageTransform(group).point();
    assert.equal(d.duplicateDrawingSelection(editor, { x: 120, y: -30 }), true);
    const copy = editor.getOnlySelectedShape(); assert.equal(copy.type, 'group'); assert.notEqual(copy.id, group);
    const copiedOrigin = editor.getShapePageTransform(copy).point(); near(copiedOrigin.x, origin.x + 120); near(copiedOrigin.y, origin.y - 30);
    const copied = [...editor.getShapeAndDescendantIds([copy.id])].map((id: any) => editor.getShape(id));
    assert.equal(copied.length, 3); const path = copied.find((shape: any) => shape.type === 'cad-path');
    assert.deepEqual(path.props, editor.getShape(a).props); assert.deepEqual(path.meta, editor.getShape(a).meta);
    near(copy.rotation, editor.getShape(group).rotation); assert.equal(editor.getCurrentPageShapes().length, 6);
    editor.undo(); assert.deepEqual(snapshot(), before);
    editor.select(group); const p = editor.getShapePageTransform(group).point();
    assert.equal(d.duplicateDrawingSelection(editor, { x: 0, y: 0 }), true);
    const inPlace = editor.getShapePageTransform(editor.getOnlySelectedShape()).point(); near(inPlace.x, p.x); near(inPlace.y, p.y);
  }));

  it('rejects read-only, locked descendants, capacity and out-of-range geometry without partial state', async () => harness(async h => {
    const { editor, duplicate: d, add, snapshot, cad, tl } = h;
    const group = tl.createShapeId(), child = tl.createShapeId(), sibling = tl.createShapeId();
    editor.createShapes([{ id: group, type: 'group' }, { id: child, type: 'geo', parentId: group, isLocked: true },
      { id: sibling, type: 'geo', parentId: group, x: 120 }]); editor.select(group); editor.mark('blocked-start');
    let before = snapshot(); assert.equal(d.duplicateDrawingSelection(editor), false); assert.deepEqual(snapshot(), before);
    editor.select(add()); editor.updateInstanceState({ isReadonly: true }); before = snapshot();
    assert.equal(d.duplicateDrawingSelection(editor), false); assert.equal(d.writeDrawingDuplicateOffset(editor, { x: 0, y: 0 }), false); assert.deepEqual(snapshot(), before);
    editor.updateInstanceState({ isReadonly: false }); const limit = editor.options.maxShapesPerPage;
    editor.options.maxShapesPerPage = editor.getCurrentPageShapeIds().size;
    before = snapshot(); assert.equal(d.duplicateDrawingSelection(editor), false); assert.deepEqual(snapshot(), before); editor.options.maxShapesPerPage = limit;
    editor.select(add(cad.CAD_MAX_COORDINATE - 90, 20)); before = snapshot();
    assert.equal(d.duplicateDrawingSelection(editor, { x: 50, y: 0 }), false); assert.deepEqual(snapshot(), before);
    for (const x of [Infinity, NaN, cad.CAD_MAX_COORDINATE + 1]) {
      assert.equal(d.writeDrawingDuplicateOffset(editor, { x, y: 0 }), false);
      assert.equal(d.duplicateDrawingSelection(editor, { x, y: 0 }), false); assert.deepEqual(snapshot(), before);
    }
    editor.select(add(100, 100, { meta: { large: 'x'.repeat(950_000) } })); before = snapshot();
    assert.equal(d.duplicateDrawingSelection(editor), false); assert.deepEqual(snapshot(), before);
  }));

  it('rolls back a silent partial native duplicate and restores its prior selection and repeat displacement', async () => harness(async h => {
    const { editor, duplicate: d, add, snapshot } = h;
    const a = add(), b = add(250, 120); editor.select(a, b);
    editor.updateInstanceState({ duplicateProps: { shapeIds: [a, b], offset: { x: 180, y: -20 } } });
    editor.mark('refusal-start'); const before = snapshot(), selected = [...editor.getSelectedShapeIds()], remembered = structuredClone(editor.getInstanceState().duplicateProps);
    const native = editor.duplicateShapes;
    editor.duplicateShapes = function (ids: any[], offset: any) { native.call(this, ids, offset); this.deleteShapes([this.getSelectedShapeIds()[0]]); return this; };
    assert.equal(d.duplicateDrawingSelection(editor), false);
    assert.deepEqual(snapshot(), before); assert.deepEqual(editor.getSelectedShapeIds(), selected); assert.deepEqual(editor.getInstanceState().duplicateProps, remembered);
    editor.duplicateShapes = native;
  }));

  it('rejects a default-offset write refused by native page hooks and leaves repeat state intact', async () => harness(async h => {
    const { editor, duplicate: d, add, snapshot } = h; const id = add(); editor.select(id);
    editor.updateInstanceState({ duplicateProps: { shapeIds: [id], offset: { x: 200, y: 100 } } });
    editor.mark('settings-refusal'); const before = snapshot(), remembered = structuredClone(editor.getInstanceState().duplicateProps);
    const dispose = editor.sideEffects.registerBeforeChangeHandler('page', (previous: any) => previous);
    try { assert.equal(d.writeDrawingDuplicateOffset(editor, { x: 70, y: 30 }), false); assert.deepEqual(snapshot(), before); assert.deepEqual(editor.getInstanceState().duplicateProps, remembered); }
    finally { dispose(); }
  }));

  for(const tool of ['cad-polyline','cad-circle'])it(`protects offset history during a native ${tool} draft and reenables after Escape`,async()=>harness(async h=>{
    const {editor,duplicate:d,cad,root,host,React,act,EditorContext,input,tick,pointer,hasCanvasDraft,snapshot}=h;
    const {RepeatGrid}=await import('../../src/lib/components/canvas/RepeatGrid');
    assert.equal(d.writeDrawingDuplicateOffset(editor,{x:30,y:-12}),true);
    await act(async()=>root.render(<EditorContext.Provider value={editor}><RepeatGrid selected={[]} disabled settings={cad.DEFAULT_CAD_SETTINGS} expanded/></EditorContext.Provider>));
    await tick();
    const form=()=>host.querySelector('[data-testid="drawing-duplicate-offset"]') as HTMLFormElement;
    const fields=form().querySelectorAll('input');await input(fields[0],'10');await input(fields[1],'20');
    await act(async()=>editor.setCurrentTool(tool));await tick();
    assert.equal(form().querySelector('fieldset')!.disabled,false,'idle CAD tools permit settings changes');
    const beforeDraft=snapshot();
    await pointer('pointer_down',{x:150,y:150});await pointer('pointer_up',{x:150,y:150});
    assert.equal(hasCanvasDraft(editor),true);
    if(tool==='cad-circle')assert.equal(editor.getCurrentPageShapeIds().size,0,'first circle point has no preview record');
    const draft=snapshot();
    assert.equal(form().querySelector('fieldset')!.disabled,true);
    assert.match(form().textContent??'',/Finish or cancel/);
    assert.equal(d.writeDrawingDuplicateOffset(editor,{x:400,y:200}),false);
    await act(async()=>form().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await tick();
    assert.equal(editor.getCurrentToolId(),tool,'saving does not complete the draft');
    assert.deepEqual(snapshot(),draft);
    assert.equal(form().querySelector('[role="status"]')!.textContent?.includes('saved for this page'),false);
    const escape=async()=>{
      await act(async()=>editor.dispatch({type:'keyboard',name:'key_down',key:'Escape',code:'Escape',shiftKey:false,ctrlKey:false,altKey:false}));
      await act(async()=>editor.dispatch({type:'keyboard',name:'key_up',key:'Escape',code:'Escape',shiftKey:false,ctrlKey:false,altKey:false}));await tick();
    };
    await escape();
    assert.equal(hasCanvasDraft(editor),false);assert.deepEqual(snapshot(),beforeDraft);
    assert.equal(form().querySelector('fieldset')!.disabled,false);
    await act(async()=>form().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await tick();
    const saved=d.drawingDuplicateOffsetFromDisplay({x:10,y:20},cad.DEFAULT_CAD_SETTINGS);
    assert.deepEqual(d.readDrawingDuplicateOffset(editor),saved);
    assert.match(form().querySelector('[role="status"]')?.textContent??'',/saved for this page/i);
    await act(async()=>editor.setCurrentTool(tool));await pointer('pointer_down',{x:300,y:250});await pointer('pointer_up',{x:300,y:250});
    await escape();assert.deepEqual(d.readDrawingDuplicateOffset(editor),saved,'a later canceled draft cannot undo the saved defaults');
    await act(async()=>editor.undo());await tick();assert.deepEqual(d.readDrawingDuplicateOffset(editor),{x:30,y:-12},'one undo restores the preceding defaults');
  }));

  it('disables default saving during native pointer input and custom pointer ownership, then restores it after release',async()=>harness(async h=>{
    const {editor,duplicate:d,cad,root,host,React,act,EditorContext,tick,pointer,add,snapshot}=h;
    const {RepeatGrid}=await import('../../src/lib/components/canvas/RepeatGrid');
    const {claimDrawingPointerGesture}=await import('../../src/lib/components/canvas/drawing-pointer-gesture');
    const id=add();editor.select(id);
    await act(async()=>root.render(<EditorContext.Provider value={editor}><RepeatGrid selected={[id]} disabled={false} settings={cad.DEFAULT_CAD_SETTINGS} expanded/></EditorContext.Provider>));await tick();
    const fieldset=()=>host.querySelector('[data-testid="drawing-duplicate-offset"] fieldset') as HTMLFieldSetElement;
    const before=snapshot();
    await pointer('pointer_down',{x:110,y:110},{target:'selection',handle:'background'});
    assert.equal(editor.inputs.isPointing,true);assert.equal(fieldset().disabled,true);
    assert.equal(d.writeDrawingDuplicateOffset(editor,{x:50,y:20}),false);
    await pointer('pointer_up',{x:110,y:110});assert.equal(fieldset().disabled,false);assert.deepEqual(snapshot(),before);
    let release:(()=>void)|null=null;
    host.addEventListener('pointerdown',()=>{release=claimDrawingPointerGesture(editor,'guide');},{once:true});
    await act(async()=>host.dispatchEvent(new Event('pointerdown',{bubbles:true})));await tick();
    assert.ok(release);assert.equal(editor.inputs.isPointing,false,'custom overlays do not require a native pointer state');
    assert.equal(fieldset().disabled,true);assert.equal(d.writeDrawingDuplicateOffset(editor,{x:50,y:20}),false);
    host.addEventListener('pointerup',()=>release?.(),{once:true});
    await act(async()=>host.dispatchEvent(new Event('pointerup',{bubbles:true})));await tick();
    assert.equal(fieldset().disabled,false);assert.deepEqual(snapshot(),before);
  }));

  it('keeps default offsets in a separate translated form with signed units, invalid-field feedback and read-only protection', async () => harness(async h => {
    const { editor, duplicate: d, cad, root, host, React, act, EditorContext, input, tick, locale } = h;
    const { RepeatGrid } = await import('../../src/lib/components/canvas/RepeatGrid');
    const render = (settings: any) => act(async () => root.render(<EditorContext.Provider value={editor}><RepeatGrid
      selected={[]} disabled settings={settings} expanded /></EditorContext.Provider>));
    await render(cad.DEFAULT_CAD_SETTINGS); await tick();
    const form = () => host.querySelector('[data-testid="drawing-duplicate-offset"]') as HTMLFormElement;
    assert.equal(host.querySelectorAll('form').length, 2); assert.ok(form());
    assert.equal(form().querySelector('fieldset')!.disabled, false, 'page defaults do not need a selected object');
    let fields = form().querySelectorAll<HTMLInputElement>('input');
    await input(fields[0], '25.4'); await input(fields[1], '12.7');
    const settings = { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in' };
    await render(settings); await tick(); fields = form().querySelectorAll('input'); near(Number(fields[0].value), 1); near(Number(fields[1].value), .5);
    await act(async () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick();
    assert.deepEqual(d.readDrawingDuplicateOffset(editor), { x: 96, y: -48 });
    assert.match(form().querySelector('[role="status"]')?.textContent ?? '', /saved for this page/i);
    assert.equal(editor.getCurrentPageShapeIds().size, 0, 'saving the default never creates a grid');
    await input(fields[0], ''); assert.equal(form().querySelector('button')!.disabled, true);
    const invalid = form().querySelector('[role="alert"]')!; assert.ok(invalid.id && fields[0].getAttribute('aria-describedby')?.includes(invalid.id));
    assert.equal(fields[0].getAttribute('aria-invalid'), 'true');
    await act(async () => locale.set('ru')); assert.match(form().textContent ?? '', /Смещение копии/);
    await act(async () => locale.set('lv')); assert.match(form().textContent ?? '', /Kopijas nobīde/);
    await input(fields[0], '0'); await input(fields[1], '0');
    await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
    assert.equal(form().querySelector('fieldset')!.disabled, true); const before = d.readDrawingDuplicateOffset(editor);
    await act(async () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick(); assert.deepEqual(d.readDrawingDuplicateOffset(editor), before);
  }));
});
