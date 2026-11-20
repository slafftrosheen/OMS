import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { CadPlan } from '../../src/lib/components/canvas/cad-plans';
import type { VectorDocument } from '../../src/lib/components/canvas/cad-paint';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

/** Real Editor, native grouping/reparenting, schema, history, and serialization.
 * JSDOM supplies the platform surface; no rendering or pointer claim is made. */
async function harness(run: (h: any) => void | Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  const values: Record<string, unknown> = { matchMedia: media,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  win.HTMLImageElement.prototype.decode = async () => {};
  win.Element.prototype.setPointerCapture = function () {};
  win.Element.prototype.hasPointerCapture = function () { return false; };
  win.Element.prototype.releasePointerCapture = function () {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const tl = await import('@tldraw/tldraw');
  const plans = await import('../../src/lib/components/canvas/cad-plans');
  const vector = await import('../../src/lib/components/canvas/cad-vector');
  const curves = await import('../../src/lib/components/canvas/cad-curves');
  const source = await import('../../src/lib/components/canvas/cad-trace-source');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const dxf = await import('../../src/lib/components/canvas/cad-dxf');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS } } });
  const rectangle = (x: number, y: number, w: number, h: number) => ({ closed: true,
    nodes: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([x, y]) => curves.nodeAt({ x, y })) });
  const documentFixture = (): VectorDocument => {
    const outer = rectangle(4, 8, 32, 28); outer.nodes[0].outX = 12; outer.nodes[0].outY = -6; outer.nodes[1].inX = -12; outer.nodes[1].inY = -6;
    return { width: 80, height: 40, warnings: [], paths: [
      { contours: [outer, rectangle(12, 16, 8, 8)], fillRule: 'evenodd', paint: { ...vector.VECTOR_DEFAULT_PAINT, fill: '#cc2211', fillOpacity: .4, stroke: 'none', dash: [] } },
      { contours: [rectangle(44, 8, 32, 28)], fillRule: 'evenodd', paint: { ...vector.VECTOR_DEFAULT_PAINT, fill: '#1255cc', fillOpacity: .7, stroke: 'none', dash: [] } },
    ] };
  };
  const genericPlan = (doc = documentFixture()): CadPlan => vector.prepareVectorImport(editor, cad.DEFAULT_CAD_SETTINGS, doc,
    doc.width * cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS), { x: 0, y: 0 }, 'Trace');
  function sourceFixture(nested = false) {
    const group = tl.createShapeId('trace-parent'), parent = nested ? group : editor.getCurrentPageId(), indices = tl.getIndices(3);
    const below = tl.createShapeId('trace-below'), bitmap = tl.createShapeId('trace-source'), above = tl.createShapeId('trace-above');
    editor.createShapes([
      ...(nested ? [{ id: group, type: 'group', x: 160, y: 90, rotation: .4, opacity: .5 }] : []),
      { id: below, type: 'image', parentId: parent, index: indices[0], x: 0, y: 0, props: { w: 20, h: 20 } },
      { id: bitmap, type: 'image', parentId: parent, index: indices[1], x: 30, y: 25, rotation: -.2, opacity: .6, props: { w: 160, h: 80, flipX: true } },
      { id: above, type: 'image', parentId: parent, index: indices[2], x: 200, y: 0, props: { w: 20, h: 20 } },
    ]);
    editor.select(bitmap); editor.mark('trace-source-fixture');
    return { parent, below, bitmap, above };
  }
  function singletonFixture(prefix = 'singleton', nested = false) {
    const outer = tl.createShapeId(`${prefix}-outer`), parent = tl.createShapeId(`${prefix}-parent`), bitmap = tl.createShapeId(`${prefix}-source`);
    editor.createShapes([
      ...(nested ? [{ id: outer, type: 'group', x: 70, y: 60, rotation: -.3, opacity: .7 }] : []),
      { id: parent, type: 'group', parentId: nested ? outer : editor.getCurrentPageId(), x: 160, y: 90, rotation: .4, opacity: .5, meta: { original: 'untouched' } },
      { id: bitmap, type: 'image', parentId: parent, x: 30, y: 25, rotation: -.2, opacity: .6, props: { w: 160, h: 80, flipX: true } },
    ]);
    editor.select(bitmap); editor.mark(`${prefix}-fixture`);
    return { parent, bitmap, outer: nested ? outer : undefined };
  }
  const tracePlan = (replace = false, doc = documentFixture()): CadPlan => ({
    ...source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, replace), groupResult: true, groupName: 'Trace',
  });
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  const records = () => editor.getCurrentPageShapesSorted();
  try { await run({ editor, tl, plans, vector, curves, source, cad, dxf, shapeUtils, documentFixture, genericPlan, sourceFixture, singletonFixture, tracePlan, snapshot, records }); }
  finally {
    editor.dispose(); host.remove(); channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('native trace output grouping and source placement', () => {
  it('keeps separate paints and compound holes in one selected native group, with one Undo/Redo and JSON reload', async () => harness(h => {
    const { editor, tl, plans, shapeUtils, sourceFixture, tracePlan, snapshot } = h;
    const fixture = sourceFixture(), before = snapshot(), plan = tracePlan(true);
    assert.deepEqual(snapshot(), before, 'preparing grouping must not write a document');
    assert.equal(plans.applyCadPlan(editor, plan), true);
    const group = editor.getOnlySelectedShape(); assert.equal(group.type, 'group'); assert.equal(group.meta.omsObjectName, 'Trace'); assert.equal(group.opacity, 1);
    assert.equal(editor.getShape(fixture.bitmap), undefined);
    const children = editor.getSortedChildIdsForParent(group.id).map((id: string) => editor.getShape(id));
    assert.equal(children.length, 2);
    children.forEach((shape: any, i: number) => {
      assert.equal(shape.type, 'cad-bezier'); assert.equal(shape.parentId, group.id); assert.equal(shape.opacity, 1);
      assert.deepEqual(shape.props.contours, plan.shapes[i].props.contours); assert.equal(shape.props.fillRule, 'evenodd');
      assert.deepEqual(shape.meta.omsVectorPaint, plan.shapes[i].meta.omsVectorPaint);
    });
    assert.equal(children[0].props.contours.length, 2, 'grouping must not split out the hole');
    assert.notEqual(children[0].meta.omsVectorPaint.fill, children[1].meta.omsVectorPaint.fill, 'grouping must not combine paints');
    const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    const restored = tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils });
    restored.loadStoreSnapshot(JSON.parse(JSON.stringify(after))); assert.deepEqual(restored.get(group.id), editor.store.get(group.id));
    children.forEach((shape: any) => assert.deepEqual(restored.get(shape.id), editor.store.get(shape.id)));
  }));

  for (const replace of [false, true]) it(`preserves nested parent, sibling order, world geometry, and effective alpha when replacement is ${replace}`, async () => harness(h => {
    const { editor, plans, sourceFixture, tracePlan, documentFixture, snapshot, dxf, cad } = h;
    const fixture = sourceFixture(true), source = editor.getShape(fixture.bitmap), sourceTransform = editor.getShapePageTransform(source);
    const sourceOpacity = source.opacity * editor.getShape(fixture.parent).opacity;
    editor.updateInstanceState({ opacityForNextShape: .2 });
    const before = snapshot(), document = documentFixture(), plan = tracePlan(replace, document);
    const siblingIndices = [editor.getShape(fixture.below).index, source.index, editor.getShape(fixture.above).index];
    assert.equal(plans.applyCadPlan(editor, plan), true);
    const group = editor.getOnlySelectedShape(); assert.equal(group.parentId, fixture.parent);
    assert.ok(group.index > siblingIndices[1] && group.index < siblingIndices[2]);
    assert.equal(editor.getShape(fixture.below).index, siblingIndices[0]); assert.equal(editor.getShape(fixture.above).index, siblingIndices[2]);
    assert.equal(!!editor.getShape(fixture.bitmap), !replace);
    const children = editor.getSortedChildIdsForParent(group.id).map((id: string) => editor.getShape(id));
    children.forEach((shape: any, i: number) => {
      assert.equal(shape.opacity, 1, 'active opacity style must not multiply trace alpha');
      near(shape.meta.omsVectorPaint.fillOpacity * group.opacity * editor.getShape(fixture.parent).opacity, document.paths[i].paint.fillOpacity * sourceOpacity);
      const transform = editor.getShapePageTransform(shape);
      shape.props.contours.forEach((contour: any, ci: number) => contour.nodes.forEach((node: any, ni: number) => {
        const original = document.paths[i].contours[ci].nodes[ni];
        for (const key of ['anchor', 'in', 'out']) {
          const dx = key === 'anchor' ? 0 : original[`${key}X`], dy = key === 'anchor' ? 0 : original[`${key}Y`];
          const expected = sourceTransform.applyToPoint({ x: (80 - original.x - dx) * 2, y: (original.y + dy) * 2 });
          const actual = transform.applyToPoint({ x: node.x + (key === 'anchor' ? 0 : node[`${key}X`]), y: node.y + (key === 'anchor' ? 0 : node[`${key}Y`]) });
          near(actual.x, expected.x); near(actual.y, expected.y);
        }
      }));
    });
    const exported = dxf.buildCadDxf(editor, 'selected', cad.DEFAULT_CAD_SETTINGS);
    assert.deepEqual(exported.omitted, []); assert.equal(exported.closedContours, 3, 'selected native group must export its children and hole');
    editor.undo(); assert.deepEqual(snapshot(), before);
  }));

  it('inserts ungrouped regions in the same source slot and leaves a single-object result ungrouped', async () => harness(h => {
    const { editor, plans, sourceFixture, tracePlan, documentFixture, snapshot } = h;
    const fixture = sourceFixture(), before = snapshot(), plan = tracePlan(false); plan.groupResult = false;
    assert.equal(plans.applyCadPlan(editor, plan), true); assert.equal(editor.getSelectedShapeIds().length, 2);
    for (const shape of editor.getSelectedShapes()) {
      assert.equal(shape.type, 'cad-bezier'); assert.equal(shape.parentId, fixture.parent);
      assert.ok(shape.index > editor.getShape(fixture.bitmap).index && shape.index < editor.getShape(fixture.above).index);
    }
    editor.undo(); assert.deepEqual(snapshot(), before); editor.select(fixture.bitmap);
    const document = documentFixture(); document.paths.splice(1);
    assert.equal(plans.applyCadPlan(editor, tracePlan(false, document)), true);
    assert.equal(editor.getOnlySelectedShape().type, 'cad-bezier');
  }));

  it('leaves ordinary unflagged CAD plans flat and retains their active-opacity behavior', async () => harness(h => {
    const { editor, plans, genericPlan } = h;
    editor.updateInstanceState({ opacityForNextShape: .35 });
    const plan = genericPlan(); assert.equal(plan.groupResult, undefined); assert.equal(plan.placement, undefined);
    assert.equal(plans.applyCadPlan(editor, plan), true); assert.equal(editor.getSelectedShapeIds().length, 2);
    for (const shape of editor.getSelectedShapes()) {
      assert.equal(shape.parentId, editor.getCurrentPageId()); assert.equal(shape.type, 'cad-bezier'); near(shape.opacity, .35);
    }
  }));
});

