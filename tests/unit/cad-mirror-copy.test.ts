import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { isMirrorGuide, mirrorReflection, prepareMirrorCopy } from '../../src/lib/components/canvas/cad-mirror-copy';
import { nodeAt, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT, type VectorPaint } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS, type CadPoint } from '../../src/lib/components/canvas/cad-settings';

const sourceId = 'shape:source' as TLShapeId, guideId = 'shape:guide' as TLShapeId, groupId = 'shape:group' as TLShapeId;
const page = { id: 'page:mirror', meta: { omsCad: DEFAULT_CAD_SETTINGS } };
const start = { x: 3, y: -7 }, end = { x: 8, y: -2 };
const reflect = ({ x, y }: CadPoint): CadPoint => ({ x: y + 10, y: x - 10 });

function near(actual: CadPoint, expected: CadPoint) {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-7, `${JSON.stringify(actual)} differs from ${JSON.stringify(expected)}`);
}

describe('mirror copy reflection', () => {
  it('reflects across an angled line away from the origin and is its own inverse', () => {
    const flip = mirrorReflection(start, end);
    for (const p of [start, end, { x: -12, y: 40 }, { x: 111, y: -89 }]) {
      near(flip(p), reflect(p));
      near(flip(flip(p)), p);
    }
  });

  it('rejects coincident or non-finite axis points', () => {
    assert.throws(() => mirrorReflection(start, start), /mirrorAxis/);
    assert.throws(() => mirrorReflection(start, { x: NaN, y: 20 }), /mirrorAxis/);
  });
});

interface Shape {
  id: TLShapeId; type: string; parentId: string; x: number; y: number; rotation: number; opacity: number;
  props: { color?: string; contours?: CadContour[]; closed?: boolean; points?: CadPoint[]; fillRule?: 'nonzero' };
  meta: { omsVectorPaint?: VectorPaint; omsProductionLayer?: string };
}

function fixture() {
  const paint: VectorPaint = {
    ...VECTOR_DEFAULT_PAINT, fill: '#123456', stroke: '#778899', dash: [4, 2], fillOpacity: 0.7,
    gradient: { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [20, 0], r0: 0, r1: 0,
      stops: [{ offset: 0, color: '#123456' }, { offset: 1, color: '#FFFFFF' }] },
  };
  const contour: CadContour = { closed: true, nodes: [
    { ...nodeAt({ x: 0, y: 0 }), outX: 3, outY: 9 },
    { ...nodeAt({ x: 16, y: 1 }), inX: -4, inY: -2 },
    nodeAt({ x: 8, y: 12 }),
  ] };
  const source: Shape = { id: sourceId, type: 'cad-bezier', parentId: groupId, x: -5, y: 3, rotation: 0.31, opacity: 0.6,
    props: { color: 'black', contours: [contour], fillRule: 'nonzero' }, meta: { omsVectorPaint: paint, omsProductionLayer: 'cut' } };
  const guide: Shape = { id: guideId, type: 'cad-path', parentId: page.id, x: start.x, y: start.y, rotation: 0, opacity: 1,
    props: { color: 'black', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], closed: false }, meta: {} };
  const group: Shape = { id: groupId, type: 'group', parentId: page.id, x: 24, y: 18, rotation: 0.66, opacity: 1, props: {}, meta: {} };
  const shapes = new Map([source, guide, group].map(shape => [shape.id, shape]));
  let readOnly = false;
  const rotate = ({ x, y }: CadPoint, angle: number) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) });
  const toWorld = (shape: Shape, point: CadPoint): CadPoint => {
    const rotated = rotate(point, shape.rotation);
    const p = { x: shape.x + rotated.x, y: shape.y + rotated.y };
    const parent = shapes.get(shape.parentId as TLShapeId);
    return parent ? toWorld(parent, p) : p;
  };
  const toLocal = (shape: Shape, point: CadPoint): CadPoint => {
    const parent = shapes.get(shape.parentId as TLShapeId);
    const p = parent ? toLocal(parent, point) : point;
    return rotate({ x: p.x - shape.x, y: p.y - shape.y }, -shape.rotation);
  };
  const editor = {
    getCurrentPage: () => page, getCurrentPageId: () => page.id,
    getSelectedShapeIds: () => [sourceId, guideId],
    getShape: (id: TLShapeId) => shapes.get(id),
    getCurrentPageShapesSorted: () => [...shapes.values()],
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(ids),
    getInstanceState: () => ({ isReadonly: readOnly }), isShapeOrAncestorLocked: () => false,
    user: { getIsDarkMode: () => false },
    getShapeMask: () => null, getBindingsInvolvingShape: () => [],
    getShapePageTransform: (shape: Shape) => ({ applyToPoint: (p: CadPoint) => toWorld(shape, p), point: () => toWorld(shape, { x: 0, y: 0 }) }),
    getPointInShapeSpace: toLocal,
    getPointInParentSpace: (shape: Shape, p: CadPoint) => {
      const parent = shapes.get(shape.parentId as TLShapeId);
      return parent ? toLocal(parent, p) : p;
    },
  };
  return { editor: editor as unknown as Editor, source, guide, toWorld, setReadOnly: () => { readOnly = true; } };
}

describe('mirror copy planning', () => {
  it('retains the source parent and reflects both curve handles and authored paint', () => {
    const f = fixture(), original = structuredClone(f.source);
    const plan = prepareMirrorCopy(f.editor, { guideId });
    assert.deepEqual(plan.drawing.sourceIds, [sourceId]);
    assert.deepEqual(plan.drawing.removeIds, []);
    assert.equal(plan.drawing.shapes?.length, 1);
    const copy = plan.drawing.shapes![0];
    assert.equal(copy.aboveSourceId, sourceId);
    assert.equal(copy.opacity, f.source.opacity);
    assert.equal(copy.meta?.omsProductionLayer, 'cut');
    const props = copy.props as unknown as Shape['props'];
    assert.equal(props.fillRule, 'nonzero');
    const placed = { ...f.source, x: copy.x, y: copy.y };
    const before = f.source.props.contours![0].nodes[0], after = props.contours![0].nodes[0];
    near(f.toWorld(placed, after), reflect(f.toWorld(f.source, before)));
    near(f.toWorld(placed, { x: after.x + after.outX, y: after.y + after.outY }),
      reflect(f.toWorld(f.source, { x: before.x + before.outX, y: before.y + before.outY })));
    const paint = copy.meta?.omsVectorPaint as unknown as VectorPaint;
    assert.deepEqual(paint.dash, [4, 2]);
    assert.equal(paint.fillOpacity, 0.7);
    const m = paint.gradient!.matrix;
    near(f.toWorld(placed, { x: m[0] * 20 + m[4], y: m[1] * 20 + m[5] }),
      reflect(f.toWorld(f.source, { x: 20, y: 0 })));
    assert.deepEqual(f.source, original);
  });

  it('supports a coordinate axis and blocks protected artwork', () => {
    const f = fixture();
    const plan = prepareMirrorCopy(f.editor, { start, end });
    assert.equal(plan.drawing.shapes?.length, 2);
    f.setReadOnly();
    assert.throws(() => prepareMirrorCopy(f.editor, { start, end }), /mirrorProtected/);
  });

  it('rejects a multi-segment guide before previewing', () => {
    const f = fixture();
    f.guide.props.points!.push({ x: 6, y: 4 });
    assert.equal(isMirrorGuide(f.guide as unknown as Parameters<typeof isMirrorGuide>[0]), false);
    assert.throws(() => prepareMirrorCopy(f.editor, { guideId }), /mirrorGuide/);
  });
});
