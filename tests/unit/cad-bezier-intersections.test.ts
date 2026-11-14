import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { lineCubicIntersections } from '../../src/lib/components/canvas/cad-bezier-intersections';
import { snapIntersections, MAX_SNAP_INTERSECTION_SOURCES } from '../../src/lib/components/canvas/cad-intersections';
import { findCadSnap, snapCadHandle, cadSnapIndicator } from '../../src/lib/components/canvas/cad-snap';
import { writeCadSnapSettings } from '../../src/lib/components/canvas/cad-snap-settings';
import { cubicAt, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { CadBezierShapeUtil } from '../../src/lib/components/canvas/shapes/CadBezierShape';
import { CadDimensionShapeUtil } from '../../src/lib/components/canvas/shapes/CadShapes';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { DEFAULT_CAD_SETTINGS, type CadPoint } from '../../src/lib/components/canvas/cad-settings';

const a = { x: -100, y: 0 }, b = { x: 400, y: 0 };
// y(t) = 1000(t-.2)(t-.5)(t-.8), x(t) = 300t.
const three = [{ x: 0, y: -80 }, { x: 100, y: 140 }, { x: 200, y: -140 }, { x: 300, y: 80 }];
function power(c0: number, c1: number, c2: number, c3: number): CadPoint[] {
  return [c0, c0 + c1 / 3, c0 + 2 * c1 / 3 + c2 / 3, c0 + c1 + c2 + c3].map((y, i) => ({ x: 100 * i, y }));
}
function close(actual: CadPoint | undefined, expected: CadPoint, tolerance = 1e-7) {
  assert.ok(actual); assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) <= tolerance, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function setup() {
  const f = fixture(); f.state.snap = true;
  f.editor.updatePage({ meta: { omsCadSnap: { endpoints: false, midpoints: false, centers: false, quadrants: false, intersections: true, nearest: false, grid: false } } });
  let indicators: any[] = [];
  f.editor.snaps = { getIndicators: () => indicators, setIndicators: (next: any[]) => indicators = next, clearIndicators: () => indicators = [] };
  return f;
}
function curve(f: ReturnType<typeof setup>, id: string, points = three, patch: Record<string, any> = {}) {
  const [p, h, k, q] = points;
  f.editor.createShape({ id, type: 'cad-bezier', ...patch, props: { contours: [{ closed: false, nodes: [
    { ...nodeAt(p), outX: h.x - p.x, outY: h.y - p.y }, { ...nodeAt(q), inX: k.x - q.x, inY: k.y - q.y },
  ] }] } });
}
const line = (f: ReturnType<typeof setup>, id = 'shape:line', start = a, end = b) => f.editor.createShape({ id, type: 'cad-path', props: { points: [start, end], closed: false } });

describe('finite line / cubic intersections', () => {
  it('returns all three original-curve roots independently of line direction', () => {
    for (const [start, end] of [[a, b], [b, a]]) {
      const roots = lineCubicIntersections(start, end, three); assert.equal(roots.length, 3);
      for (const [i, t] of [0.2, 0.5, 0.8].entries()) close(roots[i], cubicAt(three, t));
    }
  });
  it('keeps a repeated tangent root singular and retains a separate crossing', () => {
    // 1000(t-.25)^2(t-.75)
    const points = power(-46.875, 437.5, -1250, 1000), roots = lineCubicIntersections(a, b, points);
    assert.equal(roots.length, 2); close(roots[0], { x: 75, y: 0 }); close(roots[1], { x: 225, y: 0 });
    const triple = lineCubicIntersections(a, b, power(-125, 750, -1500, 1000));
    assert.equal(triple.length, 1); close(triple[0], { x: 150, y: 0 });
  });
  it('handles quadratic tangency, linear curves and roots at both endpoints', () => {
    const tangent = lineCubicIntersections(a, b, power(100, -400, 400, 0));
    assert.equal(tangent.length, 1); close(tangent[0], { x: 150, y: 0 });
    const linear = lineCubicIntersections(a, b, power(-100, 200, 0, 0));
    assert.equal(linear.length, 1); close(linear[0], { x: 150, y: 0 });
    const endpoints = lineCubicIntersections(a, b, power(0, 100, -100, 0));
    assert.equal(endpoints.length, 2); close(endpoints[0], { x: 0, y: 0 }); close(endpoints[1], { x: 300, y: 0 });
  });
  it('rejects near misses, collinear overlaps, point segments and invalid input', () => {
    assert.deepEqual(lineCubicIntersections(a, b, power(100.000001, -400, 400, 0)), []);
    assert.deepEqual(lineCubicIntersections(a, b, power(0, 0, 0, 0)), []);
    assert.deepEqual(lineCubicIntersections(a, b, power(5, 0, 0, 0)), []);
    assert.deepEqual(lineCubicIntersections(a, a, three), []);
    assert.deepEqual(lineCubicIntersections(a, b, three.slice(0, 3)), []);
    assert.deepEqual(lineCubicIntersections(a, b, [...three.slice(0, 3), { x: NaN, y: 0 }]), []);
  });
  it('uses only the finite segment, including exact line endpoints', () => {
    const roots = lineCubicIntersections({ x: 60, y: 0 }, { x: 150, y: 0 }, three);
    assert.equal(roots.length, 2); close(roots[0], { x: 60, y: 0 }); close(roots[1], { x: 150, y: 0 });
    assert.deepEqual(lineCubicIntersections({ x: 61, y: 0 }, { x: 149, y: 0 }, three), []);
    assert.deepEqual(lineCubicIntersections({ x: 301, y: 0 }, b, three), []);
  });
  it('preserves crossings and tangent contacts through translation, rotation and scale', () => {
    for (const scale of [0.001, 1, 100]) for (const angle of [-2.1, 0, 0.7, 1.5]) {
      const world = (p: CadPoint) => ({ x: 300 + scale * (p.x * Math.cos(angle) - p.y * Math.sin(angle)), y: -250 + scale * (p.x * Math.sin(angle) + p.y * Math.cos(angle)) });
      const roots = lineCubicIntersections(world(a), world(b), three.map(world)); assert.equal(roots.length, 3);
      for (const [i, x] of [60, 150, 240].entries()) close(roots[i], world({ x, y: 0 }));
      const tangent = lineCubicIntersections(world(a), world(b), power(100, -400, 400, 0).map(world));
      assert.equal(tangent.length, 1); close(tangent[0], world({ x: 150, y: 0 }));
    }
  });
  it('resolves a tiny cubic crossed by a long reference segment', () => {
    const points = three.map(p => ({ x: p.x / 100000, y: p.y / 100000 }));
    const roots = lineCubicIntersections({ x: -900000, y: 0 }, { x: 900000, y: 0 }, points);
    assert.equal(roots.length, 3); for (const [i, x] of [0.0006, 0.0015, 0.0024].entries()) close(roots[i], { x, y: 0 }, 1e-10);
  });
  it('keeps closely spaced, distinct crossings without tessellating the curve', () => {
    // 1000(t-.49)(t-.5)(t-.51)
    const points = power(-124.95, 749.9, -1500, 1000), roots = lineCubicIntersections(a, b, points);
    assert.equal(roots.length, 3); for (const [i, x] of [147, 150, 153].entries()) close(roots[i], { x, y: 0 });
  });
  it('deduplicates one geometric contact reached at two curve parameters', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: -100, y: 100 }, { x: 0, y: 0 }];
    const roots = lineCubicIntersections(a, b, points); assert.equal(roots.length, 1); close(roots[0], { x: 0, y: 0 });
  });
  it('dispatches both line/cubic orders and refuses unsupported cubic pairs', () => {
    const straight = { kind: 'line' as const, a, b }, cubic = { kind: 'cubic' as const, points: three };
    assert.deepEqual(snapIntersections(straight, cubic), snapIntersections(cubic, straight));
    assert.equal(snapIntersections(straight, cubic).length, 3);
    assert.deepEqual(snapIntersections(cubic, cubic), []);
  });
});