describe('source singleton group history and native cleanup', () => {
  for (const replace of [false, true]) for (const objects of [1, 2])
    it(`preserves existing singleton ancestors and exact Undo/Redo with ${objects} object(s), replace ${replace}`, async () => harness(h => {
      const { editor, plans, singletonFixture, tracePlan, documentFixture, snapshot } = h;
      const fixture = singletonFixture('singleton', true), source = editor.getShape(fixture.bitmap), transform = editor.getShapePageTransform(source);
      const before = snapshot(), parent = editor.getShape(fixture.parent), outer = editor.getShape(fixture.outer), doc = documentFixture();
      doc.paths.splice(objects); editor.updateInstanceState({ opacityForNextShape: .2 });
      assert.equal(plans.applyCadPlan(editor, tracePlan(replace, doc)), true);
      const selected = editor.getOnlySelectedShape(); assert.equal(selected.parentId, fixture.parent);
      assert.equal(selected.type, objects === 1 ? 'cad-bezier' : 'group'); assert.equal(selected.opacity, 1);
      assert.deepEqual(editor.getShape(fixture.parent), parent); assert.deepEqual(editor.getShape(fixture.outer), outer);
      const painted = objects === 1 ? selected : editor.getShape(editor.getSortedChildIdsForParent(selected.id)[0]);
      near(painted.meta.omsVectorPaint.fillOpacity * painted.opacity * parent.opacity * outer.opacity, .4 * .6 * .5 * .7);
      const node = painted.props.contours[0].nodes[0], expected = transform.applyToPoint({ x: (80 - 4) * 2, y: 8 * 2 });
      const actual = editor.getShapePageTransform(painted).applyToPoint(node); near(actual.x, expected.x); near(actual.y, expected.y);
      assert.equal(!!editor.getShape(fixture.bitmap), !replace);
      const after = snapshot();
      editor.undo(); assert.deepEqual(snapshot(), before); assert.deepEqual(editor.getSelectedShapeIds(), [fixture.bitmap]);
      editor.redo(); assert.deepEqual(snapshot(), after); assert.deepEqual(editor.getSelectedShapeIds(), [selected.id]);
      editor.undo(); assert.deepEqual(snapshot(), before);
    }));

  it('keeps explicit Ungroup and focused empty-group cleanup native for protected source groups', async () => harness(h => {
    const { editor, plans, singletonFixture, tracePlan } = h;
    const first = singletonFixture('ungroup'); assert.equal(plans.applyCadPlan(editor, tracePlan()), true); editor.undo();
    editor.ungroupShapes([first.parent]);
    assert.equal(editor.getShape(first.parent), undefined); assert.equal(editor.getShape(first.bitmap).parentId, editor.getCurrentPageId());
    const second = singletonFixture('empty'); assert.equal(plans.applyCadPlan(editor, tracePlan()), true); editor.undo();
    editor.setFocusedGroup(second.parent); editor.deleteShapes([second.bitmap]);
    assert.equal(editor.getShape(second.parent), undefined); assert.equal(editor.getShape(second.bitmap), undefined);
    assert.equal(editor.getCurrentPageState().focusedGroupId, null);
  }));

  it('delegates multi-child and unrelated group changes and never alters another editor utility', async () => harness(h => {
    const { editor, tl, plans, shapeUtils, singletonFixture, tracePlan } = h;
    const util = editor.getShapeUtil('group'), native = util.onChildrenChange, observed: number[] = [];
    util.onChildrenChange = (shape: any) => { observed.push(editor.getSortedChildIdsForParent(shape.id).length); return native.call(util, shape); };
    const host = document.createElement('div'); document.body.append(host);
    const other = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
      bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
    const otherUtil = other.getShapeUtil('group'), otherHandler = otherUtil.onChildrenChange;
    try {
      assert.notEqual(util, otherUtil); assert.equal(util.editor, editor); assert.equal(otherUtil.editor, other);
      const protectedFixture = singletonFixture('protected'), unrelated = singletonFixture('unrelated'); editor.select(protectedFixture.bitmap);
      assert.equal(plans.applyCadPlan(editor, tracePlan()), true); assert.ok(observed.includes(2), 'native multi-child callback must run');
      assert.equal(otherUtil.onChildrenChange, otherHandler); editor.undo();
      editor.updateShape({ id: unrelated.bitmap, type: 'image', x: 35 });
      assert.equal(editor.getShape(unrelated.parent), undefined); assert.equal(editor.getShape(unrelated.bitmap).parentId, editor.getCurrentPageId());
      assert.ok(editor.getShape(protectedFixture.parent)); assert.equal(editor.getShape(protectedFixture.bitmap).parentId, protectedFixture.parent);
    } finally { other.dispose(); host.remove(); }
  }));

  for (const failure of ['partial-group', 'source-delete'])
    it(`preserves singleton snapshots through ${failure} rollback and releases failed protection`, async () => harness(h => {
      const { editor, plans, singletonFixture, tracePlan, snapshot } = h;
      const fixture = singletonFixture('failure', true), before = snapshot(), plan = tracePlan(true);
      const util = editor.getShapeUtil('group'), callback = util.onChildrenChange, group = editor.groupShapes.bind(editor), remove = editor.deleteShapes.bind(editor);
      if (failure === 'partial-group') editor.groupShapes = (...args: any[]) => { group(...args); throw new Error('group interrupted'); };
      else editor.deleteShapes = (ids: any[]) => { remove(ids); if (ids.includes(fixture.bitmap)) throw new Error('source deletion interrupted'); };
      try {
        assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), before);
        assert.deepEqual(editor.getSelectedShapeIds(), [fixture.bitmap]); assert.equal(util.onChildrenChange, callback);
      } finally { editor.groupShapes = group; editor.deleteShapes = remove; }
    }));

  it('retains earlier successful protection when a later trace fails and does not overwrite another callback on cleanup', async () => harness(h => {
    const { editor, plans, singletonFixture, tracePlan, snapshot } = h;
    const first = singletonFixture('retained'); assert.equal(plans.applyCadPlan(editor, tracePlan()), true); editor.undo();
    const second = singletonFixture('failed'), before = snapshot(), util = editor.getShapeUtil('group'), retained = util.onChildrenChange;
    const group = editor.groupShapes.bind(editor); let external: any;
    editor.groupShapes = (...args: any[]) => {
      group(...args); external = (shape: any) => retained.call(util, shape); util.onChildrenChange = external;
      throw new Error('another feature wrapped the callback');
    };
    try { assert.equal(plans.applyCadPlan(editor, tracePlan()), false); assert.deepEqual(snapshot(), before); assert.equal(util.onChildrenChange, external); }
    finally { editor.groupShapes = group; }
    editor.updateShape({ id: first.bitmap, type: 'image', x: 40 }); assert.ok(editor.getShape(first.parent), 'earlier protected source must survive');
    editor.updateShape({ id: second.bitmap, type: 'image', x: 40 }); assert.equal(editor.getShape(second.parent), undefined, 'failed source protection must be released');
  }));
});

