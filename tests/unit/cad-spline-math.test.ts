import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { splineContours, rationalSplineContour } from "../../src/lib/components/canvas/cad-nurbs";
import { cubicAt, contourSegments, validContours, type CadContour } from "../../src/lib/components/canvas/cad-curves";
import type { CadPoint } from "../../src/lib/components/canvas/cad-settings";

// Independent de Boor evaluation in homogeneous coordinates: production converts
// the basis to Bernstein polynomials and never evaluates this triangle.
function evaluate(controls: CadPoint[], knots: number[], degree: number, parameter: number, weights = controls.map(() => 1), explicitSpan?: number): CadPoint {
  const n = controls.length - 1;
  let span = explicitSpan ?? n;
  if (explicitSpan === undefined && parameter < knots[n + 1])
    for (let i = degree; i <= n; i++) if (parameter >= knots[i] && parameter < knots[i + 1]) { span = i; break; }
  const d = controls.slice(span - degree, span + 1).map((p, j) => {
    const w = weights[span - degree + j];
    return [p.x * w, p.y * w, w];
  });
  for (let r = 1; r <= degree; r++)
    for (let j = degree; j >= r; j--) {
      const i = span - degree + j;
      const alpha = (parameter - knots[i]) / (knots[i + degree - r + 1] - knots[i]);
      d[j] = d[j].map((v, axis) => (1 - alpha) * d[j - 1][axis] + alpha * v);
    }
  return { x: d[degree][0] / d[degree][2], y: d[degree][1] / d[degree][2] };
}
const near = (a: CadPoint, b: CadPoint, tolerance = 1e-9) =>
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= tolerance, JSON.stringify({ a, b, tolerance }));
function spans(knots: number[], degree: number, count: number) {
  return Array.from({ length: count - degree }, (_, j) => j + degree).filter((j) => knots[j] < knots[j + 1]);
}
function checkExact(controls: CadPoint[], knots: number[], degree: number, closed = false) {
  const result = splineContours(controls, undefined, knots, degree, closed, 0.01);
  assert.equal(result.approximated, false);
  assert.ok(validContours(result.contours));
  const pieces = result.contours.flatMap((c) => [...contourSegments(c)]);
  const intervals = spans(knots, degree, controls.length);
  assert.equal(pieces.length, intervals.length);
  for (let j = 0; j < intervals.length; j++)
    for (let step = 0; step <= 24; step++) {
      const t = step / 24, k = intervals[j], parameter = knots[k] * (1 - t) + knots[k + 1] * t;
      // Cubic line nodes have zero handles, which changes speed, not geometry.
      const actual = degree === 1
        ? { x: pieces[j][0].x * (1 - t) + pieces[j][3].x * t, y: pieces[j][0].y * (1 - t) + pieces[j][3].y * t }
        : cubicAt(pieces[j], t);
      near(actual, evaluate(controls, knots, degree, parameter, undefined, k), 2e-8);
    }
  return result;
}
function distanceToLine(p: CadPoint, a: CadPoint, b: CadPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ratio = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - ratio * dx, p.y - a.y - ratio * dy);
}
function distanceToContours(p: CadPoint, contours: CadContour[]) {
  return Math.min(...contours.flatMap((c) => [...contourSegments(c)].map((s) => distanceToLine(p, s[0], s[3]))));
}
function checkApproximation(controls: CadPoint[], weights: number[] | undefined, knots: number[], degree: number, tolerance: number, closed = false) {
  const result = splineContours(controls, weights, knots, degree, closed, tolerance);
  assert.ok(result.approximated);
  assert.ok(validContours(result.contours));
  for (const k of spans(knots, degree, controls.length))
    for (let step = 0; step <= 200; step++) {
      const t = step / 200, parameter = knots[k] * (1 - t) + knots[k + 1] * t;
      const p = evaluate(controls, knots, degree, parameter, weights, k);
      assert.ok(distanceToContours(p, result.contours) <= tolerance + 1e-9, JSON.stringify({ p, tolerance }));
    }
  return result;
}
const errorCode = (code: string) => (error: unknown) => !!error && (error as { code: string }).code === code;
const control = [{ x: 0, y: 0 }, { x: 3, y: 7 }, { x: 8, y: -2 }, { x: 12, y: 4 }];

