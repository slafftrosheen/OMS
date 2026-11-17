import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { applySkewPlan, prepareSkewPlan, readSkewSelection, skewPoint, type SkewOptions } from '../../src/lib/components/canvas/drawing-skew';
import { TRANSFORM_ANCHORS, transformAnchorPoint } from '../../src/lib/components/canvas/drawing-transform';
import { contourSegments, cubicAt, mapContours, nodeAt, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';

const near = (a: number, b: number, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) => { near(a.x, b.x); near(a.y, b.y); };
const options = (patch: Partial<SkewOptions> = {}): SkewOptions => ({ axis: 'horizontal', angle: 45, anchor: 'center', keepOriginal: false, ...patch });
const rectangle = (x = 0, y = 0, w = 100, h = 50): CadContour => ({ closed: true, nodes: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(nodeAt) });
const base = (id: string, type: string, props: any, extra: any = {}): any => ({ id: `shape:${id}`, type, typeName: 'shape', parentId: 'page:a', index: 'a1', x: 0, y: 0, rotation: 0, opacity: 1, isLocked: false, props, meta: {}, ...extra });
const path = (id: string, extra: any = {}) => base(id, 'cad-path', { points: rectangle().nodes.map(({ x, y }) => ({ x, y })), closed: true, color: 'black' }, extra);
const bezier = (id: string, contours: CadContour[] = [rectangle()], extra: any = {}) => base(id, 'cad-bezier', { contours, fillRule: 'evenodd', color: 'black' }, extra);
const group = (id: string, extra: any = {}) => base(id, 'group', {}, extra);

function canvas(initial: any[], selected = initial.filter(s => s.parentId === 'page:a').map(s => s.id)) {
  let records = new Map(initial.map(s => [s.id, structuredClone(s)])), ids = [...selected], readonly = false;
  let snapshot: { records: Array<[string, any]>; ids: string[] };
  let refuse = false, incomplete = false, clamp = false, failAfter = false, oversized = '';
  let marks = 0, rollbacks = 0, updates = 0, creates = 0;
  const page = { id: 'page:a', meta: { omsCad: { version: 1, unit: 'mm', scale: 1, precision: 2, originX: 0, originY: 0, nudge: 1 } } };
  const matrix = (input: any): any => {
    const shape = typeof input === 'string' ? records.get(input) : input;
    const parent = records.get(shape.parentId), up = parent ? matrix(parent) : null;
    const origin = up ? up.applyToPoint(shape) : { x: shape.x, y: shape.y }, angle = shape.rotation + (up?.rotation() ?? 0);
    return { point: () => ({ ...origin }), rotation: () => angle,
      applyToPoint: (p: any) => ({ x: origin.x + p.x * Math.cos(angle) - p.y * Math.sin(angle), y: origin.y + p.x * Math.sin(angle) + p.y * Math.cos(angle) }) };
  };
  const descendants = (roots: string[]) => {
    const result = new Set(roots);
    for (const id of result) for (const shape of records.values()) if (shape.parentId === id) result.add(shape.id);
    return result;
  };
  const editor: any = {
    options: { maxShapesPerPage: 2000 },
    getShape: (id: string) => records.get(id), getSelectedShapeIds: () => [...ids], setSelectedShapes: (next: string[]) => { ids = [...next]; },
    getCurrentPage: () => page, getCurrentPageShapeIds: () => new Set(records.keys()), getCurrentPageShapesSorted: () => [...records.values()],
    getShapeAndDescendantIds: descendants, getInstanceState: () => ({ isReadonly: readonly }),
    isShapeOrAncestorLocked: (s: any): boolean => s.isLocked || !!(records.get(s.parentId) && editor.isShapeOrAncestorLocked(records.get(s.parentId))),
    getShapeMask: (id: string) => records.get(id)?.masked, getBindingsInvolvingShape: (id: string) => records.get(id)?.bound ? [{}] : [],
    getShapePageTransform: matrix,
    getSortedChildIdsForParent: (id: string) => [...records.values()].filter(shape => shape.parentId === id).sort((a, b) => a.index < b.index ? -1 : a.index > b.index ? 1 : 0).map(shape => shape.id),
    store: { getStoreSnapshot: () => ({ records: [...records.values()], oversized }) },
    getCamera: () => ({ x: 10, y: 20, z: 2 }), setCamera: () => {}, complete: () => {}, setCurrentTool: () => {},
    mark: (mark: string) => { marks++; if (!mark.endsWith('-complete')) snapshot = { records: structuredClone([...records]), ids: [...ids] }; },
    run: (fn: () => void) => fn(),
    bailToMark: () => { rollbacks++; records = new Map(snapshot.records); ids = [...snapshot.ids]; },
    undo: () => { records = new Map(snapshot.records); ids = [...snapshot.ids]; },
    updateShapes: (patches: any[]) => {
      if (refuse) return;
      for (const patch of patches) {
        updates++;
        const shape = records.get(patch.id);
        const props = { ...shape.props, ...structuredClone(patch.props) };
        if (clamp && props.points) props.points[0].x = 0;
        records.set(patch.id, { ...shape, ...structuredClone(patch), props });
        if (failAfter) throw new Error('Interrupted update');
      }
    },
    createShapes: (newShapes: any[]) => {
      if (refuse) return;
      for (const shape of newShapes) {
        creates++;
        if (incomplete && shape.id === newShapes.at(-1).id) continue;
        records.set(shape.id, structuredClone(shape));
        if (failAfter) throw new Error('Interrupted creation');
      }
    },
  };
  return { editor, page, get: (id: string) => records.get(`shape:${id}`) ?? records.get(id), all: () => [...records.values()],
    select: (next: string[]) => { ids = [...next]; }, readonly: () => { readonly = true; }, refuse: () => { refuse = true; },
    clamp: () => { clamp = true; }, incomplete: () => { incomplete = true; }, failAfter: () => { failAfter = true; },
    oversize: (length: number) => { oversized = 'x'.repeat(length); }, stats: () => ({ marks, rollbacks, updates, creates }) };
}

describe('Exact curve skew geometry', () => {
  it('uses horizontal and vertical physical-page angle directions', () => {
    samePoint(skewPoint({ x: 10, y: -20 }, { x: 0, y: 0 }, 'horizontal', 45), { x: 30, y: -20 });
    samePoint(skewPoint({ x: 10, y: -20 }, { x: 0, y: 0 }, 'vertical', 45), { x: 10, y: -30 });
  });
  it('keeps every one of the nine reference points fixed', () => {
    for (const anchor of TRANSFORM_ANCHORS) {
      const c = canvas([path('a')]), plan = prepareSkewPlan(c.editor, options({ anchor }));
      const pivot = transformAnchorPoint({ x: 0, y: 0, w: 100, h: 50 }, anchor);
      samePoint(plan.anchor, pivot);
      samePoint(skewPoint(pivot, pivot, 'horizontal', 45), pivot);
      samePoint(skewPoint(pivot, pivot, 'vertical', -45), pivot);
    }
  });
  it('has an exact inverse for both axes, including negative angles', () => {
    for (const axis of ['horizontal', 'vertical'] as const) for (const angle of [-80, -35, 15, 80]) {
      const anchor = { x: -123.4, y: 567.8 }, point = { x: 29.3, y: -91.4 };
      samePoint(skewPoint(skewPoint(point, anchor, axis, angle), anchor, axis, -angle), point);
    }
  });
  it('calculates physical extents from transformed geometry', () => {
    const c = canvas([path('a')]), horizontal = prepareSkewPlan(c.editor, options());
    near(horizontal.resultBounds.x, -25); near(horizontal.resultBounds.w, 150); near(horizontal.resultBounds.h, 50);
    const vertical = prepareSkewPlan(c.editor, options({ axis: 'vertical' }));
    near(vertical.resultBounds.y, -50); near(vertical.resultBounds.w, 100); near(vertical.resultBounds.h, 150);
  });
  it('uses the bounds of the entire multi-object selection for one common anchor', () => {
    const c = canvas([path('a'), path('b', { x: 200, y: 100, index: 'a2' })]), plan = prepareSkewPlan(c.editor, options());
    samePoint(plan.anchor, { x: 150, y: 75 });
    samePoint(plan.items[0].result[0].nodes[0], { x: 75, y: 0 });
    samePoint(plan.items[1].result[0].nodes[0], { x: 175, y: 100 });
  });
  it('maps original Bézier control points exactly, without flattening', () => {
    const curve: CadContour = { closed: false, nodes: [{ ...nodeAt({ x: -30, y: 20 }), outX: 140, outY: -80 }, { ...nodeAt({ x: 200, y: 90 }), inX: -55, inY: 110 }] };
    const c = canvas([bezier('a', [curve])]), plan = prepareSkewPlan(c.editor, options({ axis: 'vertical', angle: 30 }));
    const source = [...contourSegments(curve)][0], result = [...contourSegments(plan.items[0].result[0])][0];
    assert.equal(plan.items[0].result[0].nodes.length, 2);
    for (let i = 0; i <= 20; i++) {
      const point = cubicAt(source, i / 20);
      samePoint(cubicAt(result, i / 20), { x: point.x, y: point.y - Math.tan(Math.PI / 6) * (point.x - plan.anchor.x) });
    }
  });
  it('preserves compound holes, fill rules and node modes', () => {
    const outer = rectangle(), hole = rectangle(20, 10, 60, 30);
    outer.nodes[0] = { ...outer.nodes[0], inX: -5, inY: 2, outX: 5, outY: -2, mode: 'symmetric' };
    const c = canvas([bezier('a', [outer, hole])]), plan = prepareSkewPlan(c.editor, options({ angle: -35 }));
    assert.equal(applySkewPlan(c.editor, plan), true);
    const props = c.get('a').props;
    assert.equal(props.fillRule, 'evenodd'); assert.equal(props.contours.length, 2);
    assert.deepEqual(props.contours.map((contour: CadContour) => contour.closed), [true, true]);
    const node = props.contours[0].nodes[0]; assert.equal(node.mode, 'symmetric');
    near(node.inX, -node.outX); near(node.inY, -node.outY);
  });
  it('preserves signed area under either shear', () => {
    const area = (points: Array<{ x: number; y: number }>) => points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a.x * b.y - b.x * a.y; }, 0) / 2;
    for (const axis of ['horizontal', 'vertical'] as const) {
      const c = canvas([path('a')]), plan = prepareSkewPlan(c.editor, options({ axis, angle: 73 }));
      near(area(plan.items[0].source[0].nodes), area(plan.items[0].result[0].nodes));
    }
  });
  it('works in page axes inside nested rotated groups', () => {
    const c = canvas([group('g', { x: 500, y: 200, rotation: Math.PI / 6 }), group('h', { parentId: 'shape:g', x: 30, y: -20, rotation: -.2 }),
      path('a', { parentId: 'shape:h', x: 5, y: 10, rotation: .7 }), path('b', { parentId: 'shape:h', x: 125, index: 'a2' })], ['shape:g']);
    const before = structuredClone(c.get('g')), plan = prepareSkewPlan(c.editor, options({ axis: 'vertical', angle: -25 }));
    assert.equal(applySkewPlan(c.editor, plan), true); assert.deepEqual(c.get('g'), before);
    for (const item of plan.items) {
      const shape = c.get(item.id), actual = mapContours([{ closed: shape.props.closed, nodes: shape.props.points.map(nodeAt) }], p => c.editor.getShapePageTransform(shape).applyToPoint(p));
      for (let n = 0; n < actual[0].nodes.length; n++) samePoint(actual[0].nodes[n], item.result[0].nodes[n]);
    }
  });
  it('does not skew a child twice when its group is also selected', () => {
    const c = canvas([group('g'), path('a', { parentId: 'shape:g' }), path('b', { parentId: 'shape:g', x: 120, index: 'a2' })], ['shape:g', 'shape:a']);
    const plan = prepareSkewPlan(c.editor, options());
    assert.deepEqual(plan.roots, ['shape:g']); assert.equal(plan.items.length, 2);
    assert.equal(applySkewPlan(c.editor, plan), true); assert.equal(c.stats().updates, 2);
  });
  it('keeps physical geometry independent of document units and scale', () => {
    const c = canvas([path('a')]), first = prepareSkewPlan(c.editor, options());
    c.page.meta.omsCad = { ...c.page.meta.omsCad, unit: 'in', scale: 10, originX: 40, originY: 90 } as any;
    const second = prepareSkewPlan(c.editor, options());
    assert.deepEqual(second.items, first.items); assert.deepEqual(second.anchor, first.anchor);
  });
  it('retains solid outline widths, dashes, names and metadata', () => {
    const meta = { omsObjectName: 'Letter with outline', custom: { value: 42 }, omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, fill: '#ffee00', stroke: '#ff0000', strokeWidth: 8, dash: [4, 3], dashOffset: 2 } };
    const c = canvas([bezier('a', [rectangle()], { meta, opacity: .6 })]), plan = prepareSkewPlan(c.editor, options());
    assert.equal(applySkewPlan(c.editor, plan), true); assert.deepEqual(c.get('a').meta, meta); assert.equal(c.get('a').opacity, .6);
  });
  it('maps linear and radial gradients with the same affine transform as their curves', () => {
    for (const type of ['linear', 'radial'] as const) {
      const gradient = { type, matrix: [2, .2, .3, 1.5, 10, 12], start: [0, 0], end: [30, 15], r0: 0, r1: 20,
        stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] };
      const c = canvas([bezier('a', [rectangle()], { x: 200, y: 100, rotation: .6, meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, gradient } } })]);
      const shape = c.get('a'), transform = c.editor.getShapePageTransform(shape), plan = prepareSkewPlan(c.editor, options({ angle: 30 }));
      assert.equal(applySkewPlan(c.editor, plan), true);
      const next = c.get('a').meta.omsVectorPaint.gradient;
      const pointAt = (matrix: number[], p: { x: number; y: number }) => ({ x: matrix[0] * p.x + matrix[2] * p.y + matrix[4], y: matrix[1] * p.x + matrix[3] * p.y + matrix[5] });
      for (const point of [{ x: 0, y: 0 }, { x: 10, y: 15 }, { x: -25, y: 8 }]) {
        const original = transform.applyToPoint(pointAt(gradient.matrix, point)), actual = transform.applyToPoint(pointAt(next.matrix, point));
        samePoint(actual, { x: original.x - Math.tan(Math.PI / 6) * (original.y - plan.anchor.y), y: original.y });
      }
      assert.deepEqual(next.stops, gradient.stops); assert.equal(next.type, type);
    }
  });
});

