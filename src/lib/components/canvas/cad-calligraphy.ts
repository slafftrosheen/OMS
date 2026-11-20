import ClipperLib from 'clipper-lib';
import { nodeAt, type CadContour } from './cad-curves';
import { CadOperationError } from './cad-plans';
import { validCadPoint, type CadPoint } from './cad-settings';
import type { CadFreehandOptions, FreehandSample } from './cad-freehand';

export interface CalligraphyNib extends CadPoint {
  pressure: number;
  /** Major-axis angle in screen/page coordinates, in degrees. */
  angle: number;
  /** Angle above the drawing plane: 90 is circular, 15 is the flattest nib. */
  tilt: number;
  aspect: number;
}
type NibOptions = Pick<CadFreehandOptions, 'width' | 'smoothing' | 'nibAngle' | 'nibTilt' | 'useTilt' | 'useBearing'>;
type IntPoint = { X: number; Y: number };
const RAD = Math.PI / 180, EPS = 1e-8, SCALE = 100000;
export const MAX_CALLIGRAPHY_CENTERS = 512, MAX_CALLIGRAPHY_SWEEPS = 512;
const MAX_INPUT = 4096, MAX_VERTICES = 40000, MAX_SIMPLIFY_WORK = 500000;
const failure = (code: 'invalid' | 'empty' | 'limit') => new CadOperationError(`freehand-${code}`);

export function validFreehandOrientation(sample: Pick<FreehandSample, 'tiltX' | 'tiltY'>): boolean {
  if (sample.tiltX === undefined && sample.tiltY === undefined) return true;
  return typeof sample.tiltX === 'number' && typeof sample.tiltY === 'number' &&
    Number.isFinite(sample.tiltX) && Number.isFinite(sample.tiltY) && Math.abs(sample.tiltX) <= 90 && Math.abs(sample.tiltY) <= 90;
}
function validOptions(options: NibOptions): boolean {
  return !!options && Number.isFinite(options.width) && options.width >= .01 && options.width <= 10000 &&
    Number.isFinite(options.smoothing) && options.smoothing >= 0 && options.smoothing <= 1 &&
    Number.isFinite(options.nibAngle) && Math.abs(options.nibAngle) <= 180 &&
    Number.isFinite(options.nibTilt) && options.nibTilt >= 15 && options.nibTilt <= 90 &&
    typeof options.useTilt === 'boolean' && typeof options.useBearing === 'boolean';
}

/** Pointer tilt projections determine an axis direction. This bounded ellipse
 * model is an OMS brush convention, not a simulation of a particular tablet's
 * physical nib. Missing orientation uses the chosen fixed controls; a reported
 * zero tilt is vertical and therefore has circular aspect. */
export function resolveCalligraphyNibs(samples: readonly FreehandSample[], options: NibOptions): CalligraphyNib[] {
  if (!validOptions(options) || !Array.isArray(samples)) throw failure('invalid');
  if (samples.length > MAX_INPUT) throw failure('limit');
  let bearing = options.nibAngle;
  return samples.map(sample => {
    if (!validCadPoint(sample) || !Number.isFinite(sample.pressure) || sample.pressure < 0 || sample.pressure > 1 || !validFreehandOrientation(sample)) throw failure('invalid');
    let angle = options.nibAngle, tilt = options.nibTilt;
    if (sample.tiltX !== undefined && sample.tiltY !== undefined) {
      const x = sample.tiltX * RAD, y = sample.tiltY * RAD;
      // Equivalent to (tan(tiltX), tan(tiltY), 1), but finite even at ±90°.
      const vx = Math.sin(x) * Math.cos(y), vy = Math.sin(y) * Math.cos(x), vz = Math.cos(x) * Math.cos(y);
      const horizontal = Math.hypot(vx, vy), altitude = Math.atan2(Math.abs(vz), horizontal) / RAD;
      if (options.useTilt) tilt = Math.max(15, Math.min(90, altitude));
      if (options.useBearing) {
        // Azimuth becomes unstable very close to vertical. Keep the last
        // meaningful axis instead of spinning on tiny tilt noise.
        if (altitude < 89.5 && horizontal > 0) {
          // Pointer Events §4.1.5 supplies axis branches first. A non-axis
          // ±90° projection cannot identify azimuth and uses zero by convention.
          if (sample.tiltX === 0) bearing = sample.tiltY > 0 ? 90 : 270;
          else if (sample.tiltY === 0) bearing = sample.tiltX < 0 ? 180 : 0;
          else if (Math.abs(sample.tiltX) === 90 || Math.abs(sample.tiltY) === 90) bearing = 0;
          else bearing = ((Math.atan2(vy, vx) / RAD) + 360) % 360;
        }
        angle = bearing;
      }
    }
    return { x: sample.x, y: sample.y, pressure: sample.pressure, angle, tilt, aspect: Math.sin(tilt * RAD) };
  });
}

