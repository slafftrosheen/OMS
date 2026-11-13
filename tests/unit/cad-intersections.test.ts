import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { Ellipse2d } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { circleIntersections, lineEllipseIntersections, snapIntersections, MAX_SNAP_INTERSECTION_SOURCES, type SnapEllipse } from '../../src/lib/components/canvas/cad-intersections';
import { findCadSnap, snapCadHandle, cadSnapIndicator } from '../../src/lib/components/canvas/cad-snap';
import { writeCadSnapSettings } from '../../src/lib/components/canvas/cad-snap-settings';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { DEFAULT_CAD_SETTINGS, type CadPoint } from '../../src/lib/components/canvas/cad-settings';

const ellipse = (patch: Partial<SnapEllipse> = {}): SnapEllipse => ({ center: { x: 0, y: 0 }, rx: 100, ry: 100, rotation: 0, start: 0, end: 360, ...patch });
const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function pointClose(a: CadPoint | undefined, b: CadPoint, tolerance = 1e-7) { assert.ok(a); close(a.x, b.x, tolerance); close(a.y, b.y, tolerance); }
function world(x: number, y: number, e: SnapEllipse): CadPoint {
  const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: e.center.x + c * x - s * y, y: e.center.y + s * x + c * y };
}
function setup() {
  const f = fixture(); f.state.snap = true;
  f.editor.updatePage({ meta: { omsCadSnap: { endpoints: false, midpoints: false, centers: false, quadrants: false, intersections: true, nearest: false, grid: false } } });
  let indicators: any[] = [];
  f.editor.snaps = { getIndicators: () => indicators, setIndicators: (next: any[]) => indicators = next, clearIndicators: () => indicators = [] };
  return f;
}
const line = (f: ReturnType<typeof setup>, id: string, a: CadPoint, b: CadPoint) => f.editor.createShape({ id, type: 'cad-path', props: { points: [a, b], closed: false } });
const circle = (f: ReturnType<typeof setup>, id: string, cx = 0, cy = 0, radius = 100) => f.editor.createShape({ id, type: 'cad-ellipse', x: cx - radius, y: cy - radius, props: { w: 2 * radius, h: 2 * radius } });