describe('Skew transactions and protected selections', () => {
  it('updates stable IDs and restores the whole edit in one undo transaction', () => {
    const c = canvas([path('a'), path('b', { x: 200, index: 'a2' })]), before = structuredClone(c.all());
    assert.equal(applySkewPlan(c.editor, prepareSkewPlan(c.editor, options())), true);
    assert.deepEqual(c.all().map(s => s.id), before.map(s => s.id)); assert.equal(c.stats().marks, 2);
    c.editor.undo(); assert.deepEqual(c.all(), before);
  });
  it('copies an entire rotated hierarchy above its original while keeping the source', () => {
    const c = canvas([group('g', { x: 100, y: 80, rotation: .4, index: 'a1', opacity: .5, meta: { omsObjectName: 'Logo' } }),
      path('a', { parentId: 'shape:g', index: 'a1' }), bezier('b', [rectangle()], { parentId: 'shape:g', x: 150, index: 'a2' }),
      path('later', { x: 400, index: 'a2' })], ['shape:g']);
    const originals = structuredClone(c.all()), plan = prepareSkewPlan(c.editor, options({ keepOriginal: true }));
    assert.equal(plan.generated, 3); assert.equal(applySkewPlan(c.editor, plan), true);
    for (const original of originals) assert.deepEqual(c.get(original.id), original);
    const cloneGroup = c.all().find(s => s.type === 'group' && s.id !== 'shape:g')!;
    assert.equal(cloneGroup.parentId, 'page:a'); assert.equal(cloneGroup.opacity, .5); assert.equal(cloneGroup.rotation, .4);
    assert.ok(cloneGroup.index > 'a1' && cloneGroup.index < 'a2');
    const children = c.all().filter(s => s.parentId === cloneGroup.id); assert.equal(children.length, 2);
    assert.deepEqual(children.map(s => s.index).sort(), ['a1', 'a2']);
    assert.deepEqual(c.editor.getSelectedShapeIds(), [cloneGroup.id]);
    for (const item of plan.items) {
      const child = children.find(s => s.type === c.get(item.id).type)!;
      const contours = child.type === 'cad-path' ? [{ closed: child.props.closed, nodes: child.props.points.map(nodeAt) }] : child.props.contours;
      const actual = mapContours(contours, p => c.editor.getShapePageTransform(child).applyToPoint(p));
      for (let i = 0; i < actual[0].nodes.length; i++) samePoint(actual[0].nodes[i], item.result[0].nodes[i]);
    }
    c.editor.undo(); assert.deepEqual(c.all(), originals);
  });
  it('copies roots in distinct existing parent groups without reparenting them', () => {
    const c = canvas([group('g'), group('h', { x: 400, index: 'a2' }), path('a', { parentId: 'shape:g' }), path('b', { parentId: 'shape:h' })], ['shape:a', 'shape:b']);
    const plan = prepareSkewPlan(c.editor, options({ keepOriginal: true })); assert.equal(applySkewPlan(c.editor, plan), true);
    const copied = c.editor.getSelectedShapeIds().map((id: string) => c.get(id));
    assert.deepEqual(copied.map((s: any) => s.parentId).sort(), ['shape:g', 'shape:h']);
  });
  it('rejects stale geometry and selection without starting a transaction', () => {
    const c = canvas([path('a'), path('b', { index: 'a2' })], ['shape:a']), plan = prepareSkewPlan(c.editor, options());
    c.select(['shape:b']); assert.equal(applySkewPlan(c.editor, plan), false);
    c.select(['shape:a']); c.get('a').x = 1; assert.equal(applySkewPlan(c.editor, plan), false); assert.equal(c.stats().marks, 0);
  });
  it('invalidates the preview when document settings change', () => {
    const c = canvas([path('a')]), plan = prepareSkewPlan(c.editor, options());
    c.page.meta.omsCad.scale = 10; assert.equal(applySkewPlan(c.editor, plan), false); assert.equal(c.stats().updates, 0);
  });
  it('rechecks read-only state immediately before apply', () => {
    const c = canvas([path('a')]), plan = prepareSkewPlan(c.editor, options()); c.readonly();
    assert.equal(applySkewPlan(c.editor, plan), false); assert.equal(c.stats().marks, 0);
    assert.equal(readSkewSelection(c.editor).error, 'protected');
  });
  it('rechecks permissions after completing an in-progress tool', () => {
    const c = canvas([path('a')]), plan = prepareSkewPlan(c.editor, options()); c.editor.complete = c.readonly;
    assert.equal(applySkewPlan(c.editor, plan), false); assert.equal(c.stats().marks, 0);
  });
  it('rejects locked descendants and locked ancestors as a whole', () => {
    const a = canvas([group('g'), path('a', { parentId: 'shape:g', isLocked: true })], ['shape:g']);
    assert.throws(() => prepareSkewPlan(a.editor, options()), /protected/);
    const b = canvas([group('g', { isLocked: true }), path('a', { parentId: 'shape:g' })], ['shape:a']);
    assert.throws(() => prepareSkewPlan(b.editor, options()), /protected/);
  });
  it('requires explicit conversion of native shapes, text and analytic geometry', () => {
    for (const type of ['geo', 'text', 'cad-ellipse', 'cad-arc', 'image']) {
      const c = canvas([path('a'), base('b', type, {}, { index: 'a2' })]);
      assert.throws(() => prepareSkewPlan(c.editor, options()), /curves/); assert.equal(c.stats().marks, 0);
    }
  });
  it('rejects frames, bindings, masks and production forms', () => {
    for (const extra of [{ bound: true }, { masked: [{}] }]) assert.throws(() => prepareSkewPlan(canvas([path('a', extra)]).editor, options()), /unsupported/);
    const frame = canvas([base('frame', 'frame', {}), path('a', { parentId: 'shape:frame' })], ['shape:a']);
    assert.throws(() => prepareSkewPlan(frame.editor, options()), /unsupported/);
    const boundParent = canvas([group('g', { bound: true }), path('a', { parentId: 'shape:g' })], ['shape:a']);
    assert.throws(() => prepareSkewPlan(boundParent.editor, options()), /unsupported/);
    assert.throws(() => prepareSkewPlan(canvas([base('form', 'order-details', {})]).editor, options()), /protected/);
  });
  it('explains unsupported clipping, material textures and malformed paint', () => {
    const examples = [
      { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, clips: [{ contours: [rectangle()], fillRule: 'evenodd' }] } },
      { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, raster: {} } },
      { omsMaterialTexture: { mode: 'tile' } }, { omsVectorPaint: { fill: '#ffffff' } },
    ];
    for (const meta of examples) assert.equal(readSkewSelection(canvas([path('a', { meta })]).editor).error, 'appearance');
  });
  it('rolls back refused or clamped updates', () => {
    for (const mode of ['refuse', 'clamp'] as const) {
      const c = canvas([path('a')]), before = structuredClone(c.all()), plan = prepareSkewPlan(c.editor, options()); c[mode]();
      assert.equal(applySkewPlan(c.editor, plan), false); assert.deepEqual(c.all(), before); assert.equal(c.stats().rollbacks, 1);
    }
  });
  it('rolls back an interrupted multi-object edit', () => {
    const c = canvas([path('a'), path('b', { x: 120, index: 'a2' })]), before = structuredClone(c.all()), plan = prepareSkewPlan(c.editor, options()); c.failAfter();
    assert.equal(applySkewPlan(c.editor, plan), false); assert.deepEqual(c.all(), before); assert.equal(c.stats().rollbacks, 1);
  });
  it('rolls back incomplete or interrupted group copying', () => {
    for (const mode of ['incomplete', 'failAfter'] as const) {
      const c = canvas([group('g'), path('a', { parentId: 'shape:g' }), path('b', { parentId: 'shape:g', x: 150, index: 'a2' })], ['shape:g']);
      const before = structuredClone(c.all()), plan = prepareSkewPlan(c.editor, options({ keepOriginal: true })); c[mode]();
      assert.equal(applySkewPlan(c.editor, plan), false); assert.deepEqual(c.all(), before); assert.equal(c.stats().rollbacks, 1);
    }
  });
  it('recomputes the operation instead of trusting modified preview geometry', () => {
    const c = canvas([path('a')]), plan = prepareSkewPlan(c.editor, options());
    (plan.items[0].props as any).points[0].x = 999; plan.items[0].meta = { changed: true };
    assert.equal(applySkewPlan(c.editor, plan), true); near(c.get('a').props.points[0].x, 25); assert.deepEqual(c.get('a').meta, {});
  });
  it('rejects invalid settings and geometry without mutation', () => {
    const c = canvas([path('a')]);
    for (const patch of [{ angle: 81 }, { angle: -81 }, { angle: Infinity }, { angle: NaN }, { axis: 'x' }, { anchor: 'missing' }, { keepOriginal: 1 }])
      assert.throws(() => prepareSkewPlan(c.editor, options(patch as any)), /invalid/);
    assert.throws(() => prepareSkewPlan(c.editor, options({ angle: 0 })), /unchanged/);
    const flat = canvas([path('flat', { props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false, color: 'black' } })]);
    assert.throws(() => prepareSkewPlan(flat.editor, options()), /unchanged/);
    assert.equal(c.stats().marks, 0);
  });
  it('checks source and transformed coordinate limits', () => {
    const huge = canvas([bezier('a', [rectangle(0, 0, 100, 900000)])]);
    assert.throws(() => prepareSkewPlan(huge.editor, options({ angle: 80 })), /bounds/);
    const outside = canvas([path('a', { x: 1000001 })]); assert.throws(() => prepareSkewPlan(outside.editor, options()), /bounds/);
  });
  it('respects page, selection and saved-document capacity', () => {
    const c = canvas([path('a')]); c.editor.options.maxShapesPerPage = 1;
    assert.throws(() => prepareSkewPlan(c.editor, options({ keepOriginal: true })), /limit/);
    assert.doesNotThrow(() => prepareSkewPlan(c.editor, options()));
    const many = canvas(Array.from({ length: 101 }, (_, i) => path(String(i), { x: i * 10 })));
    assert.throws(() => prepareSkewPlan(many.editor, options()), /limit/);
    c.oversize(1_900_000); assert.throws(() => prepareSkewPlan(c.editor, options()), /limit/);
  });
});
