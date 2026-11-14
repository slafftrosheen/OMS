import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { cubicCubicIntersections, MAX_CUBIC_CUBIC_SNAP_PAIRS } from '../../src/lib/components/canvas/cad-cubic-intersections';
import { snapIntersections } from '../../src/lib/components/canvas/cad-intersections';
import { cubicAt, splitCubic, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { findCadSnap, snapCadHandle, cadSnapIndicator } from '../../src/lib/components/canvas/cad-snap';
import { writeCadSnapSettings } from '../../src/lib/components/canvas/cad-snap-settings';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { DEFAULT_CAD_SETTINGS, type CadPoint } from '../../src/lib/components/canvas/cad-settings';

// A=(x,T3(x)), B=(T3(y),y). T9(x)=x gives nine distinct intersections.
const wave = [{ x: -1, y: -1 }, { x: -1 / 3, y: 5 }, { x: 1 / 3, y: -5 }, { x: 1, y: 1 }];
const other = wave.map(p => ({ x: p.y, y: p.x }));
const close = (actual: CadPoint | undefined, expected: CadPoint, tolerance = 1e-7) => {
  assert.ok(actual); assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) <= tolerance, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};
function graph(c0: number, c1: number, c2: number, c3 = 0): CadPoint[] {
  return [c0, c0 + c1 / 3, c0 + 2 * c1 / 3 + c2 / 3, c0 + c1 + c2 + c3].map((y, i) => ({ x: i / 3, y }));
}
function subcurve(points: CadPoint[], lo: number, hi: number) { return splitCubic(splitCubic(points, hi)[0], lo / hi)[1]; }
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

describe('isolated original cubic intersections', () => {
  it('finds all nine intersections on both original curves, including endpoints', () => {
    const roots = cubicCubicIntersections(wave, other); assert.equal(roots.length, 9);
    const xs = [...Array.from({ length: 5 }, (_, k) => Math.cos(k * Math.PI / 4)), ...Array.from({ length: 4 }, (_, k) => Math.cos((k + 1) * Math.PI / 5))].sort((a, b) => a - b);
    roots.forEach((p, i) => {
      close(p, { x: xs[i], y: 4 * xs[i] ** 3 - 3 * xs[i] });
      close(p, cubicAt(wave, (p.x + 1) / 2)); close(p, cubicAt(other, (p.y + 1) / 2));
    });
  });
  it('returns the same crossings when pair order or parameter direction is reversed', () => {
    const expected = cubicCubicIntersections(wave, other);
    for (const points of [cubicCubicIntersections(other, wave), cubicCubicIntersections([...wave].reverse(), other), cubicCubicIntersections(wave, [...other].reverse())]) {
      assert.equal(points.length, 9); points.forEach(p => assert.ok(expected.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 1e-8)));
    }
  });
  it('refines a non-dyadic tangent contact to one point and rejects a near miss', () => {
    const t = 0.37, a = graph(t * t, -2 * t, 1), b = a.map(p => ({ x: p.x, y: -p.y }));
    const roots = cubicCubicIntersections(a, b); assert.equal(roots.length, 1); close(roots[0], { x: t, y: 0 }, 1e-9);
    assert.deepEqual(cubicCubicIntersections(a, b.map(p => ({ x: p.x, y: p.y - 1e-7 }))), []);
  });
  it('distinguishes two close crossings from a single tangent', () => {
    const t = 0.37, a = graph(t * t, -2 * t, 1), b = a.map(p => ({ x: p.x, y: -p.y + 2e-8 }));
    const roots = cubicCubicIntersections(a, b); assert.equal(roots.length, 2);
    close(roots[0], { x: t - 1e-4, y: 1e-8 }, 1e-8); close(roots[1], { x: t + 1e-4, y: 1e-8 }, 1e-8);
  });
  it('does not manufacture targets for coincident, reversed or partially overlapping curves', () => {
    const middle = subcurve(wave, 0.2, 0.8);
    for (const [a, b] of [[wave, wave], [wave, [...wave].reverse()], [wave, middle], [subcurve(wave, 0.1, 0.7), subcurve(wave, 0.4, 0.9)], [middle, [...wave].reverse()]]) assert.deepEqual(cubicCubicIntersections(a, b), []);
  });
  it('keeps disjoint split curves disjoint but retains a shared split endpoint', () => {
    assert.deepEqual(cubicCubicIntersections(subcurve(wave, 0.1, 0.3), subcurve(wave, 0.7, 0.9)), []);
    const [left, right] = splitCubic(wave, 0.37), points = cubicCubicIntersections(left, right);
    assert.equal(points.length, 1); close(points[0], cubicAt(wave, 0.37));
  });
  it('preserves roots and contact locations under translation, rotation and scale', () => {
    const expected = cubicCubicIntersections(wave, other);
    for (const scale of [0.01, 100, 10000]) for (const angle of [-1.8, 0.7]) {
      const world = (p: CadPoint) => ({ x: 250 + scale * (p.x * Math.cos(angle) - p.y * Math.sin(angle)), y: -140 + scale * (p.x * Math.sin(angle) + p.y * Math.cos(angle)) });
      const points = cubicCubicIntersections(wave.map(world), other.map(world)); assert.equal(points.length, 9);
      points.forEach((p, i) => close(p, world(expected[i]), Math.max(1e-7, scale * 1e-9)));
      const t = 0.37, a = graph(t * t, -2 * t, 1), b = a.map(p => ({ x: p.x, y: -p.y }));
      const contact = cubicCubicIntersections(a.map(world), b.map(world)); assert.equal(contact.length, 1, `scale=${scale}, angle=${angle}`); close(contact[0], world({ x: t, y: 0 }), Math.max(1e-7, scale * 1e-9));
    }
  });
  it('rejects malformed and degenerate curves and fails closed on a spent search budget', () => {
    for (const bad of [wave.slice(0, 3), Array(4).fill({ x: 0, y: 0 }), [wave[0], wave[1], wave[2], { x: NaN, y: 0 }]]) assert.deepEqual(cubicCubicIntersections(wave, bad), []);
    const budget = { remaining: 1 }; assert.deepEqual(cubicCubicIntersections(wave, other, budget), []); assert.ok(budget.remaining <= 0);
    assert.deepEqual(cubicCubicIntersections(wave, other.map(p => ({ x: p.x + 20, y: p.y }))), []);
  });
  it('dispatches cubic pairs through the shared intersection entry point', () => {
    assert.equal(snapIntersections({ kind: 'cubic', points: wave }, { kind: 'cubic', points: other }).length, 9);
  });
});

