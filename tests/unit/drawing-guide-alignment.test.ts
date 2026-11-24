import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, HistoryManager, LineShapeUtil, PageRecordType, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { applyArrangePlan, prepareArrangePlan, type ArrangeOptions } from '../../src/lib/components/canvas/drawing-arrange';
import { applyDrawingGuideChange, prepareDrawingGuideChange, readDrawingGuides,
  guidePositionFromUnit, guidePositionToUnit } from '../../src/lib/components/canvas/drawing-guides';
import { CAD_MAX_COORDINATE, DEFAULT_CAD_SETTINGS, type CadSettings } from '../../src/lib/components/canvas/cad-settings';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { CadEllipseShapeUtil } from '../../src/lib/components/canvas/shapes/CadShapes';
import { getCadShapePageProjection } from '../../src/lib/components/canvas/cad-projected-bounds';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const errorCode = (expected: string) => (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === expected;
type Fixture = ReturnType<typeof fixture>;
type GuideAlignment = Extract<ArrangeOptions, { kind: 'align' }>;
const align = (axis: 'x' | 'y', alignment: 'start' | 'center' | 'end', position: number, together?: boolean): GuideAlignment =>
  ({ kind: 'align', axis, alignment, reference: { position, ...(together === undefined ? {} : { together }) } });
const artwork = (f: Fixture) => structuredClone([...f.shapes.values()]);
const shape = (f: Fixture, id = 'a') => f.editor.getShape(`shape:${id}`);
function setup(multiple = false) {
  const f = fixture();
  f.editor.createShape({ id: 'shape:a', type: 'cad-ellipse', x: 10, y: 20, opacity: .6,
    props: { w: 20, h: 10 }, meta: { omsObjectName: 'Letter A', retained: { material: 'acrylic' } } });
  if (multiple) f.editor.createShape({ id: 'shape:b', type: 'cad-ellipse', x: 100, y: 70, props: { w: 40, h: 30 } });
  f.editor.setSelectedShapes(multiple ? ['shape:b', 'shape:a'] : ['shape:a']);
  return f;
}
function apply(f: Fixture, options: GuideAlignment) {
  const plan = prepareArrangePlan(f.editor, options);
  assert.equal(applyArrangePlan(f.editor, plan), true);
  return plan;
}
function addGuide(f: Fixture, axis: 'x' | 'y' = 'x', position = 300) {
  const plan = prepareDrawingGuideChange(f.editor, { kind: 'add', axis, position, id: 'guide:alignment' });
  assert.equal(applyDrawingGuideChange(f.editor, plan), true);
  const guide = readDrawingGuides(f.editor).guides[0];
  assert.ok(guide && guide.axis !== 'angle');
  return guide;
}

/** The existing geometry fixture supplies the non-DOM editor surface. These
 * adapters use the real tldraw schema, Store and HistoryManager for Undo/Redo;
 * no alignment calculation or history implementation is duplicated here. */
function withNativeHistory(f: Fixture) {
  const store = createTLStore({ shapeUtils: [...defaultShapeUtils, CadEllipseShapeUtil] });
  const page = PageRecordType.create({ id: PageRecordType.createId('one'), name: 'Guide alignment', index: 'a1' as any,
    meta: f.editor.getCurrentPage().meta });
  const records = artwork(f).map((value, index) => store.schema.types.shape.create({ ...value, index: `a${index + 1}` }));
  store.put([page, ...records]);
  for (const value of records) f.shapes.set(value.id, value);
  const history = new HistoryManager({ store });
  const stop = store.sideEffects.registerAfterChangeHandler('shape', (_before, after) => { f.shapes.set(after.id, after); });
  f.editor.store = store;
  f.editor.getCurrentPage = () => store.get(page.id);
  f.editor.mark = history.mark.bind(history);
  f.editor.run = history.batch;
  f.editor.bailToMark = history.bailToMark;
  f.editor.updateShapes = (patches: Array<Partial<TLShape> & { id: TLShapeId }>) => store.put(patches.map(patch => {
    const previous = store.get(patch.id) as TLShape;
    return { ...previous, ...patch, props: { ...previous.props, ...patch.props } } as TLShape;
  }));
  return { store, history, dispose() { stop(); history.dispose(); } };
}

describe('Alignment to a guideline coordinate', () => {
  it('projects the common artwork center onto an angled guide without changing motif spacing or rotation', () => {
    const f = setup(true), before = artwork(f);
    const plan = prepareArrangePlan(f.editor, { kind: 'align-guide', point: { x: 0, y: 0 }, normal: { x: 2, y: 2 }, together: true });
    assert.equal(applyArrangePlan(f.editor, plan), true);
    // Combined bounds center is (75, 60), projected onto x + y = 0.
    near(shape(f).x, 10 - 67.5); near(shape(f).y, 20 - 67.5);
    near(shape(f, 'b').x - shape(f).x, 90); near(shape(f, 'b').y - shape(f).y, 50);
    for (const old of before) {
      const current = f.editor.getShape(old.id);
      assert.deepEqual(current.props, old.props); assert.equal(current.rotation, old.rotation);
    }
  });

  it('centers objects independently on an angled guide with one real Undo and Redo', () => {
    const f = setup(true), native = withNativeHistory(f);
    try {
      const before = artwork(f);
      const plan = prepareArrangePlan(f.editor, { kind: 'align-guide', point: { x: 50, y: 0 }, normal: { x: 1, y: -1 }, together: false });
      assert.equal(applyArrangePlan(f.editor, plan), true);
      for (const id of ['a', 'b']) {
        const current = shape(f, id);
        near(current.x + current.props.w / 2 - current.y - current.props.h / 2, 50);
      }
      const after = artwork(f);
      native.history.undo(); assert.deepEqual(artwork(f), before);
      native.history.redo(); assert.deepEqual(artwork(f), after);
    } finally { native.dispose(); }
  });

  for (const [axis, alignment, target, expectedX, expectedY] of [
    ['x', 'start', 200, 200, 20], ['x', 'center', 200, 190, 20], ['x', 'end', 200, 180, 20],
    ['y', 'start', -50, 10, -50], ['y', 'center', -50, 10, -55], ['y', 'end', -50, 10, -60],
  ] as const) it(`aligns one object's ${axis} ${alignment} to the coordinate`, () => {
    const f = setup(), before = structuredClone(shape(f));
    const plan = apply(f, align(axis, alignment, target));
    near(shape(f).x, expectedX); near(shape(f).y, expectedY);
    assert.deepEqual(shape(f), { ...before, x: expectedX, y: expectedY });
    assert.equal(plan.moved, 1); assert.deepEqual(f.editor.getSelectedShapeIds(), ['shape:a']);
  });

  it('moves a multi-object motif rigidly by its common edge and center by default', () => {
    const f = setup(true), before = artwork(f);
    apply(f, align('x', 'end', 400));
    near(shape(f).x, 270); near(shape(f, 'b').x, 360);
    apply(f, align('y', 'center', -100));
    near(shape(f).y, -140); near(shape(f, 'b').y, -90);
    near(shape(f, 'b').x - shape(f).x, 90); near(shape(f, 'b').y - shape(f).y, 50);
    for (const old of before) {
      const current = f.editor.getShape(old.id);
      assert.deepEqual(current.props, old.props); assert.deepEqual(current.meta, old.meta);
      assert.equal(current.parentId, old.parentId); assert.equal(current.rotation, old.rotation);
    }
    assert.deepEqual(f.editor.getSelectedShapeIds(), ['shape:b', 'shape:a']);
  });

  it('aligns each root independently only when together is explicitly false', () => {
    const f = setup(true);
    apply(f, align('x', 'end', 400, false));
    near(shape(f).x, 380); near(shape(f, 'b').x, 360);
    apply(f, align('y', 'center', -100, false));
    near(shape(f).y, -105); near(shape(f, 'b').y, -115);
    near(shape(f).props.w, 20); near(shape(f, 'b').props.w, 40);
  });

  it('uses the exact cubic extreme rather than the control hull or selection box', () => {
    const f = fixture(), a = nodeAt({ x: 0, y: 0 }), b = nodeAt({ x: 100, y: 0 });
    a.outY = -80; b.inY = -80;
    f.editor.createShape({ id: 'shape:arch', type: 'cad-bezier', x: 20, y: 200, props: { contours: [{ closed: false, nodes: [a, b] }] } });
    f.editor.setSelectedShapes(['shape:arch']);
    const before = structuredClone(shape(f, 'arch'));
    apply(f, align('y', 'start', 0));
    // This cubic reaches y = -60 at its middle, while its controls reach -80.
    near(shape(f, 'arch').y, 60); near(shape(f, 'arch').x, 20);
    assert.deepEqual(shape(f, 'arch').props, before.props);
  });

  it('moves a nested rotated group in page axes without moving a selected child twice', () => {
    const f = setup(true);
    f.editor.createShape({ id: 'shape:outer', type: 'group', x: 200, y: 100, rotation: Math.PI / 2 });
    f.editor.createShape({ id: 'shape:inner', type: 'group', parentId: 'shape:outer', x: 30, y: 40, rotation: Math.PI / 2 });
    f.editor.updateShape({ id: 'shape:a', parentId: 'shape:inner', x: 10, y: 20, props: { w: 40, h: 10 } });
    f.editor.updateShape({ id: 'shape:b', parentId: 'shape:inner', x: 80, y: 50, props: { w: 20, h: 30 } });
    f.editor.setSelectedShapes(['shape:inner', 'shape:a']);
    const a = structuredClone(shape(f)), b = structuredClone(shape(f, 'b')), outer = structuredClone(shape(f, 'outer'));
    const plan = apply(f, align('x', 'start', 500));
    // Two 90-degree parents make the original group span x = 60 .. 150.
    near(shape(f, 'inner').x, 30); near(shape(f, 'inner').y, -400);
    const originA = f.editor.getShapePageTransform('shape:a').point();
    const originB = f.editor.getShapePageTransform('shape:b').point();
    near(originA.x - 40, 550); near(originB.x - 20, 500);
    near(originA.y, 110); near(originB.y, 80);
    assert.deepEqual(shape(f), a); assert.deepEqual(shape(f, 'b'), b); assert.deepEqual(shape(f, 'outer'), outer);
    assert.equal(plan.moved, 1); assert.equal(f.shapes.size, 4);
  });

  it('converts physical guide coordinates using origin, scale and upward Y, independent of zoom', () => {
    for (const [unit, x, y, zoom] of [['mm', 25.4, 50.8, .25], ['in', 1, 2, 8]] as const) {
      const f = setup(), settings: CadSettings = { ...DEFAULT_CAD_SETTINGS, unit, scale: 2, originX: 70, originY: 900 };
      f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCad: settings } }); f.state.zoom = zoom;
      const guideX = guidePositionFromUnit('x', x, settings), guideY = guidePositionFromUnit('y', y, settings);
      near(guideX, 118); near(guideY, 804);
      apply(f, align('x', 'center', guideX)); apply(f, align('y', 'end', guideY));
      near(shape(f).x, 108); near(shape(f).y, 794);
      near(guidePositionToUnit('x', shape(f).x + 10, settings), x);
      near(guidePositionToUnit('y', shape(f).y + 10, settings), y);
    }
  });
});

