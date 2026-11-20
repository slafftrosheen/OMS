import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { buildCadFreehandGeometry, DEFAULT_CAD_FREEHAND_OPTIONS, validCadFreehandOptions, type CadFreehandOptions, type FreehandSample } from '../../src/lib/components/canvas/cad-freehand';
import { buildCadCalligraphyContours, resolveCalligraphyNibs } from '../../src/lib/components/canvas/cad-calligraphy';
import { validContours, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { validVectorPaint } from '../../src/lib/components/canvas/cad-paint';

const RAD = Math.PI / 180;
const near = (actual: number, expected: number, tolerance = .00003) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const options = (patch: Partial<CadFreehandOptions> = {}): CadFreehandOptions => ({ ...DEFAULT_CAD_FREEHAND_OPTIONS,
  mode: 'calligraphy', width: 20, nibAngle: 0, nibTilt: 30, smoothing: 0, autoClose: false, ...patch });
const sample = (x = 0, y = 0, pressure = 1, tilt?: [number, number]): FreehandSample => ({ x, y, pressure, ...(tilt ? { tiltX: tilt[0], tiltY: tilt[1] } : {}) });
const geometry = (samples: FreehandSample[], patch: Partial<CadFreehandOptions> = {}) => buildCadFreehandGeometry(samples, options(patch), 8);
const area = (contour: CadContour) => contour.nodes.reduce((sum, a, i, all) => {
  const b = all[(i + 1) % all.length]; return sum + a.x * b.y - b.x * a.y;
}, 0) / 2;
function inside(contours: CadContour[], x: number, y: number): boolean {
  let winding = 0;
  for (const contour of contours) for (let i = 0; i < contour.nodes.length; i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length], cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (a.y <= y && b.y > y && cross > 0) winding++;
    else if (a.y > y && b.y <= y && cross < 0) winding--;
  }
  return winding !== 0;
}
function upperAtX(contours: CadContour[], x: number): number {
  const intersections: number[] = [];
  for (const contour of contours) for (let i = 0; i < contour.nodes.length; i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length];
    if (a.x !== b.x && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) intersections.push(a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y));
  }
  return Math.max(...intersections);
}