describe("DXF spline mathematics", () => {
  it("preserves clamped and unclamped polynomial spans of degrees 1, 2 and 3", () => {
    checkExact(control, [0, 0, 1, 2, 3, 3], 1);
    checkExact(control, [0, 0, 0, 0.4, 1, 1, 1], 2);
    checkExact(control, [0, 0, 0, 0, 1, 1, 1, 1], 3);
    checkExact(control, [-4, -3, 0, 0.3, 1, 8, 9], 2);
    checkExact(control, [-4, -2, -1, 0, 1, 2, 4, 9], 3);
  });
  it("preserves periodic cubic curves as exact editable closed cubics", () => {
    const loop = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 12 }, { x: 0, y: 12 }];
    const controls = [...loop, ...loop.slice(0, 3)];
    const result = checkExact(controls, Array.from({ length: 11 }, (_, i) => i - 3), 3, true);
    assert.equal(result.contours[0].closed, true);
    assert.equal(result.contours[0].nodes.length, 4);
  });
  it("keeps C0 corners and splits degree+1 repeated knots into separate contours", () => {
    const p = [...control, { x: 15, y: 2 }, { x: 20, y: 10 }, { x: 25, y: 0 }];
    const continuous = checkExact(p, [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2], 3);
    assert.equal(continuous.contours.length, 1);
    const disconnected = [...control, ...control.map((p) => ({ x: p.x + 50, y: p.y + 20 }))];
    const knots = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2];
    const result = checkExact(disconnected, knots, 3);
    assert.equal(result.contours.length, 2);
    assert.deepEqual(result.contours.map((c) => c.nodes.length), [2, 2]);
    assert.throws(() => rationalSplineContour(disconnected, disconnected.map(() => 1), knots, 3, false, 0.01), errorCode("spline-knots"));
  });
  it("splits discontinuities even when the endpoints happen to coincide", () => {
    const p = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 0 }];
    const result = checkExact(p, [0, 0, 1, 1, 2, 2], 1);
    assert.equal(result.contours.length, 2);
  });
  it("approximates a rational quadratic circle and conservatively bounds radial error", () => {
    const p = [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: -10, y: 10 }, { x: -10, y: 0 }, { x: -10, y: -10 }, { x: 0, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 0 }];
    const w = [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1];
    const knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
    const tolerance = 0.01;
    const result = checkApproximation(p, w, knots, 2, tolerance, true);
    for (const segment of contourSegments(result.contours[0])) {
      near({ x: Math.hypot(segment[0].x, segment[0].y), y: 0 }, { x: 10, y: 0 });
      const middle = cubicAt(segment, 0.5);
      assert.ok(Math.abs(Math.hypot(middle.x, middle.y) - 10) <= tolerance);
    }
  });
  it("supports degree 6 and 16 curves with a conservative control-hull bound", () => {
    for (const degree of [6, 16]) {
      const p = Array.from({ length: degree + 1 }, (_, i) => ({ x: i * 3, y: (i % 3 - 1) * 10 }));
      checkApproximation(p, undefined, [...Array(degree + 1).fill(0), ...Array(degree + 1).fill(1)], degree, 0.025);
    }
  });
  it("does not miss a high-degree excursion that lies between endpoint samples", () => {
    const p = Array.from({ length: 9 }, (_, i) => ({ x: i, y: i === 1 ? 100 : 0 }));
    const result = checkApproximation(p, undefined, [...Array(9).fill(0), ...Array(9).fill(1)], 8, 0.01);
    assert.ok(result.contours[0].nodes.some((p) => p.y > 30));
  });
  it("retains shape under tiny or huge affine knot and weight scaling", () => {
    const baseKnots = [-3, -2, -1, 0, 1, 2, 3, 4];
    const base = splineContours(control, undefined, baseKnots, 3, false, 0.01);
    for (const scale of [1e-300, 1e-12, 1e12, 1e300]) {
      const scaled = splineContours(control, undefined, baseKnots.map((k) => k * scale), 3, false, 0.01);
      const expectedPieces = [...contourSegments(base.contours[0])];
      [...contourSegments(scaled.contours[0])].forEach((segment, i) =>
        segment.forEach((point, j) => near(point, expectedPieces[i][j], 1e-12)));
    }
    const translated = splineContours(control, undefined, baseKnots.map((k) => k + 1e12), 3, false, 0.01);
    assert.deepEqual(translated, base);
    const rational = splineContours(control, [1, 2, 3, 4], baseKnots, 3, false, 0.01);
    for (const scale of [1e-250, 1e250]) {
      const scaled = splineContours(control, [1, 2, 3, 4].map((w) => w * scale), baseKnots, 3, false, 0.01);
      assert.equal(scaled.contours[0].nodes.length, rational.contours[0].nodes.length);
      scaled.contours[0].nodes.forEach((n, i) => near(n, rational.contours[0].nodes[i]));
    }
  });
  it("handles finite knot ranges whose difference overflows", () => {
    const result = splineContours(control, undefined, [-1e308, -1e308, -1e308, -1e308, 1e308, 1e308, 1e308, 1e308], 3, false, 0.01);
    assert.deepEqual(result, splineContours(control, undefined, [0, 0, 0, 0, 1, 1, 1, 1], 3, false, 0.01));
  });
  it("retains meaningful narrow spans instead of globally merging knots", () => {
    const p = [...control, { x: 14, y: -3 }];
    const knots = [0, 0, 0, 0, 1e-14, 1, 1, 1, 1];
    const result = checkExact(p, knots, 3);
    assert.equal(result.contours[0].nodes.length, 3);
  });
  it("preserves an exact one-span closed cubic loop with two editable nodes", () => {
    const p = [{ x: 0, y: 0 }, { x: 8, y: 10 }, { x: -8, y: 10 }, { x: 0, y: 0 }];
    const knots = [0, 0, 0, 0, 1, 1, 1, 1];
    const result = splineContours(p, undefined, knots, 3, true, 0.01);
    assert.ok(validContours(result.contours));
    const pieces = [...contourSegments(result.contours[0])];
    assert.equal(pieces.length, 2);
    for (let i = 0; i <= 50; i++) {
      const t = i / 50, piece = t < 0.5 ? 0 : 1;
      near(cubicAt(pieces[piece], t * 2 - piece), evaluate(p, knots, 3, t));
    }
  });
  it("does not bridge open endpoints just because the DXF flag says closed", () => {
    assert.throws(() => splineContours(control, undefined, [0, 0, 0, 0, 1, 1, 1, 1], 3, true, 100), errorCode("spline-closure"));
  });
  it("refuses a visible closing gap even at a large coordinate offset", () => {
    const p = [{ x: 1e12, y: 1e12 }, { x: 1e12 + 5, y: 1e12 + 10 }, { x: 1e12 - 5, y: 1e12 + 10 }, { x: 1e12 + 0.02, y: 1e12 }];
    assert.throws(() => splineContours(p, undefined, [0, 0, 0, 0, 1, 1, 1, 1], 3, true, 0.1), errorCode("spline-closure"));
    const tinyGap = [{ x: 0, y: 0 }, { x: 3, y: 7 }, { x: 8, y: -2 }, { x: 5e-10, y: 0 }];
    assert.throws(() => splineContours(tinyGap, undefined, [0, 0, 0, 0, 1, 1, 1, 1], 3, true, 1e-12), errorCode("spline-closure"));
  });
  it("keeps large nonclamped cubic files editable without exhausting approximation nodes", () => {
    const p = Array.from({ length: 4096 }, (_, i) => ({ x: i * 0.1, y: Math.sin(i) }));
    const knots = Array.from({ length: p.length + 4 }, (_, i) => i);
    const result = splineContours(p, undefined, knots, 3, false, 1e-10);
    assert.equal(result.approximated, false);
    assert.equal(result.contours[0].nodes.length, 4094);
    assert.ok(validContours(result.contours));
  });
  it("does not silently underflow very small relative weights", () => {
    const p = [{ x: 0.001, y: 0.002 }, { x: 0.004, y: 0.006 }];
    assert.throws(() => splineContours(p, [1e-320, 1], [0, 0, 1, 1], 1, false, 0.001), errorCode("spline-weights"));
  });
  it("bounds work and refuses corrupt geometry with specific reasons", () => {
    const knots = [0, 0, 0, 0, 1, 1, 1, 1];
    assert.throws(() => splineContours(control, undefined, knots, 17, false, 0.1), errorCode("spline-degree"));
    assert.throws(() => splineContours(control, undefined, knots, 3, false, 0), errorCode("spline-limit"));
    assert.throws(() => splineContours(control, [1, 0, 1, 1], knots, 3, false, 0.1), errorCode("spline-weights"));
    assert.throws(() => splineContours(control, [1e-300, 1e300, 1, 1], knots, 3, false, 0.1), errorCode("spline-weights"));
    assert.throws(() => splineContours(control, [1], knots, 3, false, 0.1), errorCode("spline-weights"));
    assert.throws(() => splineContours(control, undefined, [0, 0, 0, 0, 0, 1, 1, 1], 3, false, 0.1), errorCode("spline-knots"));
    assert.throws(() => splineContours(control, undefined, [0, 0, 0, 0, 1, 0.5, 1, 1], 3, false, 0.1), errorCode("spline-knots"));
    assert.throws(() => splineContours(control, undefined, knots.slice(1), 3, false, 0.1), errorCode("spline-knots"));
    assert.throws(() => splineContours([{ x: Infinity, y: 0 }, ...control.slice(1)], undefined, knots, 3, false, 0.1), errorCode("spline-control-points"));
    assert.throws(() => splineContours(control, [1, 2, 2, 1], knots, 3, false, 1e-20), errorCode("spline-limit"));
  });
  it("matches de Boor across a deterministic family of mixed-multiplicity knot vectors", () => {
    let seed = 73841;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let sample = 0; sample < 60; sample++) {
      const degree = 1 + sample % 3;
      const count = degree + 2 + sample % 7;
      const p = Array.from({ length: count }, () => ({ x: random() * 200 - 100, y: random() * 200 - 100 }));
      const inner = Array.from({ length: count - degree - 1 }, () => Math.floor(random() * 5) / 5).sort((a, b) => a - b);
      // Keep multiplicities legal; use well-separated interior values if the
      // random vector contains more than degree + 1 identical knots.
      const knots = sample % 2 === 0
        ? [...Array(degree + 1).fill(-1), ...inner.map((v, i) => v + i * 1e-4), ...Array(degree + 1).fill(2)]
        : Array.from({ length: count + degree + 1 }, (_, i) => i + random() * 0.1);
      checkExact(p, knots, degree);
    }
  });
});