describe('atomic trace output guards and rollback', () => {
  it('includes the native group in capacity before creating any record', async () => harness(h => {
    const { editor, plans, sourceFixture, tracePlan, snapshot } = h;
    sourceFixture(); const plan = tracePlan(true), before = snapshot(), initial = editor.getCurrentPageShapeIds().size;
    editor.options.maxShapesPerPage = initial + 2;
    assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), before);
    editor.options.maxShapesPerPage = initial + 3;
    assert.equal(plans.applyCadPlan(editor, plan), true); assert.equal(editor.getOnlySelectedShape().type, 'group');
  }));

  it('counts group metadata in the preview budget and catches native defaults in the final snapshot budget', async () => harness(h => {
    const { editor, plans, sourceFixture, tracePlan, snapshot } = h;
    sourceFixture(); const before = snapshot(), oversized = tracePlan(true); oversized.groupName = 'x'.repeat(1_900_000);
    assert.equal(plans.applyCadPlan(editor, oversized), false); assert.deepEqual(snapshot(), before);
    const plan = tracePlan(true), original = editor.getInitialMetaForShape.bind(editor);
    editor.getInitialMetaForShape = (shape: any) => shape.type === 'group' ? { oversized: 'x'.repeat(1_900_000) } : original(shape);
    try { assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), before); }
    finally { editor.getInitialMetaForShape = original; }
  }));

  for (const failure of ['refused-group', 'partial-group', 'source-delete']) it(`rolls back every record and the source after ${failure}`, async () => harness(h => {
    const { editor, plans, sourceFixture, tracePlan, snapshot } = h;
    const fixture = sourceFixture(), before = snapshot(), plan = tracePlan(true);
    const group = editor.groupShapes.bind(editor), remove = editor.deleteShapes.bind(editor);
    if (failure === 'refused-group') editor.groupShapes = () => editor;
    if (failure === 'partial-group') editor.groupShapes = (...args: any[]) => { group(...args); throw new Error('group creation interrupted'); };
    if (failure === 'source-delete') editor.deleteShapes = (ids: any[]) => { remove(ids); throw new Error('source deletion interrupted'); };
    try {
      assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), before);
      assert.ok(editor.getShape(fixture.bitmap)); assert.deepEqual(editor.getSelectedShapeIds(), [fixture.bitmap]);
    } finally { editor.groupShapes = group; editor.deleteShapes = remove; }
  }));

  it('rejects changed, locked, readonly, or unbound placement without partial output', async () => harness(h => {
    const { editor, plans, sourceFixture, tracePlan, snapshot } = h;
    const fixture = sourceFixture(true), original = snapshot(), plan = tracePlan(false);
    const unbound = { ...plan, sourceIds: [] }; assert.equal(plans.applyCadPlan(editor, unbound), false); assert.deepEqual(snapshot(), original);
    const wrongParent = { ...plan, placement: { ...plan.placement, parentId: editor.getCurrentPageId() } };
    assert.equal(plans.applyCadPlan(editor, wrongParent), false); assert.deepEqual(snapshot(), original);
    editor.updateInstanceState({ isReadonly: true }); assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), original);
    editor.updateInstanceState({ isReadonly: false }); editor.updateShape({ id: fixture.parent, type: 'group', isLocked: true });
    const locked = snapshot(); assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), locked);
    editor.updateShape({ id: fixture.parent, type: 'group', isLocked: false }); editor.updateShape({ id: fixture.bitmap, type: 'image', x: 50 });
    const moved = snapshot(); assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), moved);
  }));

  it('rejects foreign-page targets and malformed parent cycles before native parent traversal', async () => harness(h => {
    const { editor, tl, plans, sourceFixture, tracePlan, genericPlan, snapshot } = h;
    const fixture = sourceFixture(true), plan = tracePlan(false), before = snapshot(), getShape = editor.getShape.bind(editor);
    editor.getShape = (id: any) => { const shape = getShape(id); return id === fixture.parent && shape ? { ...shape, parentId: fixture.parent } : shape; };
    try { assert.equal(plans.applyCadPlan(editor, plan), false); assert.deepEqual(snapshot(), before); }
    finally { editor.getShape = getShape; }
    const page = editor.getCurrentPageId(), other = tl.PageRecordType.create({ id: tl.PageRecordType.createId('trace-foreign'), name: 'Other', index: 'a2' });
    editor.store.put([other]); editor.setCurrentPage(other.id);
    const bitmap = tl.createShapeId('foreign-source'); editor.createShape({ id: bitmap, type: 'image', props: { w: 80, h: 40 } });
    editor.setCurrentPage(page);
    const foreign = genericPlan(); foreign.sourceIds = [bitmap]; foreign.placement = { parentId: other.id, aboveId: bitmap };
    const current = snapshot(); assert.equal(plans.applyCadPlan(editor, foreign), false); assert.deepEqual(snapshot(), current);
  }));
});