describe('fixed elliptical calligraphy geometry', () => {
  it('creates a filled editable ellipse with the exact physical axes and bounded area error', () => {
    const result = geometry([sample(40, 60)]);
    near(result.bounds.x, 30); near(result.bounds.y, 55); near(result.bounds.w, 20); near(result.bounds.h, 10);
    assert.equal(result.contours.length, 1); assert.equal(result.fillRule, 'nonzero'); assert.equal(result.closed, true);
    assert.equal(result.paint.fill, '#172535'); assert.equal(result.paint.stroke, 'none'); assert.equal(result.paint.strokeWidth, 0);
    assert.ok(Math.abs(area(result.contours[0]) - Math.PI * 10 * 5) / (Math.PI * 50) < .004);
    assert.ok(validContours(result.contours)); assert.ok(validVectorPaint(result.paint));
  });

  it('retains exact rotated ellipse bounds and applies pressure to both axes', () => {
    const result = geometry([sample(0, 0, .5)], { nibAngle: 45 });
    const half = Math.sqrt(5 * 5 / 2 + 2.5 * 2.5 / 2);
    near(result.bounds.x, -half); near(result.bounds.y, -half); near(result.bounds.w, 2 * half); near(result.bounds.h, 2 * half);
    const vertical = geometry([sample()], { nibAngle: 90 }); near(vertical.bounds.w, 10); near(vertical.bounds.h, 20);
  });

  it('sweeps horizontal and vertical segments with a direction-dependent width', () => {
    const horizontal = geometry([sample(), sample(100, 0)]);
    near(horizontal.bounds.x, -10); near(horizontal.bounds.y, -5); near(horizontal.bounds.w, 120); near(horizontal.bounds.h, 10);
    const vertical = geometry([sample(), sample(0, 100)]);
    near(vertical.bounds.x, -10); near(vertical.bounds.y, -5); near(vertical.bounds.w, 20); near(vertical.bounds.h, 110);
  });

  it('uses the exact unequal-radius tangent envelope in the ellipse frame', () => {
    const result = geometry([sample(0, 0, .1), sample(100, 0, 1)]);
    const slope = (10 - 1) / 100;
    near(upperAtX(result.contours, 50), .5 * (1 + slope * 50) / Math.sqrt(1 - slope * slope), .0001);
    assert.ok(inside(result.contours, 50, 2)); assert.equal(inside(result.contours, 50, 4), false);
  });

  it('handles a dominant ellipse and zero-pressure taper without degenerate polygons', () => {
    const dominant = geometry([sample(0, 0, .1), sample(2, 0, 1)]);
    near(dominant.bounds.x, -8); near(dominant.bounds.y, -5); near(dominant.bounds.w, 20); near(dominant.bounds.h, 10);
    const taper = geometry([sample(0, 0, 0), sample(100, 0, 1)]);
    near(taper.bounds.x, 0); near(taper.bounds.w, 110); assert.ok(validContours(taper.contours));
    assert.throws(() => geometry([sample(0, 0, 0)]), /freehand-empty/);
  });

  it('keeps legal page-space coordinates while the auxiliary skinny-nib space is much larger', () => {
    const result = geometry([sample(-900000, 0), sample(900000, 0)], { width: 4, nibTilt: 15, nibAngle: 45 });
    assert.ok(validContours(result.contours)); assert.ok(result.bounds.x < -900000); assert.ok(result.bounds.x + result.bounds.w > 900000);
  });

  it('produces opposite winding for holes and resolves crossings', () => {
    const points = [sample(0, 0), sample(100, 0), sample(100, 100), sample(0, 100), sample(0, 0)];
    const result = geometry(points, { autoClose: true, nibAngle: 35 });
    assert.equal(result.contours.length, 2); assert.ok(area(result.contours[0]) * area(result.contours[1]) < 0);
    assert.equal(inside(result.contours, 50, 50), false); assert.ok(inside(result.contours, 0, 50));
    const crossing = geometry([sample(), sample(100, 100), sample(0, 100), sample(100, 0)]);
    assert.ok(validContours(crossing.contours)); assert.ok(inside(crossing.contours, 50, 50));
  });

  it('does not change round pressure ink or centerline geometry when nib settings change', () => {
    const points = [sample(0, 0, .2, [45, 10]), sample(30, 20, .9, [0, 60]), sample(80, 10, .3, [-40, 20])];
    for (const mode of ['curve', 'ink'] as const) {
      const a = geometry(points, { mode }), b = geometry(points, { mode, nibAngle: -117, nibTilt: 79, useTilt: true, useBearing: true });
      assert.deepEqual(a, b);
    }
  });
});