describe('cubic pair snaps in the shared editor', () => {
  it('shares a rotated pair target with node editing and prioritizes it over nearest edges', () => {
    const f = setup(); f.editor.createShape({ id: 'shape:group', type: 'group', x: 300, y: 200, rotation: 0.6 });
    curve(f, 'shape:a', wave.map(p => ({ x: p.x * 100, y: p.y * 100 })), { parentId: 'shape:group' });
    curve(f, 'shape:b', other.map(p => ({ x: p.x * 100, y: p.y * 100 })), { parentId: 'shape:group' });
    const expected = { x: 300, y: 200 }, query = { x: 301, y: 201 }; writeCadSnapSettings(f.editor, { nearest: true });
    const result = findCadSnap(f.editor, query, null); assert.equal(result?.kind, 'intersections'); close(result?.point, expected);
    curve(f, 'shape:edit', wave, { x: 200, y: 200, rotation: -0.2 });
    const edit = f.editor.getShape('shape:edit'), inverse = f.editor.getShapePageTransform(edit).clone().invert();
    close(snapCadHandle(f.editor, edit, inverse.applyToPoint(query)), inverse.applyToPoint(expected));
  });
  it('respects self-exclusion, screen tolerance, Ctrl and the existing setting', () => {
    const f = setup(); curve(f, 'shape:a', wave.map(p => ({ x: p.x * 100, y: p.y * 100 }))); curve(f, 'shape:b', other.map(p => ({ x: p.x * 100, y: p.y * 100 })));
    const query = { x: 1, y: 1 }; close(findCadSnap(f.editor, query, null)?.point, { x: 0, y: 0 });
    assert.equal(findCadSnap(f.editor, query, 'shape:a' as any), null);
    f.state.zoom = 10; assert.equal(findCadSnap(f.editor, query, null), null); f.state.zoom = 1;
    f.editor.inputs.ctrlKey = true; assert.equal(findCadSnap(f.editor, query, null), null); f.editor.inputs.ctrlKey = false;
    writeCadSnapSettings(f.editor, { intersections: false }); assert.equal(findCadSnap(f.editor, query, null), null);
  });
  it('bounds costly pair counts while leaving straight-segment targets available', () => {
    const f = setup();
    for (let i = 0; i <= MAX_CUBIC_CUBIC_SNAP_PAIRS; i++) curve(f, `shape:curve-${i}`, wave.map(p => ({ x: p.x * 100, y: p.y * 100 })));
    curve(f, 'shape:crossing', other.map(p => ({ x: p.x * 100, y: p.y * 100 })));
    assert.equal(findCadSnap(f.editor, { x: 1, y: 1 }, null), null);
    for (const [id, points] of [['shape:line-a', [{ x: -20, y: 0 }, { x: 20, y: 0 }]], ['shape:line-b', [{ x: 0, y: -20 }, { x: 0, y: 20 }]]] as const)
      f.editor.createShape({ id, type: 'cad-path', props: { points, closed: false } });
    close(findCadSnap(f.editor, { x: 1, y: 1 }, null)?.point, { x: 0, y: 0 });
  });
  for (const scale of [1, 10]) it(`exports a clicked pair intersection at 1:${scale} through an independent DXF parser`, () => {
    const f = setup(); curve(f, 'shape:a', wave.map(p => ({ x: p.x * 100, y: p.y * 100 }))); curve(f, 'shape:b', other.map(p => ({ x: p.x * 100, y: p.y * 100 })));
    const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 300, y: 200 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.currentPagePoint = { x: 1, y: 1 }; tool.onPointerDown({ button: 0 } as any);
    assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'intersections'); tool.onComplete();
    const output = buildCadDxf(f.editor, 'all', { ...DEFAULT_CAD_SETTINGS, scale }), parsed = new DxfParser().parseSync(output.text)!;
    assert.deepEqual(output.omitted, []); const unit = scale * 25.4 / 96;
    const drawn = parsed.entities.find((e: any) => e.type === 'LINE' && Math.abs(e.vertices[0].x - 300 * unit) < 1e-6) as any;
    assert.ok(drawn); close(drawn.vertices[1], { x: 0, y: 0 }, 1e-6);
  });
});