describe('Exact start and end support on angled guidelines', () => {
  it('checks true page-axis extrema near the coordinate limit, including native cubic overshoot', () => {
    const f = fixture(); f.utils.line = new LineShapeUtil(f.editor);
    f.editor.createShape({ id: 'shape:native-limit', type: 'line', props: { spline: 'cubic', dash: 'solid', points: Object.fromEntries(
      [[0, 0], [80, 100], [150, -20], [160, -80]].map(([x, y], i) => [`a${i + 1}`, { id: `a${i + 1}`, index: `a${i + 1}`, x, y }])) } });
    f.editor.setSelectedShapes(['shape:native-limit']);
    const source = f.editor.getShape('shape:native-limit'), normal = { x: .6, y: .8 };
    const actual = getCadShapePageProjection(f.editor, source, { x: 0, y: 1 })!, sampled = f.editor.getShapePageBounds(source);
    assert.ok(actual.max - sampled.maxY > 1e-6, 'fixture must expose the native sampled-bound gap');
    const support = getCadShapePageProjection(f.editor, source, normal)!;
    const options = (dy: number): ArrangeOptions => {
      const target = support.min + dy / normal.y;
      return { kind: 'align-guide', normal, point: { x: target * normal.x, y: target * normal.y }, alignment: 'start' };
    };
    const before = artwork(f), outside = CAD_MAX_COORDINATE - (actual.max + sampled.maxY) / 2;
    assert.throws(() => prepareArrangePlan(f.editor, options(outside)), errorCode('arrangeBounds'));
    assert.deepEqual(artwork(f), before);
    const safe = prepareArrangePlan(f.editor, options(CAD_MAX_COORDINATE - actual.max - .0001));
    assert.equal(applyArrangePlan(f.editor, safe), true);
    near(getCadShapePageProjection(f.editor, f.editor.getShape(source.id), { x: 0, y: 1 })!.max, CAD_MAX_COORDINATE - .0001);
  });

  const normal = { x: .6, y: .8 }, point = { x: 50, y: 80 }, target = 94;
  const projected = (f: Fixture, id = 'a') => getCadShapePageProjection(f.editor, shape(f, id), normal)!;

  for (const alignment of ['start', 'end'] as const) it(`touches a slanted guide with the ellipse's exact ${alignment} edge`, () => {
    const f = setup(), before = structuredClone(shape(f));
    const plan = prepareArrangePlan(f.editor, { kind: 'align-guide', alignment, point, normal });
    assert.equal(applyArrangePlan(f.editor, plan), true);
    // Original center projects to 32; the support radius is sqrt(52), not
    // the AABB support radius of 10. This catches rotated-AABB shortcuts.
    const distance = target - 32 + (alignment === 'start' ? 1 : -1) * Math.sqrt(52);
    near(shape(f).x, before.x + distance * .6); near(shape(f).y, before.y + distance * .8);
    near(projected(f)[alignment === 'start' ? 'min' : 'max'], target);
    assert.deepEqual(shape(f).props, before.props); assert.equal(shape(f).rotation, before.rotation);
    assert.deepEqual(shape(f).meta, before.meta);
  });

  it('combines exact leaf supports for nested groups and preserves spacing when moving together', () => {
    const f = setup(true);
    f.editor.createShape({ id: 'shape:outer', type: 'group', x: 200, y: 100, rotation: Math.PI / 3 });
    f.editor.createShape({ id: 'shape:inner', type: 'group', parentId: 'shape:outer', x: 30, y: 40, rotation: Math.PI / 7 });
    f.editor.updateShape({ id: 'shape:a', parentId: 'shape:inner' });
    f.editor.updateShape({ id: 'shape:b', parentId: 'shape:inner' });
    f.editor.createShape({ id: 'shape:c', type: 'cad-path', x: 500, y: 200,
      props: { closed: true, points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 10, y: 40 }] } });
    f.editor.setSelectedShapes(['shape:inner', 'shape:a', 'shape:c']);
    const leafBefore = structuredClone([shape(f), shape(f, 'b')]);
    const origins = ['a', 'b', 'c'].map(id => f.editor.getShapePageTransform(`shape:${id}`).point());
    const plan = prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'end', point, normal, together: true });
    assert.equal(plan.placements.length, 2, 'a selected descendant is moved only through its selected root');
    assert.equal(applyArrangePlan(f.editor, plan), true);
    near(Math.max(...['a', 'b', 'c'].map(id => projected(f, id).max)), target);
    const deltas = ['a', 'b', 'c'].map((id, i) => {
      const after = f.editor.getShapePageTransform(`shape:${id}`).point();
      return { x: after.x - origins[i].x, y: after.y - origins[i].y };
    });
    for (const delta of deltas) { near(delta.x, deltas[0].x); near(delta.y, deltas[0].y); }
    assert.deepEqual([shape(f), shape(f, 'b')], leafBefore, 'child coordinates and shape content stay unchanged');
  });

  it('aligns separate exact edges in one native undo step and keeps a repeated no-op out of history', () => {
    const f = setup(true), native = withNativeHistory(f), before = artwork(f);
    try {
      const options: ArrangeOptions = { kind: 'align-guide', alignment: 'start', point, normal, together: false };
      assert.equal(applyArrangePlan(f.editor, prepareArrangePlan(f.editor, options)), true);
      near(projected(f).min, target); near(projected(f, 'b').min, target);
      const after = artwork(f), undoCount = native.history.getNumUndos();
      const noOp = prepareArrangePlan(f.editor, options); assert.equal(noOp.moved, 0);
      assert.equal(applyArrangePlan(f.editor, noOp), true); assert.equal(native.history.getNumUndos(), undoCount);
      native.history.undo(); assert.deepEqual(artwork(f), before);
      native.history.redo(); assert.deepEqual(artwork(f), after);
    } finally { native.dispose(); }
  });

  it('swaps start and end when the guide direction reverses and normalizes the distance', () => {
    const f = setup();
    const start = prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'start', point, normal });
    const reverseEnd = prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'end', point, normal: { x: -6, y: -8 } });
    near(start.placements[0].delta.x, reverseEnd.placements[0].delta.x);
    near(start.placements[0].delta.y, reverseEnd.placements[0].delta.y);
    for (const invalid of [{ x: 0, y: 0 }, { x: Infinity, y: 1 }, { x: NaN, y: 1 }])
      assert.throws(() => prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'start', point, normal: invalid }), errorCode('arrangeBounds'));
    assert.throws(() => prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'near' as any, point, normal }), errorCode('arrangeFailed'));
  });

  it('refuses a mixed exact/sampled selection without weakening existing center alignment or protections', () => {
    const f = setup(true);
    f.editor.updateShape({ id: 'shape:b', type: 'draw' });
    const before = artwork(f);
    for (const alignment of ['start', 'end'] as const)
      assert.throws(() => prepareArrangePlan(f.editor, { kind: 'align-guide', alignment, point, normal }), errorCode('arrangeGuideGeometry'));
    assert.deepEqual(artwork(f), before); assert.equal(f.marks.length, 0);
    assert.ok(prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'center', point, normal }));
    f.editor.updateShape({ id: 'shape:a', isLocked: true });
    assert.throws(() => prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'end', point, normal }), errorCode('arrangeProtected'));
  });

  it('enforces an aggregate projection budget across every leaf of a selected group', () => {
    const f = fixture(), nodes = Array.from({ length: 4096 }, (_, i) => nodeAt({ x: i, y: i % 2 }));
    f.editor.createShape({ id: 'shape:group', type: 'group' });
    for (let i = 0; i < 5; i++) f.editor.createShape({ id: `shape:curve${i}`, type: 'cad-bezier', parentId: 'shape:group',
      props: { contours: [{ closed: false, nodes }] } });
    f.editor.setSelectedShapes(['shape:group']);
    assert.throws(() => prepareArrangePlan(f.editor, { kind: 'align-guide', alignment: 'start', point, normal }), errorCode('arrangeGuideGeometry'));
    assert.equal(f.marks.length, 0);
  });

  it('rolls back a native update that changes oblique support while retaining the same page AABB', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:triangle', type: 'cad-path', props: { closed: true,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] } });
    f.editor.setSelectedShapes(['shape:triangle']);
    const before = artwork(f), plan = prepareArrangePlan(f.editor,
      { kind: 'align-guide', alignment: 'end', point, normal: { x: .6, y: -.8 } });
    const update = f.editor.updateShapes;
    f.editor.updateShapes = (patches: any[]) => update(patches.map(patch => ({ ...patch,
      props: { points: [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }] },
    })));
    assert.equal(applyArrangePlan(f.editor, plan), false); assert.deepEqual(artwork(f), before); assert.equal(f.marks.length, 0);
  });
});