describe('pen tilt and bearing resolve independently', () => {
  it('uses fixed defaults when orientation is missing and interprets reported zero tilt as vertical', () => {
    const config = options({ nibAngle: 40, nibTilt: 15, useTilt: true, useBearing: true });
    const [missing, vertical] = resolveCalligraphyNibs([sample(), sample(0, 0, 1, [0, 0])], config);
    near(missing.angle, 40); near(missing.tilt, 15); near(missing.aspect, Math.sin(15 * RAD));
    near(vertical.angle, 40); near(vertical.tilt, 90); near(vertical.aspect, 1);
  });

  it('maps tilt to aspect while a fixed angle remains fixed', () => {
    const [nib] = resolveCalligraphyNibs([sample(0, 0, 1, [60, 0])], options({ nibAngle: 32, useTilt: true }));
    near(nib.tilt, 30); near(nib.aspect, .5); near(nib.angle, 32);
    const result = geometry([sample(0, 0, 1, [60, 0])], { useTilt: true, nibAngle: 0, nibTilt: 15 });
    near(result.bounds.h, 10);
  });

  it('maps bearing to angle while a fixed tilt remains fixed', () => {
    const [right, down] = resolveCalligraphyNibs([sample(0, 0, 1, [45, 0]), sample(0, 0, 1, [0, 45])], options({ useBearing: true, nibTilt: 15 }));
    near(right.angle, 0); near(down.angle, 90); near(right.tilt, 15); near(down.tilt, 15);
    const result = geometry([sample(0, 0, 1, [0, 45])], { useBearing: true });
    near(result.bounds.w, 10); near(result.bounds.h, 20);
  });

  it('resolves combined projections without nonfinite values at extreme tilts', () => {
    const [diagonal] = resolveCalligraphyNibs([sample(0, 0, 1, [45, 45])], options({ useTilt: true, useBearing: true }));
    near(diagonal.angle, 45); near(diagonal.aspect, 1 / Math.sqrt(3));
    for (const [pair, angle] of [[[90, 0], 0], [[-90, 0], 180], [[0, 90], 90], [[0, -90], 270], [[90, -90], 0], [[90, 20], 0], [[20, 90], 0]] as [[number, number], number][]) {
      const [nib] = resolveCalligraphyNibs([sample(0, 0, 1, pair)], options({ useTilt: true, useBearing: true }));
      near(nib.angle, angle); near(nib.tilt, 15); near(nib.aspect, Math.sin(15 * RAD));
    }
  });

  it('holds the last meaningful bearing close to vertical but missing data uses the fixed fallback', () => {
    const nibs = resolveCalligraphyNibs([sample(0, 0, 1, [0, 60]), sample(0, 0, 1, [.01, .01]), sample()],
      options({ useBearing: true, nibAngle: 25 }));
    near(nibs[0].angle, 90); near(nibs[1].angle, 90); near(nibs[2].angle, 25);
  });

  it('rejects malformed orientation pairs and invalid nib settings', () => {
    for (const bad of [{ tiltX: 30 }, { tiltY: 30 }, { tiltX: NaN, tiltY: 0 }, { tiltX: 0, tiltY: Infinity }, { tiltX: 91, tiltY: 0 }])
      assert.throws(() => geometry([{ ...sample(), ...bad }]), /freehand-invalid/);
    for (const bad of [{ nibAngle: 181 }, { nibAngle: NaN }, { nibTilt: 14 }, { nibTilt: 91 }, { useTilt: 'yes' }, { useBearing: null }, { continueCurve: 1 }]) {
      const config = { ...options(), ...bad } as CadFreehandOptions;
      assert.equal(validCadFreehandOptions(config), false);
      assert.throws(() => buildCadFreehandGeometry([sample()], config, 8), /freehand-invalid/);
    }
  });
});

