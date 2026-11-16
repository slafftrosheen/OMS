import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCadDxf } from '../../src/lib/components/canvas/cad-import';
import { decodeDxf } from '../../src/lib/components/canvas/cad-dxf-decode';
import { cadMmPerPixel, DEFAULT_CAD_SETTINGS as settings } from '../../src/lib/components/canvas/cad-settings';
import type { CadContour, CadBezierNode } from '../../src/lib/components/canvas/cad-curves';

type Point = { x: number; y: number };
type Spline = { degree: number; knots: number[]; weights: number[]; controls: Point[] };
const fixture = (name: string) => readFileSync(`tests/fixtures/cad-external/splines/${name}.dxf`);
const mm = cadMmPerPixel(settings);
const sourcePoint = (p: Point): Point => ({ x: p.x * mm, y: -p.y * mm });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Deliberately separate from the production record parser and knot-insertion math. */
function fixtureSplines(text: string): Spline[] {
  const lines = text.trim().split(/\r?\n/), splines: Spline[] = [];
  let spline: Spline | undefined;
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]), value = lines[i + 1].trim();
    if (code === 0) {
      spline = value === 'SPLINE' ? { degree: 0, knots: [], weights: [], controls: [] } : undefined;
      if (spline) splines.push(spline);
    } else if (spline) {
      const n = Number(value);
      if (code === 71) spline.degree = n;
      if (code === 40) spline.knots.push(n);
      if (code === 41) spline.weights.push(n);
      if (code === 10) spline.controls.push({ x: n, y: NaN });
      if (code === 20) spline.controls.at(-1)!.y = n;
    }
  }
  return splines;
}

/** Cox-de Boor basis recurrence, not production's Bezier extraction algorithm. */
function basisPoint(s: Spline, u: number): Point {
  let basis = s.knots.slice(1).map((end, i) => s.knots[i] <= u && u < end ? 1 : 0);
  for (let degree = 1; degree <= s.degree; degree++) {
    basis = basis.slice(0, -1).map((_, i) => {
      const left = s.knots[i + degree] - s.knots[i];
      const right = s.knots[i + degree + 1] - s.knots[i + 1];
      return (left ? (u - s.knots[i]) / left * basis[i] : 0) +
        (right ? (s.knots[i + degree + 1] - u) / right * basis[i + 1] : 0);
    });
  }
  let x = 0, y = 0, denominator = 0;
  for (let i = 0; i < s.controls.length; i++) {
    const contribution = basis[i] * (s.weights[i] ?? 1);
    x += s.controls[i].x * contribution; y += s.controls[i].y * contribution;
    denominator += contribution;
  }
  assert.ok(denominator > 0, 'reference spline has a nonzero homogeneous denominator');
  return { x: x / denominator, y: y / denominator };
}
function cubicPoint(a: CadBezierNode, b: CadBezierNode, t: number): Point {
  const k = 1 - t;
  return sourcePoint({
    x: k ** 3 * a.x + 3 * k ** 2 * t * (a.x + a.outX) +
      3 * k * t ** 2 * (b.x + b.inX) + t ** 3 * b.x,
    y: k ** 3 * a.y + 3 * k ** 2 * t * (a.y + a.outY) +
      3 * k * t ** 2 * (b.y + b.inY) + t ** 3 * b.y
  });
}
function spans(s: Spline): [number, number][] {
  const out: [number, number][] = [];
  for (let i = s.degree; i < s.controls.length; i++)
    if (s.knots[i + 1] > s.knots[i]) out.push([s.knots[i], s.knots[i + 1]]);
  return out;
}
function assertExact(contour: CadContour, spline: Spline) {
  const intervals = spans(spline);
  assert.equal(contour.nodes.length - (contour.closed ? 0 : 1), intervals.length);
  intervals.forEach(([start, end], i) => {
    for (const t of [0.001, 0.07, 0.19, 0.43, 0.67, 0.89, 0.999]) {
      const expected = basisPoint(spline, start + t * (end - start));
      const actual = cubicPoint(contour.nodes[i], contour.nodes[(i + 1) % contour.nodes.length], t);
      assert.ok(distance(expected, actual) < 1e-8,
        `exact span ${i} differs from independent basis evaluation at ${t}`);
    }
  });
}
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
function assertRationalTolerance(contour: CadContour, spline: Spline, transform: (p: Point) => Point = p => p) {
  // Rational curves are conservatively flattened to line segments by OMS.
  for (const node of contour.nodes) assert.deepEqual([node.inX, node.inY, node.outX, node.outY], [0, 0, 0, 0]);
  const nodes = contour.nodes.map(sourcePoint), count = nodes.length - (contour.closed ? 0 : 1);
  for (const [start, end] of spans(spline)) {
    for (let j = 0; j < 257; j++) {
      const p = transform(basisPoint(spline, start + ((j + 0.5) / 257) * (end - start)));
      let nearest = Infinity;
      for (let i = 0; i < count; i++) nearest = Math.min(nearest, segmentDistance(p, nodes[i], nodes[(i + 1) % nodes.length]));
      assert.ok(nearest <= 0.00200001, `rational import exceeds 0.002 mm budget: ${nearest}`);
    }
  }
}
function read(name: string) {
  const text = decodeDxf(fixture(name));
  const plan = readCadDxf(settings, text, { unit: 'mm', keepCoordinates: true });
  assert.deepEqual(plan.omitted, []);
  assert.equal(plan.blocked, false);
  return { plan, splines: fixtureSplines(text) };
}