describe('Guide alignment history and revision guards', () => {
  it('uses one native Undo/Redo step and keeps a no-op out of history', () => {
    const f = setup(true), native = withNativeHistory(f), before = artwork(f);
    try {
      const count = native.history.getNumUndos();
      assert.equal(apply(f, align('x', 'start', 10)).moved, 0);
      assert.equal(native.history.getNumUndos(), count);
      apply(f, align('x', 'end', 400));
      const after = artwork(f); assert.notDeepEqual(after, before);
      native.history.undo(); assert.deepEqual(artwork(f), before);
      const redos = native.history.getNumRedos(); assert.ok(redos > 0);
      assert.equal(apply(f, align('x', 'start', 10)).moved, 0);
      assert.equal(native.history.getNumRedos(), redos);
      native.history.redo(); assert.deepEqual(artwork(f), after);
    } finally { native.dispose(); }
  });

  for (const change of ['move', 'remove', 'lock', 'visibility'] as const) it(`rejects a prepared alignment after the guide's ${change} changes`, () => {
    const f = setup(), guide = addGuide(f), plan = prepareArrangePlan(f.editor, align(guide.axis, 'center', guide.position));
    const edit = change === 'move' ? { kind: 'move' as const, id: guide.id, position: 350 }
      : change === 'remove' ? { kind: 'remove' as const, ids: [guide.id] }
        : change === 'lock' ? { kind: 'guide-locked' as const, id: guide.id, locked: true }
          : { kind: 'guide-visible' as const, id: guide.id, visible: false };
    assert.equal(applyDrawingGuideChange(f.editor, prepareDrawingGuideChange(f.editor, edit)), true);
    const before = artwork(f), page = structuredClone(f.editor.getCurrentPage()), marks = f.marks.length;
    assert.equal(applyArrangePlan(f.editor, plan), false);
    assert.deepEqual(artwork(f), before); assert.deepEqual(f.editor.getCurrentPage(), page); assert.equal(f.marks.length, marks);
  });

  for (const change of ['calibration', 'page', 'selection'] as const) it(`rejects a prepared alignment after ${change} changes`, () => {
    const f = setup(true), plan = prepareArrangePlan(f.editor, align('x', 'start', 300));
    if (change === 'calibration') f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCad: { ...DEFAULT_CAD_SETTINGS, originX: 40, scale: 10 } } });
    if (change === 'page') f.editor.updatePage({ id: 'page:other' });
    if (change === 'selection') f.editor.setSelectedShapes(['shape:a']);
    const before = artwork(f);
    assert.equal(applyArrangePlan(f.editor, plan), false); assert.deepEqual(artwork(f), before); assert.equal(f.marks.length, 0);
  });

  it('rechecks read-only state after preparation and after completing a tool', () => {
    for (const duringComplete of [false, true]) {
      const f = setup(true), plan = prepareArrangePlan(f.editor, align('y', 'center', 300)), before = artwork(f);
      if (duringComplete) f.editor.complete = () => { f.state.isReadonly = true; };
      else f.state.isReadonly = true;
      assert.equal(applyArrangePlan(f.editor, plan), false); assert.deepEqual(artwork(f), before); assert.equal(f.marks.length, 0);
    }
  });
});