describe('finite segment intersections with analytic ellipses', () => {
  it('returns both crossings in segment order and rejects imaginary extensions', () => {
    const e = ellipse(), a = { x: -200, y: 60 }, b = { x: 200, y: 60 };
    assert.deepEqual(lineEllipseIntersections(a, b, e), [{ x: -80, y: 60 }, { x: 80, y: 60 }]);
    assert.deepEqual(lineEllipseIntersections(b, a, e), [{ x: 80, y: 60 }, { x: -80, y: 60 }]);
    assert.deepEqual(lineEllipseIntersections({ x: 0, y: 60 }, b, e), [{ x: 80, y: 60 }]);
    assert.deepEqual(lineEllipseIntersections({ x: -10, y: 60 }, { x: 10, y: 60 }, e), []);
    assert.deepEqual(lineEllipseIntersections({ x: 80, y: 60 }, b, e), [{ x: 80, y: 60 }]);
  });
  it('keeps tangent contacts singular and rejects near misses, zero segments and malformed geometry', () => {
    assert.deepEqual(lineEllipseIntersections({ x: -200, y: 100 }, { x: 200, y: 100 }, ellipse()), [{ x: 0, y: 100 }]);
    assert.deepEqual(lineEllipseIntersections({ x: -200, y: 100.000001 }, { x: 200, y: 100.000001 }, ellipse()), []);
    for (const p of [{ x: 100, y: 0 }, { x: NaN, y: 0 }]) assert.deepEqual(lineEllipseIntersections(p, p, ellipse()), []);
    for (const e of [ellipse({ rx: 0 }), ellipse({ rotation: Infinity }), ellipse({ end: 0 }), ellipse({ end: 400 })]) assert.deepEqual(lineEllipseIntersections({ x: -200, y: 0 }, { x: 200, y: 0 }, e), []);
  });
  it('preserves exact ellipse crossings under rotation, translation, eccentricity and scale', () => {
    for (const scale of [0.001, 1, 100]) for (const ratio of [0.02, 0.5, 1, 15]) for (const rotation of [-2.1, -0.5, 0, 1.3]) {
      const e = ellipse({ center: { x: 300, y: -240 }, rx: 25 * scale, ry: 25 * scale * ratio, rotation });
      const points = lineEllipseIntersections(world(-2 * e.rx, 0.6 * e.ry, e), world(2 * e.rx, 0.6 * e.ry, e), e);
      assert.equal(points.length, 2);
      pointClose(points[0], world(-0.8 * e.rx, 0.6 * e.ry, e)); pointClose(points[1], world(0.8 * e.rx, 0.6 * e.ry, e));
    }
  });
  it('resolves a small circle crossed by a very long segment without quadratic cancellation', () => {
    const points = lineEllipseIntersections({ x: -900000, y: 0.006 }, { x: 900000, y: 0.006 }, ellipse({ rx: 0.01, ry: 0.01 }));
    assert.equal(points.length, 2); pointClose(points[0], { x: -0.008, y: 0.006 }); pointClose(points[1], { x: 0.008, y: 0.006 });
  });
  it('filters rotated arcs including wrapped sweeps and their exact endpoints', () => {
    const e = ellipse({ center: { x: 300, y: 200 }, rotation: 0.7, start: 350, end: 370 });
    const points = lineEllipseIntersections(world(-200, 0, e), world(200, 0, e), e);
    assert.equal(points.length, 1); pointClose(points[0], world(100, 0, e));
    const q = world(100 * Math.cos(10 * Math.PI / 180), -100 * Math.sin(10 * Math.PI / 180), e);
    const endpoint = lineEllipseIntersections(e.center, world(200 * Math.cos(10 * Math.PI / 180), -200 * Math.sin(10 * Math.PI / 180), e), e);
    assert.equal(endpoint.length, 1); pointClose(endpoint[0], q);
  });
});

describe('circle and circular-arc intersections', () => {
  it('solves two intersections with equal or unequal radii and verifies both circle equations', () => {
    for (const radius of [3, 5]) {
      const a = ellipse({ rx: 5, ry: 5 }), b = ellipse({ center: { x: 4, y: 0 }, rx: radius, ry: radius });
      const points = circleIntersections(a, b); assert.equal(points.length, 2);
      for (const p of points) { close(Math.hypot(p.x, p.y), 5); close(Math.hypot(p.x - 4, p.y), radius); }
      const reversed = circleIntersections(b, a); assert.equal(reversed.length, 2);
      for (const p of points) assert.ok(reversed.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9));
    }
  });
  it('returns one external/internal tangent, no separated, contained or coincident targets', () => {
    const a = ellipse({ rx: 5, ry: 5 });
    for (const x of [8, 2]) assert.deepEqual(circleIntersections(a, ellipse({ center: { x, y: 0 }, rx: 3, ry: 3 })), [{ x: 5, y: 0 }]);
    for (const x of [8.000001, 1.999999, 0]) assert.deepEqual(circleIntersections(a, ellipse({ center: { x, y: 0 }, rx: 3, ry: 3 })), []);
    assert.deepEqual(circleIntersections(a, a), []);
    assert.deepEqual(circleIntersections(a, ellipse({ center: { x: 4, y: 0 }, rx: 5, ry: 4 })), []);
  });
  it('requires the intersection to belong to both independently rotated arc sweeps', () => {
    const a = ellipse({ rx: 5, ry: 5, rotation: Math.PI / 2, start: 90, end: 180 });
    const b = ellipse({ center: { x: 6, y: 0 }, rx: 5, ry: 5, start: 90, end: 180 });
    const points = circleIntersections(a, b); assert.equal(points.length, 1); pointClose(points[0], { x: 3, y: -4 });
    assert.deepEqual(circleIntersections(a, { ...b, start: 180, end: 270 }), []);
  });
});