describe('published upstream DXF spline regression geometry', () => {
  it('preserves both published cubic splines with fit metadata and repeated interior knots exactly', () => {
    const { plan, splines } = read('dxf-parser-splines');
    assert.equal(plan.shapes?.length, 2);
    assert.equal(splines.length, 2);
    assert.deepEqual(splines.map(s => s.controls.length), [5, 22]);
    assert.deepEqual(plan.warnings, []);
    plan.contours.forEach((contour, i) => assertExact(contour, splines[i]));
  });
  it('retains all 22 ezdxf spans, including repeated control points and straight cubic sections', () => {
    const { plan, splines } = read('ezdxf-linear-segments');
    assert.equal(plan.shapes?.length, 1);
    assert.equal(spans(splines[0]).length, 22);
    assert.deepEqual(plan.warnings, []);
    assertExact(plan.contours[0], splines[0]);
    assert.ok(distance(sourcePoint(plan.contours[0].nodes[0]), splines[0].controls[0]) < 1e-9);
    assert.ok(distance(sourcePoint(plan.contours[0].nodes.at(-1)!), splines[0].controls.at(-1)!) < 1e-9);
  });
  it('imports published rational circles and an arc within the physical approximation budget', () => {
    const { plan, splines } = read('dxf-parser-arcs-as-splines');
    assert.equal(plan.shapes?.length, 3);
    assert.equal(splines.length, 3);
    assert.deepEqual(plan.contours.map(c => c.closed), [true, true, false]);
    assert.deepEqual(plan.warnings, ['import-curves-approximated']);
    plan.contours.forEach((contour, i) => assertRationalTolerance(contour, splines[i]));
    // Independent analytic truth for the two circles, including every chord midpoint.
    for (const [i, center, radius] of [
      [0, { x: 201.3461153580332, y: 180.0700474977344 }, 32.3201960914227],
      [1, { x: 201.3461153580332, y: 243.2413398582423 }, 7.3454991116870]
    ] as const) {
      const points = plan.contours[i].nodes.map(sourcePoint);
      points.forEach((a, j) => {
        const b = points[(j + 1) % points.length];
        assert.ok(Math.abs(distance(a, center) - radius) < 1e-8);
        assert.ok(Math.abs(distance({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, center) - radius) <= 0.00200001);
      });
    }
  });
  it('keeps the 0.002 mm rational tolerance through nested rotated, mirrored, nonuniform blocks', () => {
    const text = decodeDxf(fixture('dxf-parser-arcs-as-splines'));
    const body = text.replace(/^[\s\S]*?\n\s*2\nENTITIES\n/, '').replace(/\s*0\nENDSEC[\s\S]*$/, '').trimEnd() + '\n';
    const block = (name: string, contents: string) => `0\nBLOCK\n2\n${name}\n10\n0\n20\n0\n${contents}0\nENDBLK\n`;
    const insert = (name: string, x: number, y: number, sx: number, sy: number, degrees: number) =>
      `0\nINSERT\n2\n${name}\n10\n${x}\n20\n${y}\n41\n${sx}\n42\n${sy}\n50\n${degrees}\n`;
    const nested = '0\nSECTION\n2\nBLOCKS\n' +
      block('SOURCE', body) + block('NESTED', insert('SOURCE', -40, 12, 3, 0.4, 21)) +
      '0\nENDSEC\n0\nSECTION\n2\nENTITIES\n' + insert('NESTED', 13, -5, -2, 0.5, 67) +
      '0\nENDSEC\n0\nEOF\n';
    const transform = (p: Point, x: number, y: number, sx: number, sy: number, degrees: number) => {
      const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
      return { x: x + c * sx * p.x - s * sy * p.y, y: y + s * sx * p.x + c * sy * p.y };
    };
    const expected = (p: Point) => transform(transform(p, -40, 12, 3, 0.4, 21), 13, -5, -2, 0.5, 67);
    const plan = readCadDxf(settings, nested, { unit: 'mm', keepCoordinates: true });
    assert.deepEqual(plan.omitted, []);
    assert.equal(plan.shapes?.length, 3);
    assert.deepEqual(plan.contours.map(c => c.closed), [true, true, false]);
    assert.deepEqual(plan.warnings, ['import-curves-approximated']);
    fixtureSplines(text).forEach((spline, i) => assertRationalTolerance(plan.contours[i], spline, expected));
  });
  it('handles the published ezdxf knot-imprecision regression without losing the start of the curve', () => {
    const { plan, splines } = read('ezdxf-knot-imprecision');
    assert.equal(plan.shapes?.length, 1);
    assert.deepEqual(plan.warnings, ['import-curves-approximated']);
    assertRationalTolerance(plan.contours[0], splines[0]);
    assert.ok(distance(sourcePoint(plan.contours[0].nodes[0]), splines[0].controls[0]) < 1e-8);
    assert.ok(distance(sourcePoint(plan.contours[0].nodes.at(-1)!), splines[0].controls.at(-1)!) < 1e-8);
  });
});