describe('Guide alignment protections and atomic failure', () => {
  for (const protection of ['readonly', 'locked-root', 'locked-descendant', 'locked-ancestor', 'form-root', 'form-descendant', 'form-ancestor'] as const)
    it(`refuses ${protection} without changing artwork`, () => {
      const f = setup(true);
      if (protection === 'readonly') f.state.isReadonly = true;
      if (protection === 'locked-root') f.editor.updateShape({ id: 'shape:a', isLocked: true });
      if (protection === 'form-root') f.editor.updateShape({ id: 'shape:a', type: 'order-details' });
      if (['locked-descendant', 'locked-ancestor', 'form-descendant', 'form-ancestor'].includes(protection)) {
        f.editor.createShape({ id: 'shape:group', type: protection === 'form-ancestor' ? 'order-address' : 'group', isLocked: protection === 'locked-ancestor' });
        f.editor.updateShape({ id: 'shape:a', parentId: 'shape:group', isLocked: protection === 'locked-descendant',
          ...(protection === 'form-descendant' ? { type: 'profile-7st' } : {}) });
        f.editor.setSelectedShapes(protection.endsWith('descendant') ? ['shape:group', 'shape:b'] : ['shape:a', 'shape:b']);
      }
      const before = artwork(f);
      assert.throws(() => prepareArrangePlan(f.editor, align('x', 'start', 300)), errorCode('arrangeProtected'));
      assert.deepEqual(artwork(f), before); assert.equal(f.marks.length, 0);
    });

  for (const protection of ['mask', 'clip', 'binding', 'frame'] as const) it(`refuses unsupported ${protection} geometry`, () => {
    const f = setup();
    if (protection === 'mask') f.editor.updateShape({ id: 'shape:a', mask: [{}] });
    if (protection === 'clip') f.editor.updateShape({ id: 'shape:a', meta: { omsVectorPaint: { clips: [{}] } } });
    if (protection === 'binding') f.state.bindings = [{}];
    if (protection === 'frame') {
      f.editor.createShape({ id: 'shape:frame', type: 'frame' }); f.editor.updateShape({ id: 'shape:a', parentId: 'shape:frame' });
    }
    const before = artwork(f);
    assert.throws(() => prepareArrangePlan(f.editor, align('y', 'end', 300)), errorCode('arrangeUnsupported'));
    assert.deepEqual(artwork(f), before); assert.equal(f.marks.length, 0);
  });

  for (const failure of ['refused', 'partial', 'clamped', 'thrown', 'capacity'] as const) it(`rolls back all artwork on ${failure} update failure`, () => {
    const f = setup(true), before = artwork(f), selected = [...f.editor.getSelectedShapeIds()], plan = prepareArrangePlan(f.editor, align('x', 'start', 300));
    const update = f.editor.updateShapes;
    if (failure === 'refused') f.editor.updateShapes = () => {};
    if (failure === 'partial') f.editor.updateShapes = (patches: any[]) => update(patches.slice(0, 1));
    if (failure === 'clamped') f.editor.updateShapes = (patches: any[]) => update(patches.map(patch => ({ ...patch, x: patch.x + 1 })));
    if (failure === 'thrown') f.editor.updateShapes = (patches: any[]) => { update(patches.slice(0, 1)); throw new Error('Interrupted multi-object write'); };
    if (failure === 'capacity') f.editor.store = { getStoreSnapshot: () => ({ payload: 'x'.repeat(1_900_001) }) };
    assert.equal(applyArrangePlan(f.editor, plan), false);
    assert.deepEqual(artwork(f), before); assert.deepEqual(f.editor.getSelectedShapeIds(), selected); assert.equal(f.marks.length, 0);
  });

  it('rejects nonfinite or out-of-range guide coordinates and shapes that would cross the geometry limit', () => {
    const f = setup(), before = artwork(f);
    for (const coordinate of [NaN, Infinity, -Infinity, CAD_MAX_COORDINATE + 1, -CAD_MAX_COORDINATE - 1])
      assert.throws(() => prepareArrangePlan(f.editor, align('x', 'center', coordinate)), errorCode('arrangeBounds'));
    assert.throws(() => prepareArrangePlan(f.editor, align('x', 'start', CAD_MAX_COORDINATE)), errorCode('arrangeBounds'));
    assert.deepEqual(artwork(f), before); assert.equal(f.marks.length, 0);
  });
});
