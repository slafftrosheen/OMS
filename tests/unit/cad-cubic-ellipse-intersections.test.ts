import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { bernsteinRoots } from '../../src/lib/components/canvas/cad-bernstein-roots';
import { cubicEllipseIntersections, snapIntersections, MAX_CUBIC_ELLIPSE_SNAP_PAIRS, type SnapEllipse } from '../../src/lib/components/canvas/cad-intersections';
import { cubicAt, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { findCadSnap, snapCadHandle, cadSnapIndicator } from '../../src/lib/components/canvas/cad-snap';
import { writeCadSnapSettings } from '../../src/lib/components/canvas/cad-snap-settings';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { DEFAULT_CAD_SETTINGS, type CadPoint } from '../../src/lib/components/canvas/cad-settings';

const ellipse = (patch: Partial<SnapEllipse> = {}): SnapEllipse => ({ center: { x: 0, y: 0 }, rx: 1, ry: 1, rotation: 0, start: 0, end: 360, ...patch });
// x=t-.5; y=2*T3(2t-1). Six distinct crossings of the unit circle.
const six = [{ x: -0.5, y: -2 }, { x: -1 / 6, y: 10 }, { x: 1 / 6, y: -10 }, { x: 0.5, y: 2 }];
// x=2t-1; y=1+x². An interior tangent contact at (0,1).
const tangent = [{ x: -1, y: 2 }, { x: -1 / 3, y: 2 / 3 }, { x: 1 / 3, y: 2 / 3 }, { x: 1, y: 2 }];
function close(actual: CadPoint | undefined, expected: CadPoint, tolerance = 1e-7) {
  assert.ok(actual); assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) <= tolerance, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function world(p: CadPoint, e: SnapEllipse): CadPoint {
  const x = p.x * e.rx, y = p.y * e.ry, c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.center.x + c * x - s * y, y: e.center.y + s * x + c * y };
}
function setup() {
  const f = fixture(); f.state.snap = true;
  f.editor.updatePage({ meta: { omsCadSnap: { endpoints: false, midpoints: false, centers: false, quadrants: false, intersections: true, nearest: false, grid: false } } });
  let indicators: any[] = [];
  f.editor.snaps = { getIndicators: () => indicators, setIndicators: (next: any[]) => indicators = next, clearIndicators: () => indicators = [] };
  return f;
}
function curve(f: ReturnType<typeof setup>, id: string, points: CadPoint[], patch: Record<string, any> = {}) {
  const [p, h, k, q] = points;
  f.editor.createShape({ id, type: 'cad-bezier', ...patch, props: { contours: [{ closed: false, nodes: [
    { ...nodeAt(p), outX: h.x - p.x, outY: h.y - p.y }, { ...nodeAt(q), inX: k.x - q.x, inY: k.y - q.y },
  ] }] } });
}

describe('bounded Bernstein roots', () => {
  const choose = (n: number, k: number) => { let value = 1; for (let i = 1; i <= k; i++) value *= (n - i + 1) / i; return value; };
  function polynomial(roots: number[]) {
    let power = [1];
    for (const root of roots) { const next = Array<number>(power.length + 1).fill(0); power.forEach((value, i) => { next[i] -= root * value; next[i + 1] += value; }); power = next; }
    const n = roots.length;
    return power.map((_, i) => power.slice(0, i + 1).reduce((sum, value, j) => sum + value * choose(i, j) / choose(n, j), 0));
  }
  it('finds all six roots including both boundaries', () => {
    const expected = [0, 0.1, 0.3, 0.6, 0.9, 1], roots = bernsteinRoots(polynomial(expected));
    assert.equal(roots.length, expected.length); roots.forEach((root, i) => assert.ok(Math.abs(root - expected[i]) < 1e-9));
  });
  it('keeps repeated contacts without manufacturing roots of a zero polynomial', () => {
    const roots = bernsteinRoots(polynomial([0.2, 0.2, 0.5, 0.5, 0.8, 0.8]));
    assert.equal(roots.length, 3); roots.forEach((root, i) => assert.ok(Math.abs(root - [0.2, 0.5, 0.8][i]) < 1e-8));
    for (const invalid of [[0, 0, 0], [1, 1, 1], [NaN, 1], [1], Array(8).fill(1)]) assert.deepEqual(bernsteinRoots(invalid), []);
  });
});