/** An ellipse's positive symmetric support matrix removes the 180° ambiguity
 * of its major axis. Its operator-norm difference bounds every directional
 * footprint error. Compare against the renderer's angle/aspect interpolation;
 * interpolating matrices instead could erase a real upright-nib excursion. */
function support(a: number, angle: number, aspect: number): [number, number, number] {
  const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD), b = a * aspect;
  return [a * c * c + b * s * s, (a - b) * c * s, a * s * s + b * c * c];
}
function matrixDistance(actual: [number, number, number], expected: [number, number, number]): number {
  const x = actual[0] - expected[0], xy = actual[1] - expected[1], y = actual[2] - expected[2];
  const delta = Math.hypot(x - y, 2 * xy);
  return Math.max(Math.abs(x + y + delta), Math.abs(x + y - delta)) / 2;
}
function simplify(input: CalligraphyNib[], options: NibOptions, closed: boolean): CalligraphyNib[] {
  const tolerance = Math.max(EPS, options.smoothing * Math.max(.25, Math.min(8, options.width / 4)));
  let work = 0;
  const part = (points: CalligraphyNib[]) => {
    if (points.length < 3) return points;
    const matrices = points.map(nib => support(options.width * nib.pressure / 2, nib.angle, nib.aspect));
    const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop()!, a = points[first], b = points[last], dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
      const from = a.pressure ? a : b, to = b.pressure ? b : a, rotation = angleDelta(from.angle, to.angle), aspectDelta = to.aspect - from.aspect;
      let worst = tolerance, index = -1;
      for (let i = first + 1; i < last; i++) {
        if (++work > MAX_SIMPLIFY_WORK) throw failure('limit');
        const p = points[i], t = length2 > EPS * EPS ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : (i - first) / (last - first);
        const expected = support(options.width * (a.pressure + t * (b.pressure - a.pressure)) / 2,
          from.angle + t * rotation, from.aspect + t * aspectDelta);
        const error = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) + matrixDistance(matrices[i], expected);
        if (error > worst) { worst = error; index = i; }
      }
      if (index >= 0) { keep.add(index); stack.push([first, index], [index, last]); }
    }
    return [...keep].sort((a, b) => a - b).map(index => points[index]);
  };
  if (!closed) return part(input);
  let split = 1, longest = 0;
  for (let i = 1; i < input.length; i++) {
    const distance = Math.hypot(input[i].x - input[0].x, input[i].y - input[0].y);
    if (distance > longest) { longest = distance; split = i; }
  }
  if (!longest) return part(input);
  const a = part(input.slice(0, split + 1)), b = part([...input.slice(split), input[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function angleDelta(a: number, b: number): number {
  let delta = ((b - a + 180) % 360 + 360) % 360 - 180;
  if (delta > 90) delta -= 180;
  if (delta < -90) delta += 180;
  return delta;
}
function convexHull(points: CadPoint[]): CadPoint[] {
  const ordered = points.sort((a, b) => a.x - b.x || a.y - b.y);
  if (ordered.length < 3) return ordered;
  const cross = (a: CadPoint, b: CadPoint, c: CadPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: CadPoint[] = [], upper: CadPoint[] = [];
  for (const point of ordered) {
    while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  for (let i = ordered.length - 1; i >= 0; i--) {
    const point = ordered[i];
    while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Each small interval uses an exact tapered fixed-ellipse sweep, plus the
 * observed endpoint footprints. Subdivision bounds the pose discrepancy by
 * tolerance: rMax * (|angleDelta| + |aspectDelta|) / (2 * steps). In particular,
 * rotating a stationary flat nib stamps its intermediate orientations; merely
 * taking the convex hull of its endpoints would miss that swept area. */
export function buildCadCalligraphyContours(input: readonly FreehandSample[], options: NibOptions, closed: boolean): CadContour[] {
  const resolved = resolveCalligraphyNibs(input, options);
  if (!resolved.length) throw failure('empty');
  const samples = simplify(resolved, options, closed);
  if (samples.length > MAX_CALLIGRAPHY_CENTERS) throw failure('limit');
  const tolerance = Math.max(1 / SCALE, Math.min(.02, options.width / 500));
  // Pose interpolation may differ by at most 1% of full nib width, capped at
  // 0.2 canvas units (about 0.053 mm at 1:1). Using the tighter polygon sagitta
  // here would spend hundreds of sweeps on an ordinary quarter-turn.
  const poseTolerance = Math.max(1 / SCALE, Math.min(.2, options.width / 100));
  const polygons: IntPoint[][] = [], stamped = new Set<string>(), ellipseCache = new Map<string, CadPoint[]>();
  let vertices = 0, sweeps = 0;
  const add = (points: CadPoint[]) => {
    const polygon: IntPoint[] = [];
    for (const point of points) {
      if (!validCadPoint(point) || ++vertices > MAX_VERTICES) throw failure('limit');
      const p = { X: Math.round(point.x * SCALE), Y: Math.round(point.y * SCALE) };
      if (!Number.isSafeInteger(p.X) || !Number.isSafeInteger(p.Y)) throw failure('invalid');
      if (!polygon.length || p.X !== polygon.at(-1)!.X || p.Y !== polygon.at(-1)!.Y) polygon.push(p);
    }
    if (polygon.length < 3 || !ClipperLib.Clipper.Area(polygon)) return;
    if (!ClipperLib.Clipper.Orientation(polygon)) polygon.reverse();
    polygons.push(polygon);
  };
  const offset = (angle: number, aspect: number, x: number, y: number) => {
    const c = Math.cos(angle * RAD), s = Math.sin(angle * RAD);
    return { x: c * x - s * aspect * y, y: s * x + c * aspect * y };
  };
  const ellipseKey = (point: CadPoint, radius: number, angle: number, aspect: number) =>
    JSON.stringify([point.x, point.y, radius, ((angle % 180) + 180) % 180, aspect]);
  const ellipse = (point: CadPoint, radius: number, angle: number, aspect: number): CadPoint[] => {
    if (radius < 1 / SCALE) return [point];
    const key = ellipseKey(point, radius, angle, aspect);
    const cached = ellipseCache.get(key);
    if (cached) return cached;
    const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - Math.min(radius, tolerance) / radius)));
    const count = Math.max(8, Math.ceil(Math.ceil(2 * Math.PI / step) / 4) * 4);
    if (!Number.isFinite(count) || count > 2048 || vertices + count > MAX_VERTICES) throw failure('limit');
    const theta = angle * RAD;
    // Add exact axis extrema to the bounded polygon, so rotated ellipses also
    // retain their intended width/height after quantization.
    const xExtreme = Math.atan2(-aspect * Math.sin(theta), Math.cos(theta));
    const yExtreme = Math.atan2(aspect * Math.cos(theta), Math.sin(theta));
    const angles = [...Array.from({ length: count }, (_, i) => i * 2 * Math.PI / count), xExtreme, xExtreme + Math.PI, yExtreme, yExtreme + Math.PI]
      .map(value => (value + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
    const points = angles.map(value => {
      const vector = offset(angle, aspect, radius * Math.cos(value), radius * Math.sin(value));
      return { x: point.x + vector.x, y: point.y + vector.y };
    });
    ellipseCache.set(key, points);
    return points;
  };
  const sweep = (a: CadPoint, b: CadPoint, r0: number, r1: number, angle: number, aspect: number) => {
    const points = [...ellipse(a, r0, angle, aspect), ...ellipse(b, r1, angle, aspect)];
    stamped.add(ellipseKey(a, r0, angle, aspect)); stamped.add(ellipseKey(b, r1, angle, aspect));
    const theta = angle * RAD, c = Math.cos(theta), s = Math.sin(theta), dx = b.x - a.x, dy = b.y - a.y;
    // Transform only the displacement. Absolute skinny-nib coordinates can
    // exceed the CAD limit in this auxiliary space while final geometry is legal.
    const x = c * dx + s * dy, y = (-s * dx + c * dy) / aspect, length = Math.hypot(x, y);
    if (length <= EPS || Math.abs(r1 - r0) >= length) { add(convexHull(points)); return; }
    const ux = x / length, uy = y / length, along = (r0 - r1) / length, across = Math.sqrt(Math.max(0, 1 - along * along));
    const upper = { x: ux * along - uy * across, y: uy * along + ux * across };
    const lower = { x: ux * along + uy * across, y: uy * along - ux * across };
    const contact = (point: CadPoint, radius: number, normal: CadPoint) => {
      const vector = offset(angle, aspect, radius * normal.x, radius * normal.y);
      return { x: point.x + vector.x, y: point.y + vector.y };
    };
    // A fixed-pose tapered sweep is convex. Send its single outer hull to the
    // union, rather than two heavily overlapping ellipses and a tangent quad.
    // This hull is only within one pose interval, never across changing poses.
    add(convexHull([...points, contact(a, r0, upper), contact(b, r1, upper), contact(b, r1, lower), contact(a, r0, lower)]));
  };
  for (let i = 0; i < samples.length - (closed ? 0 : 1); i++) {
    const a = samples[i], b = samples[(i + 1) % samples.length], r0 = options.width * a.pressure / 2, r1 = options.width * b.pressure / 2;
    if (!r0 && !r1) continue;
    // A closed path with coincident endpoints already joins their footprints.
    // Do not invent a stationary rotation at that unobserved closing seam.
    if (closed && i === samples.length - 1 && Math.hypot(b.x - a.x, b.y - a.y) <= EPS) continue;
    const from = r0 ? a : b, to = r1 ? b : a, delta = angleDelta(from.angle, to.angle), aspectDelta = to.aspect - from.aspect;
    const count = Math.max(1, Math.ceil(Math.max(r0, r1) * (Math.abs(delta * RAD) + Math.abs(aspectDelta)) / (2 * poseTolerance)));
    if (!Number.isFinite(count) || sweeps + count > MAX_CALLIGRAPHY_SWEEPS) throw failure('limit');
    sweeps += count;
    for (let j = 0; j < count; j++) {
      const t0 = j / count, t1 = (j + 1) / count, middle = (t0 + t1) / 2;
      const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
      const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
      sweep(p0, p1, r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, from.angle + delta * middle, from.aspect + aspectDelta * middle);
    }
  }
  for (const nib of samples) {
    const radius = options.width * nib.pressure / 2, key = ellipseKey(nib, radius, nib.angle, nib.aspect);
    if (!stamped.has(key)) { stamped.add(key); add(ellipse(nib, radius, nib.angle, nib.aspect)); }
  }
  if (!polygons.length) throw failure('empty');
  const engine = new ClipperLib.Clipper(); engine.StrictlySimple = true;
  engine.AddPaths(polygons, ClipperLib.PolyType.ptSubject, true);
  const result: IntPoint[][] = [];
  if (!engine.Execute(ClipperLib.ClipType.ctUnion, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)) throw failure('invalid');
  return result.filter(path => path.length >= 3 && ClipperLib.Clipper.Area(path)).map(path => ({
    closed: true, nodes: path.map(point => nodeAt({ x: point.X / SCALE, y: point.Y / SCALE })),
  }));
}