describe('shared intersection snapping', () => {
  it('finds a line/ellipse crossing in a rotated group with the same targets for node editing', () => {
    const f = setup();
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 350, y: 250, rotation: 0.7 });
    f.editor.createShape({ id: 'shape:ellipse', type: 'cad-ellipse', parentId: 'shape:group', x: -100, y: -50, props: { w: 200, h: 100 } });
    line(f, 'shape:line', { x: -200, y: 30 }, { x: 200, y: 30 }); f.editor.updateShape({ id: 'shape:line', parentId: 'shape:group' });
    const matrix = f.editor.getShapePageTransform(f.editor.getShape('shape:group')), expected = matrix.applyToPoint({ x: 80, y: 30 });
    const query = { x: expected.x + 1, y: expected.y - 1 }, result = findCadSnap(f.editor, query, null);
    assert.equal(result?.kind, 'intersections'); pointClose(result?.point, expected);
    line(f, 'shape:edit', { x: 0, y: 0 }, { x: 10, y: 0 });
    pointClose(snapCadHandle(f.editor, f.editor.getShape('shape:edit'), query), expected);
  });
  it('finds circle pairs, filters off-arc roots, and never offers a curve bounding-box intersection', () => {
    const f = setup(); circle(f, 'shape:a'); circle(f, 'shape:b', 120);
    pointClose(findCadSnap(f.editor, { x: 62, y: 82 }, null)?.point, { x: 60, y: 80 });
    f.editor.deleteShapes(['shape:b']); f.editor.createShape({ id: 'shape:arc', type: 'cad-arc', x: 120, props: { radius: 100, startAngle: 90, endAngle: 180 } });
    assert.equal(findCadSnap(f.editor, { x: 62, y: 82 }, null), null);
    pointClose(findCadSnap(f.editor, { x: 62, y: -82 }, null)?.point, { x: 60, y: -80 });
    f.editor.deleteShapes(['shape:arc']); line(f, 'shape:line', { x: -150, y: 60 }, { x: 150, y: 60 });
    assert.equal(findCadSnap(f.editor, { x: 100, y: 60 }, null), null);
  });
  it('works for native ellipses and keeps isolated intersections ahead of nearest-edge fallback', () => {
    const f = setup(); f.editor.createShape({ id: 'shape:ellipse', type: 'geo', x: -100, y: -50, props: { geo: 'ellipse', w: 200, h: 100 } });
    line(f, 'shape:line', { x: -200, y: 30 }, { x: 200, y: 30 }); writeCadSnapSettings(f.editor, { nearest: true });
    const result = findCadSnap(f.editor, { x: 82, y: 31 }, null); assert.equal(result?.kind, 'intersections'); pointClose(result?.point, { x: 80, y: 30 });
  });
  it('uses a native ellipse actual height after its label expands the shape', () => {
    const f = setup(); f.editor.createShape({ id: 'shape:ellipse', type: 'geo', x: -100, y: -50, props: { geo: 'ellipse', w: 200, h: 60, growY: 40 } });
    line(f, 'shape:line', { x: -200, y: 30 }, { x: 200, y: 30 });
    pointClose(findCadSnap(f.editor, { x: 82, y: 31 }, null)?.point, { x: 80, y: 30 });
  });
  it('does not cull native rotated-ellipse intersections outside the renderer sampled bounds', () => {
    const f = setup(), rx = 10000, ry = 5000, rotation = 0.3;
    f.editor.createShape({ id: 'shape:group', type: 'group', rotation });
    f.editor.createShape({ id: 'shape:ellipse', type: 'geo', parentId: 'shape:group', x: -rx, y: -ry, props: { geo: 'ellipse', w: 2 * rx, h: 2 * ry } });
    // The native geo utility uses Ellipse2d; CAD ellipses already supply exact
    // extrema. Exercise the actual native primitive rather than our geo stub.
    const geometry = f.editor.getShapeGeometry;
    f.editor.getShapeGeometry = (shape: any) => {
      if (typeof shape === 'string') shape = f.editor.getShape(shape);
      return shape.id === 'shape:ellipse' ? new Ellipse2d({ width: 2 * rx, height: 2 * ry, isFilled: false }) : geometry(shape);
    };
    const theta = Math.atan2(-ry * Math.sin(rotation), rx * Math.cos(rotation));
    const expected = world(rx * Math.cos(theta), ry * Math.sin(theta), ellipse({ rx, ry, rotation }));
    const bounds = f.editor.getShapePageBounds('shape:ellipse');
    assert.ok(bounds.maxX < expected.x - 0.001, 'fixture must exercise sampled-bound undershoot');
    line(f, 'shape:line', { x: expected.x, y: -20000 }, { x: expected.x, y: 20000 });
    f.state.zoom = 10000;
    pointClose(findCadSnap(f.editor, expected, null)?.point, expected, 0.001);
  });
  it('respects settings, screen tolerance, Ctrl, self-exclusion, hidden/clipped geometry and locked references', () => {
    const f = setup(); circle(f, 'shape:circle'); line(f, 'shape:line', { x: -200, y: 60 }, { x: 200, y: 60 });
    const query = { x: 82, y: 62 };
    f.state.zoom = 10; assert.equal(findCadSnap(f.editor, query, null), null); f.state.zoom = 1;
    f.editor.inputs.ctrlKey = true; assert.equal(findCadSnap(f.editor, query, null), null); f.editor.inputs.ctrlKey = false;
    assert.equal(findCadSnap(f.editor, query, 'shape:circle' as any), null);
    f.editor.updateShape({ id: 'shape:circle', opacity: 0 }); assert.equal(findCadSnap(f.editor, query, null), null);
    f.editor.updateShape({ id: 'shape:circle', opacity: 1, isLocked: true }); assert.ok(findCadSnap(f.editor, query, null));
    f.editor.updateShape({ id: 'shape:circle', mask: [{ x: 0, y: 0 }] }); assert.equal(findCadSnap(f.editor, query, null), null);
    f.editor.updateShape({ id: 'shape:circle', mask: undefined }); writeCadSnapSettings(f.editor, { intersections: false }); assert.equal(findCadSnap(f.editor, query, null), null);
  });
  it('bounds the shared nearby-primitive budget and keeps unsupported ellipse pairs explicit', () => {
    const f = setup();
    for (let i = 0; i < MAX_SNAP_INTERSECTION_SOURCES; i++) line(f, `shape:line-${i}`, { x: -200, y: 60 }, { x: 200, y: 60 });
    circle(f, 'shape:circle'); assert.equal(findCadSnap(f.editor, { x: 82, y: 62 }, null), null);
    f.editor.deleteShapes(['shape:line-0']); pointClose(findCadSnap(f.editor, { x: 82, y: 62 }, null)?.point, { x: 80, y: 60 });
    assert.deepEqual(snapIntersections({ kind: 'ellipse', ellipse: ellipse({ ry: 50 }) }, { kind: 'ellipse', ellipse: ellipse({ center: { x: 100, y: 0 }, ry: 80 }) }), []);
  });
  for (const scale of [1, 10]) it(`exports the exact clicked intersection through an independent DXF parser at 1:${scale}`, () => {
    const f = setup(); circle(f, 'shape:circle'); line(f, 'shape:reference', { x: -200, y: 60 }, { x: 200, y: 60 });
    const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 160, y: 160 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.currentPagePoint = { x: 82, y: 62 }; tool.onPointerDown({ button: 0 } as any);
    assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'intersections'); tool.onComplete();
    const output = buildCadDxf(f.editor, 'all', { ...DEFAULT_CAD_SETTINGS, scale }), parsed = new DxfParser().parseSync(output.text)!;
    assert.deepEqual(output.omitted, []);
    const unit = scale * 25.4 / 96;
    const drawn = parsed.entities.find((e: any) => e.type === 'LINE' && Math.abs(e.vertices[0].x - 160 * unit) < 1e-6) as any;
    assert.ok(drawn); pointClose(drawn.vertices[1], { x: 80 * unit, y: -60 * unit }, 1e-6);
    const reference = parsed.entities.find((e: any) => e.type === 'CIRCLE') as any;
    close(Math.hypot(drawn.vertices[1].x - reference.center.x, drawn.vertices[1].y - reference.center.y), reference.radius, 1e-6);
  });
});