describe('original cubic / analytic ellipse intersections', () => {
  it('finds six distinct crossings lying on BOTH the cubic and circle', () => {
    const roots = cubicEllipseIntersections(six, ellipse()); assert.equal(roots.length, 6);
    for (const p of roots) {
      assert.ok(Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-10);
      close(p, cubicAt(six, p.x + 0.5), 1e-10);
    }
    assert.ok(roots.every((p, i) => i === 0 || p.x - roots[i - 1].x > 0.05));
  });
  it('keeps tangent contacts singular, rejects near misses and retains endpoint contacts', () => {
    const roots = cubicEllipseIntersections(tangent, ellipse()); assert.equal(roots.length, 1); close(roots[0], { x: 0, y: 1 });
    assert.deepEqual(cubicEllipseIntersections(tangent.map(p => ({ x: p.x, y: p.y + 1e-7 })), ellipse()), []);
    const endpoints = cubicEllipseIntersections([-1, -1 / 3, 1 / 3, 1].map(x => ({ x, y: 0 })), ellipse());
    assert.equal(endpoints.length, 2); close(endpoints[0], { x: -1, y: 0 }); close(endpoints[1], { x: 1, y: 0 });
  });
  it('preserves six crossings through ellipse eccentricity, rotation, translation and scaling', () => {
    const reference = cubicEllipseIntersections(six, ellipse());
    for (const scale of [0.001, 1, 100]) for (const ratio of [0.02, 1, 15]) for (const rotation of [-2.1, 0.7]) {
      const e = ellipse({ rx: scale, ry: scale * ratio, rotation, center: { x: 300, y: -240 } });
      const roots = cubicEllipseIntersections(six.map(p => world(p, e)), e); assert.equal(roots.length, 6, `${scale}/${ratio}/${rotation}`);
      roots.forEach((p, i) => close(p, world(reference[i], e), 1e-7));
      const touch = cubicEllipseIntersections(tangent.map(p => world(p, e)), e); assert.equal(touch.length, 1); close(touch[0], world({ x: 0, y: 1 }, e));
    }
  });
  it('filters arc sweeps including rotated wrapped arcs and their endpoints', () => {
    const e = ellipse({ center: { x: 200, y: 300 }, rx: 80, ry: 80, rotation: 0.4, start: 350, end: 370 });
    const line = [-2, -2 / 3, 2 / 3, 2].map(x => world({ x, y: 0 }, e));
    const roots = cubicEllipseIntersections(line, e); assert.equal(roots.length, 1); close(roots[0], world({ x: 1, y: 0 }, e));
    const angle = 10 * Math.PI / 180, end = [-2, -2 / 3, 2 / 3, 2].map(r => world({ x: r * Math.cos(angle), y: -r * Math.sin(angle) }, e));
    const endpoint = cubicEllipseIntersections(end, e); assert.equal(endpoint.length, 1); close(endpoint[0], world({ x: Math.cos(angle), y: -Math.sin(angle) }, e));
    assert.deepEqual(cubicEllipseIntersections(tangent.map(p => world(p, e)), e), []);
  });
  it('resolves a very long cubic crossing a small ellipse without losing both roots', () => {
    const points = [-900000, -300000, 300000, 900000].map(x => ({ x, y: 0.006 }));
    const roots = cubicEllipseIntersections(points, ellipse({ rx: 0.01, ry: 0.01 }));
    assert.equal(roots.length, 2); close(roots[0], { x: -0.008, y: 0.006 }, 1e-8); close(roots[1], { x: 0.008, y: 0.006 }, 1e-8);
  });
  it('never offers arbitrary points for a degenerate curve or malformed geometry', () => {
    for (const p of [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: NaN, y: 0 }]) assert.deepEqual(cubicEllipseIntersections(Array(4).fill(p), ellipse()), []);
    for (const e of [ellipse({ rx: 0 }), ellipse({ ry: -1 }), ellipse({ rotation: Infinity }), ellipse({ end: 0 })]) assert.deepEqual(cubicEllipseIntersections(six, e), []);
    assert.deepEqual(cubicEllipseIntersections(six.slice(0, 3), ellipse()), []);
    assert.deepEqual(cubicEllipseIntersections(six.map(p => ({ x: p.x + 10, y: p.y })), ellipse()), []);
  });
  it('dispatches either pair order while omitting coincident cubics and unsupported noncircular conic pairs', () => {
    const cubic = { kind: 'cubic' as const, points: six }, conic = { kind: 'ellipse' as const, ellipse: ellipse() };
    assert.deepEqual(snapIntersections(cubic, conic), snapIntersections(conic, cubic)); assert.equal(snapIntersections(cubic, conic).length, 6);
    assert.deepEqual(snapIntersections(cubic, cubic), []);
    assert.deepEqual(snapIntersections(conic, { kind: 'ellipse', ellipse: ellipse({ ry: 2 }) }), []);
  });
});