describe('bounded changing nib footprints', () => {
  it('sweeps intermediate orientations when a stationary flat nib rotates by a quarter turn', () => {
    const result = geometry([sample(0, 0, 1, [60, 0]), sample(0, 0, 1, [0, 60])], { nibTilt: 15, useBearing: true });
    // End ellipses and their convex hull miss this diagonal tip. The pen's
    // intermediate 45° orientation reaches it, without filling the other side.
    assert.ok(inside(result.contours, 7, 7)); assert.equal(inside(result.contours, -7, 7), false);
    for (const contour of result.contours) for (const p of contour.nodes) assert.ok(Math.hypot(p.x, p.y) <= 10.00002);
    assert.equal(result.sampleCount, 2); assert.ok(validContours(result.contours));
  });

  it('preserves a same-position bearing excursion and its pressure peak under smoothing', () => {
    const result = geometry([sample(0, 0, .2, [60, 0]), sample(0, 0, 1, [0, 60]), sample(0, 0, .3, [60, 0])],
      { nibTilt: 15, useBearing: true, smoothing: 1 });
    near(result.bounds.y, -10); near(result.bounds.h, 20); assert.equal(result.sampleCount, 3);
    assert.ok(inside(result.contours, 0, 9));
  });

  it('retains a tilt peak on a straight trajectory under smoothing', () => {
    const result = geometry([sample(0, 0, 1, [75, 0]), sample(50, 0, 1, [0, 0]), sample(100, 0, 1, [75, 0])],
      { useTilt: true, smoothing: 1 });
    near(result.bounds.h, 20); assert.ok(inside(result.contours, 50, 9)); assert.equal(inside(result.contours, 0, 9), false);
  });

  it('compares simplification with the actual angle and aspect interpolation', () => {
    // This upright midpoint's support matrix is exactly the linear average of
    // the endpoint matrices. Its footprint still differs from a rotating flat
    // nib, and must remain even with zero smoothing.
    const pressure = (1 + Math.sin(15 * RAD)) / 2;
    const result = geometry([sample(0, 0, 1, [75, 0]), sample(0, 0, pressure, [0, 0]), sample(0, 0, 1, [0, 75])],
      { useTilt: true, useBearing: true, smoothing: 0 });
    assert.ok(inside(result.contours, -4.2, 4.2));
    const flat = geometry([sample(0, 0, 1, [75, 0]), sample(0, 0, 1, [0, 75])], { useTilt: true, useBearing: true });
    assert.equal(inside(flat.contours, -4.2, 4.2), false);
  });

  it('follows the short axis rotation across the ±180° bearing boundary', () => {
    const angle = 10 * RAD, tilt = Math.atan(Math.tan(60 * RAD) * Math.tan(angle)) / RAD;
    const result = geometry([sample(0, 0, 1, [-60, tilt]), sample(0, 0, 1, [-60, -tilt])], { useBearing: true, nibTilt: 15 });
    assert.ok(inside(result.contours, 9, 0)); assert.equal(inside(result.contours, 0, 9), false);
  });

  it('ignores an unobservable zero-pressure lift orientation when tapering the last interval', () => {
    const a = geometry([sample(0, 0, 1, [60, 0]), sample(30, 0, 0, [0, 60])], { useBearing: true, nibTilt: 15 });
    const b = geometry([sample(0, 0, 1, [60, 0]), sample(30, 0, 0, [60, 0])], { useBearing: true, nibTilt: 15 });
    assert.deepEqual(a.contours, b.contours);
  });

  it('does not invent a reverse rotation at a coincident automatic closing seam', () => {
    const samples = [sample(0, 0, 1, [60, 0]), sample(40, 0, 1, [0, 60]), sample(0, 0, 1, [0, 60])];
    const open = geometry(samples, { useBearing: true, nibTilt: 15 });
    const closed = geometry(samples, { useBearing: true, nibTilt: 15, autoClose: true });
    assert.deepEqual(closed.contours, open.contours);
  });

  it('preserves input objects and strips orientation from persisted two-dimensional nodes', () => {
    const samples = [sample(10, 20, .2, [45, 10]), sample(50, 30, .8, [30, 20])], before = structuredClone(samples);
    samples.forEach(Object.freeze); Object.freeze(samples);
    const result = geometry(samples, { useBearing: true, useTilt: true });
    assert.deepEqual(samples, before);
    for (const contour of result.contours) for (const node of contour.nodes) {
      assert.equal('tiltX' in node, false); assert.equal('tiltY' in node, false); assert.equal('pressure' in node, false);
    }
  });

  it('accepts an ordinary long multi-direction pressure and tilt trace within bounded geometry', () => {
    const samples = Array.from({ length: 1000 }, (_, i) => {
      const t = i / 999, phase = t * Math.PI * 4;
      return sample(t * 600, 45 * Math.sin(phase), .6 + .3 * Math.sin(t * Math.PI * 2),
        [35 + 20 * Math.sin(t * Math.PI * 2), 30 * Math.cos(t * Math.PI * 2)]);
    });
    const result = geometry(samples, { width: 12, smoothing: .5, useTilt: true, useBearing: true });
    assert.ok(validContours(result.contours)); assert.ok(result.nodeCount > 10); assert.ok(result.nodeCount <= 4096);
    assert.ok(result.bounds.w > 600); assert.ok(result.bounds.h > 80);
  });

  it('refuses oversized input, excessively complex pose sweeps and geometry outside coordinate limits', () => {
    assert.throws(() => buildCadCalligraphyContours(Array.from({ length: 4097 }, () => sample()), options(), false), /freehand-limit/);
    assert.throws(() => geometry([sample(0, 0, 1, [60, 0]), sample(0, 0, 1, [0, 60])], { useBearing: true, width: 1000 }), /freehand-limit/);
    assert.throws(() => geometry([sample(999999, 0)], { width: 20 }), /freehand-limit/);
    const zigzag = Array.from({ length: 513 }, (_, i) => sample(i * 10, i % 2 ? 50 : 0));
    assert.throws(() => geometry(zigzag), /freehand-limit/);
  });
});