describe('Bézier intersection snapping in drawing tools', () => {
  it('moves actual Bézier nodes and dimension endpoints onto the intersection, with Shift bypass', () => {
    const f = setup(); curve(f, 'shape:reference'); line(f);
    curve(f, 'shape:edit', three, { x: 400, y: 100 });
    const shape = f.editor.getShape('shape:edit'), util = new CadBezierShapeUtil(f.editor);
    const handle = { id: '0:0:node', x: 62 - 400, y: 1 - 100 };
    const snapped = util.onHandleDrag(shape, { handle } as any); assert.ok(snapped);
    close(snapped.props!.contours![0].nodes[0], { x: 60 - 400, y: -100 });
    f.editor.inputs.shiftKey = true;
    const free = util.onHandleDrag(shape, { handle } as any); assert.ok(free);
    close(free.props!.contours![0].nodes[0], handle);
    f.editor.inputs.shiftKey = false;
    f.editor.createShape({ id: 'shape:dimension', type: 'cad-dimension' });
    const dim = new CadDimensionShapeUtil(f.editor).onHandleDrag(f.editor.getShape('shape:dimension'), { handle: { id: 'end', x: 62, y: 1 } } as any); assert.ok(dim);
    close({ x: dim.props!.endX!, y: dim.props!.endY! }, { x: 60, y: 0 });
  });
  it('shares exact targets with node editing in a rotated group, ahead of nearest fallback', () => {
    const f = setup(); f.editor.createShape({ id: 'shape:group', type: 'group', x: 350, y: 250, rotation: 0.7 });
    curve(f, 'shape:curve', three, { parentId: 'shape:group' }); line(f);
    f.editor.updateShape({ id: 'shape:line', parentId: 'shape:group' }); writeCadSnapSettings(f.editor, { nearest: true });
    const matrix = f.editor.getShapePageTransform(f.editor.getShape('shape:group')), expected = matrix.applyToPoint({ x: 60, y: 0 });
    const query = { x: expected.x + 1, y: expected.y + 1 }, snap = findCadSnap(f.editor, query, null);
    assert.equal(snap?.kind, 'intersections'); close(snap?.point, expected);
    line(f, 'shape:edit', { x: 0, y: 0 }, { x: 10, y: 0 }); f.editor.updateShape({ id: 'shape:edit', x: 100, y: 80, rotation: -0.3 });
    const edit = f.editor.getShape('shape:edit'), inverse = f.editor.getShapePageTransform(edit).clone().invert();
    close(snapCadHandle(f.editor, edit, inverse.applyToPoint(query)), inverse.applyToPoint(expected));
  });
  it('respects Ctrl, self-exclusion, tolerance, visibility, clipping, locks and the existing setting', () => {
    const f = setup(); curve(f, 'shape:curve'); line(f); const query = { x: 62, y: 1 };
    f.state.zoom = 10; assert.equal(findCadSnap(f.editor, query, null), null); f.state.zoom = 1;
    f.editor.inputs.ctrlKey = true; assert.equal(findCadSnap(f.editor, query, null), null); f.editor.inputs.ctrlKey = false;
    assert.equal(findCadSnap(f.editor, query, 'shape:curve' as any), null);
    f.editor.updateShape({ id: 'shape:curve', opacity: 0 }); assert.equal(findCadSnap(f.editor, query, null), null);
    f.editor.updateShape({ id: 'shape:curve', opacity: 1, isLocked: true }); assert.ok(findCadSnap(f.editor, query, null));
    f.editor.updateShape({ id: 'shape:curve', mask: [{ x: 0, y: 0 }] }); assert.equal(findCadSnap(f.editor, query, null), null);
    f.editor.updateShape({ id: 'shape:curve', mask: undefined }); writeCadSnapSettings(f.editor, { intersections: false }); assert.equal(findCadSnap(f.editor, query, null), null);
  });
  it('includes cubics in the shared nearby primitive budget', () => {
    const f = setup(); for (let i = 0; i < MAX_SNAP_INTERSECTION_SOURCES; i++) curve(f, `shape:curve-${i}`);
    line(f); assert.equal(findCadSnap(f.editor, { x: 62, y: 1 }, null), null);
    f.editor.deleteShapes(['shape:curve-0']); close(findCadSnap(f.editor, { x: 62, y: 1 }, null)?.point, { x: 60, y: 0 });
  });
  for (const scale of [1, 10]) it(`exports a clicked curve intersection to DXF at 1:${scale}`, () => {
    const f = setup(); curve(f, 'shape:curve'); line(f);
    const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 400, y: 100 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.currentPagePoint = { x: 62, y: 1 }; tool.onPointerDown({ button: 0 } as any);
    assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'intersections'); tool.onComplete();
    const output = buildCadDxf(f.editor, 'all', { ...DEFAULT_CAD_SETTINGS, scale }), parsed = new DxfParser().parseSync(output.text)!;
    assert.deepEqual(output.omitted, []); const unit = scale * 25.4 / 96;
    const drawn = parsed.entities.find((e: any) => e.type === 'LINE' && Math.abs(e.vertices[0].x - 400 * unit) < 1e-6) as any;
    assert.ok(drawn); close(drawn.vertices[1], { x: 60 * unit, y: 0 }, 1e-6);
  });
});