describe('shared cubic/conic snaps', () => {
  it('shares transformed targets with node editing ahead of nearest-edge fallback', () => {
    const f = setup(); f.editor.createShape({ id: 'shape:group', type: 'group', x: 300, y: 200, rotation: 0.6 });
    curve(f, 'shape:curve', tangent.map(p => ({ x: p.x * 100, y: p.y * 50 })), { parentId: 'shape:group' });
    f.editor.createShape({ id: 'shape:ellipse', type: 'cad-ellipse', parentId: 'shape:group', x: -100, y: -50, props: { w: 200, h: 100 } });
    const matrix = f.editor.getShapePageTransform(f.editor.getShape('shape:group')), expected = matrix.applyToPoint({ x: 0, y: 50 });
    const query = { x: expected.x + 1, y: expected.y + 1 }; writeCadSnapSettings(f.editor, { nearest: true });
    const result = findCadSnap(f.editor, query, null); assert.equal(result?.kind, 'intersections'); close(result?.point, expected);
    curve(f, 'shape:edit', six.map(p => ({ x: p.x * 10, y: p.y * 10 })), { x: 200, y: 200, rotation: -0.2 });
    const edit = f.editor.getShape('shape:edit'), inverse = f.editor.getShapePageTransform(edit).clone().invert();
    close(snapCadHandle(f.editor, edit, inverse.applyToPoint(query)), inverse.applyToPoint(expected));
  });
  it('respects arc visibility, Ctrl, excluded shapes, tolerance, locks and settings', () => {
    const f = setup(); curve(f, 'shape:curve', tangent.map(p => ({ x: p.x * 100, y: p.y * 100 })));
    f.editor.createShape({ id: 'shape:arc', type: 'cad-arc', props: { radius: 100, startAngle: 0, endAngle: 180 } });
    const query = { x: 1, y: 101 }; assert.equal(findCadSnap(f.editor, query, null), null);
    f.editor.updateShape({ id: 'shape:arc', props: { startAngle: 180, endAngle: 360 } }); close(findCadSnap(f.editor, query, null)?.point, { x: 0, y: 100 });
    f.state.zoom = 10; assert.equal(findCadSnap(f.editor, query, null), null); f.state.zoom = 1;
    f.editor.inputs.ctrlKey = true; assert.equal(findCadSnap(f.editor, query, null), null); f.editor.inputs.ctrlKey = false;
    assert.equal(findCadSnap(f.editor, query, 'shape:curve' as any), null);
    f.editor.updateShape({ id: 'shape:curve', isLocked: true }); assert.ok(findCadSnap(f.editor, query, null));
    f.editor.updateShape({ id: 'shape:curve', opacity: 0 }); assert.equal(findCadSnap(f.editor, query, null), null);
    f.editor.updateShape({ id: 'shape:curve', opacity: 1, mask: [{ x: 0, y: 0 }] }); assert.equal(findCadSnap(f.editor, query, null), null);
    f.editor.updateShape({ id: 'shape:curve', mask: undefined }); writeCadSnapSettings(f.editor, { intersections: false }); assert.equal(findCadSnap(f.editor, query, null), null);
  });
  it('limits costly cubic/conic pairs without starving inexpensive line intersections', () => {
    const f = setup();
    for (let i = 0; i <= MAX_CUBIC_ELLIPSE_SNAP_PAIRS; i++) curve(f, `shape:curve-${i}`, tangent.map(p => ({ x: p.x * 100, y: p.y * 100 + (i === MAX_CUBIC_ELLIPSE_SNAP_PAIRS ? 0 : 1) })));
    f.editor.createShape({ id: 'shape:ellipse', type: 'cad-ellipse', x: -100, y: -100, props: { w: 200, h: 200 } });
    assert.equal(findCadSnap(f.editor, { x: 1, y: 101 }, null), null);
    f.editor.createShape({ id: 'shape:line-a', type: 'cad-path', props: { points: [{ x: -20, y: 100 }, { x: 20, y: 100 }], closed: false } });
    f.editor.createShape({ id: 'shape:line-b', type: 'cad-path', props: { points: [{ x: 0, y: 95 }, { x: 0, y: 105 }], closed: false } });
    close(findCadSnap(f.editor, { x: 1, y: 100 }, null)?.point, { x: 0, y: 100 });
    f.editor.deleteShapes(['shape:line-a', 'shape:line-b', 'shape:curve-0']); close(findCadSnap(f.editor, { x: 1, y: 101 }, null)?.point, { x: 0, y: 100 });
  });
  for (const scale of [1, 10]) it(`exports the clicked cubic/circle contact through independent DXF parsing at 1:${scale}`, () => {
    const f = setup(); curve(f, 'shape:curve', tangent.map(p => ({ x: p.x * 100, y: p.y * 100 })));
    f.editor.createShape({ id: 'shape:circle', type: 'cad-ellipse', x: -100, y: -100, props: { w: 200, h: 200 } });
    const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 300, y: 200 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.currentPagePoint = { x: 1, y: 101 }; tool.onPointerDown({ button: 0 } as any);
    assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'intersections'); tool.onComplete();
    const output = buildCadDxf(f.editor, 'all', { ...DEFAULT_CAD_SETTINGS, scale }), parsed = new DxfParser().parseSync(output.text)!;
    assert.deepEqual(output.omitted, []); const unit = scale * 25.4 / 96;
    const drawn = parsed.entities.find((e: any) => e.type === 'LINE' && Math.abs(e.vertices[0].x - 300 * unit) < 1e-6) as any;
    assert.ok(drawn); close(drawn.vertices[1], { x: 0, y: -100 * unit }, 1e-6);
  });
});
