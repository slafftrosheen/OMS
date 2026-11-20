import ClipperLib from 'clipper-lib';
import { atom, createShapeId, type Editor } from '@tldraw/tldraw';
import { curveBounds, mapContours, nodeAt, validContours, type CadContour } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { drawingTransaction } from './drawing-commands';
import { VECTOR_DEFAULT_PAINT, validVectorPaint, type VectorPaint } from './cad-paint';
import { paintMetadata } from './cad-vector';
import { buildCadCalligraphyContours, validFreehandOrientation } from './cad-calligraphy';

export interface FreehandSample extends CadPoint { pressure: number; tiltX?: number; tiltY?: number }
export interface CadFreehandOptions {
  mode: 'curve' | 'ink' | 'calligraphy'; width: number; smoothing: number; autoClose: boolean; color: string;
  nibAngle: number; nibTilt: number; useTilt: boolean; useBearing: boolean; continueCurve: boolean;
}
export interface CadFreehandGeometry {
  contours: CadContour[]; paint: VectorPaint; fillRule: 'nonzero'; closed: boolean;
  nodeCount: number; sampleCount: number; bounds: { x: number; y: number; w: number; h: number };
}
export interface CadFreehandPlan {
  revision: string; pageId: string; geometry: CadFreehandGeometry; options: CadFreehandOptions; opacity: number;
}
export const MAX_CAD_FREEHAND_SAMPLES = 4096;
export const MAX_CAD_FREEHAND_INK_CENTERS = 512;
export const DEFAULT_CAD_FREEHAND_OPTIONS: CadFreehandOptions = {
  mode: 'curve', width: 4, smoothing: .4, autoClose: true, color: '#172535',
  nibAngle: 45, nibTilt: 15, useTilt: false, useBearing: false, continueCurve: true,
};
const states = new WeakMap<Editor, ReturnType<typeof atom<CadFreehandOptions>>>();
export function cadFreehandOptions(editor: Editor) {
  let state = states.get(editor);
  if (!state) { state = atom<CadFreehandOptions>('Next freehand stroke', { ...DEFAULT_CAD_FREEHAND_OPTIONS }); states.set(editor, state); }
  return state;
}
export function readCadFreehandOptions(editor: Editor): CadFreehandOptions { return { ...cadFreehandOptions(editor).get() }; }
export function validCadFreehandOptions(value: unknown): value is CadFreehandOptions {
  const p = value as CadFreehandOptions;
  return !!p && ['curve', 'ink', 'calligraphy'].includes(p.mode) && Number.isFinite(p.width) && p.width >= .01 && p.width <= 10000 &&
    Number.isFinite(p.smoothing) && p.smoothing >= 0 && p.smoothing <= 1 && typeof p.autoClose === 'boolean' &&
    Number.isFinite(p.nibAngle) && Math.abs(p.nibAngle) <= 180 && Number.isFinite(p.nibTilt) && p.nibTilt >= 15 && p.nibTilt <= 90 &&
    typeof p.useTilt === 'boolean' && typeof p.useBearing === 'boolean' && typeof p.continueCurve === 'boolean' &&
    typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color);
}
/** Device preferences are next-stroke view state, never document metadata. */
export function setCadFreehandOptions(editor: Editor, patch: Partial<CadFreehandOptions>): boolean {
  const next = { ...readCadFreehandOptions(editor), ...patch };
  if (!validCadFreehandOptions(next)) return false;
  cadFreehandOptions(editor).set({ mode: next.mode, width: next.width, smoothing: next.smoothing, autoClose: next.autoClose, color: next.color,
    nibAngle: next.nibAngle, nibTilt: next.nibTilt, useTilt: next.useTilt, useBearing: next.useBearing, continueCurve: next.continueCurve });
  return true;
}

const EPS = 1e-8, SCALE = 100000, MAX_SWEEP_VERTICES = 40000, MAX_SIMPLIFY_WORK = 500000;
type IntPoint = { X: number; Y: number };
const samePoint = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const mix = (a: CadPoint, b: CadPoint, t: number): CadPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const failure = (code: 'invalid' | 'empty' | 'limit') => new CadOperationError(`freehand-${code}`);

function normalizedSamples(input: readonly FreehandSample[], preserveOrientation: boolean): FreehandSample[] {
  if (!Array.isArray(input) || input.length > MAX_CAD_FREEHAND_SAMPLES) throw failure('limit');
  const result: FreehandSample[] = [];
  for (const sample of input) {
    if (!validCadPoint(sample) || !Number.isFinite(sample.pressure) || sample.pressure < 0 || sample.pressure > 1 || !validFreehandOrientation(sample)) throw failure('invalid');
    const previous = result.at(-1);
    // A stationary pen can add pressure before its next XY sample. Keep that
    // maximum instead of silently erasing the wider dot from the final ink.
    if (previous && samePoint(previous, sample) && (!preserveOrientation || previous.tiltX === sample.tiltX && previous.tiltY === sample.tiltY)) previous.pressure = Math.max(previous.pressure, sample.pressure);
    else result.push({ x: sample.x, y: sample.y, pressure: sample.pressure,
      ...(sample.tiltX === undefined ? {} : { tiltX: sample.tiltX, tiltY: sample.tiltY }) });
  }
  if (!result.length) throw failure('empty');
  return result;
}

/** RDP considers both positional error and interpolated radius error. The work
 * limit bounds even an adversarial zigzag; endpoints and pressure peaks survive
 * whenever removing them would exceed the selected smoothing tolerance. */
function simplify(samples: FreehandSample[], tolerance: number, radiusScale: number, closed: boolean): FreehandSample[] {
  let work = 0;
  const part = (points: FreehandSample[]) => {
    if (points.length < 3) return points;
    const retained = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop()!, a = points[first], b = points[last], dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
      let worst = tolerance, index = -1;
      for (let i = first + 1; i < last; i++) {
        if (++work > MAX_SIMPLIFY_WORK) throw failure('limit');
        const p = points[i], t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
        const distance = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) +
          Math.abs(p.pressure - a.pressure - t * (b.pressure - a.pressure)) * radiusScale;
        if (distance > worst) { worst = distance; index = i; }
      }
      if (index >= 0) { retained.add(index); stack.push([first, index], [index, last]); }
    }
    return [...retained].sort((a, b) => a - b).map(index => points[index]);
  };
  if (!closed) return part(samples);
  let split = 1, longest = 0;
  for (let i = 1; i < samples.length; i++) {
    const distance = Math.hypot(samples[i].x - samples[0].x, samples[i].y - samples[0].y);
    if (distance > longest) { split = i; longest = distance; }
  }
  const a = part(samples.slice(0, split + 1)), b = part([...samples.slice(split), samples[0]]);
  const result = [...a.slice(0, -1), ...b.slice(0, -1)];
  return result.length >= 3 ? result : samples;
}

/** Corner rounding is contained in the input polyline's convex hull. Each
 * quadratic is represented exactly with cubic handles, without Catmull-Rom
 * overshoot. A zero smoothing setting keeps retained segments straight. */
function centerline(samples: FreehandSample[], smoothing: number, closed: boolean): CadContour {
  if (samples.length < 2) throw failure('empty');
  if (!smoothing || samples.length === 2) return { closed, nodes: samples.map(nodeAt) };
  const fraction = smoothing / 2;
  const entry = (i: number) => mix(samples[i], samples[(i + samples.length - 1) % samples.length], fraction);
  const exit = (i: number) => mix(samples[i], samples[(i + 1) % samples.length], fraction);
  const nodes = [nodeAt(closed ? entry(0) : samples[0])];
  const line = (point: CadPoint) => { if (!samePoint(nodes.at(-1)!, point)) nodes.push(nodeAt(point)); };
  const quadratic = (control: CadPoint, point: CadPoint) => {
    const previous = nodes.at(-1)!;
    if (samePoint(previous, point)) return;
    previous.outX = (control.x - previous.x) * 2 / 3; previous.outY = (control.y - previous.y) * 2 / 3;
    const next = nodeAt(point); next.inX = (control.x - next.x) * 2 / 3; next.inY = (control.y - next.y) * 2 / 3;
    nodes.push(next);
  };
  for (let i = closed ? 0 : 1; i < samples.length - (closed ? 0 : 1); i++) {
    line(entry(i)); quadratic(samples[i], exit(i));
  }
  if (closed) {
    // At full smoothing the final exit coincides with the first entry. Merge
    // its incoming handle into the seam instead of saving a duplicate anchor.
    const last = nodes.at(-1)!;
    if (samePoint(last, nodes[0])) { nodes[0].inX = last.inX; nodes[0].inY = last.inY; nodes.pop(); }
  } else line(samples.at(-1)!);
  for (const node of nodes) {
    const a = Math.hypot(node.inX, node.inY), b = Math.hypot(node.outX, node.outY);
    if (a > EPS && b > EPS && Math.abs(node.inX * node.outY - node.inY * node.outX) <= 1e-7 * a * b &&
        node.inX * node.outX + node.inY * node.outY < 0) node.mode = 'smooth';
  }
  return { closed, nodes };
}

/** A linearly changing round nib sweeps the convex hull of its endpoint discs.
 * Tangent quadrilaterals and bounded inscribed circles describe that envelope;
 * Clipper unions overlaps while keeping the winding of enclosed holes. */
function inkContours(samples: FreehandSample[], width: number, closed: boolean): CadContour[] {
  if (samples.length > MAX_CAD_FREEHAND_INK_CENTERS) throw failure('limit');
  const polygons: IntPoint[][] = []; let vertices = 0;
  const add = (points: CadPoint[]) => {
    const polygon: IntPoint[] = [];
    for (const point of points) {
      if (!validCadPoint(point) || ++vertices > MAX_SWEEP_VERTICES) throw failure('limit');
      const p = { X: Math.round(point.x * SCALE), Y: Math.round(point.y * SCALE) };
      if (!Number.isSafeInteger(p.X) || !Number.isSafeInteger(p.Y)) throw failure('invalid');
      if (!polygon.length || p.X !== polygon.at(-1)!.X || p.Y !== polygon.at(-1)!.Y) polygon.push(p);
    }
    if (polygon.length < 3 || !ClipperLib.Clipper.Area(polygon)) return;
    if (!ClipperLib.Clipper.Orientation(polygon)) polygon.reverse();
    polygons.push(polygon);
  };
  // Quantization is 0.00001 canvas units. Circular sagitta is at most 0.2% of
  // the maximum nib width (and smaller than 0.02 for ordinary-width strokes).
  const tolerance = Math.max(1 / SCALE, Math.min(.02, width / 500));
  const radii = samples.map(sample => width * sample.pressure / 2);
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i], r = radii[i];
    if (r < 1 / SCALE) continue;
    const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - Math.min(r, tolerance) / r)));
    const count = Math.max(8, Math.ceil(Math.ceil(2 * Math.PI / step) / 4) * 4);
    if (!Number.isFinite(count) || count > 2048 || vertices + count > MAX_SWEEP_VERTICES) throw failure('limit');
    add(Array.from({ length: count }, (_, j) => ({ x: p.x + r * Math.cos(2 * Math.PI * j / count), y: p.y + r * Math.sin(2 * Math.PI * j / count) })));
  }
  for (let i = 0; i < samples.length - (closed ? 0 : 1); i++) {
    const next = (i + 1) % samples.length, a = samples[i], b = samples[next], r0 = radii[i], r1 = radii[next];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length <= EPS || Math.abs(r1 - r0) >= length) continue;
    const ux = dx / length, uy = dy / length, along = (r0 - r1) / length, across = Math.sqrt(Math.max(0, 1 - along * along));
    const upper = { x: ux * along - uy * across, y: uy * along + ux * across };
    const lower = { x: ux * along + uy * across, y: uy * along - ux * across };
    add([{ x: a.x + r0 * upper.x, y: a.y + r0 * upper.y }, { x: b.x + r1 * upper.x, y: b.y + r1 * upper.y },
      { x: b.x + r1 * lower.x, y: b.y + r1 * lower.y }, { x: a.x + r0 * lower.x, y: a.y + r0 * lower.y }]);
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

export function buildCadFreehandGeometry(input: readonly FreehandSample[], options: CadFreehandOptions, closeTolerance: number): CadFreehandGeometry {
  if (!validCadFreehandOptions(options) || !Number.isFinite(closeTolerance) || closeTolerance < 0 || closeTolerance > 1000000) throw failure('invalid');
  const preserveOrientation = options.mode === 'calligraphy' && (options.useTilt || options.useBearing);
  let samples = normalizedSamples(input, preserveOrientation);
  let closed = options.autoClose && samples.length >= 3 && Math.hypot(samples[0].x - samples.at(-1)!.x, samples[0].y - samples.at(-1)!.y) <= closeTolerance;
  if (closed && samePoint(samples[0], samples.at(-1)!) && (!preserveOrientation ||
      samples[0].tiltX === samples.at(-1)!.tiltX && samples[0].tiltY === samples.at(-1)!.tiltY)) {
    const last = samples.pop()!; samples[0].pressure = Math.max(samples[0].pressure, last.pressure);
    if (samples.length < 3) { samples.push(last); closed = false; }
  }
  const sampleCount = samples.length;
  const tolerance = Math.max(EPS, options.smoothing * Math.max(.25, Math.min(8, options.width / 4)));
  if (options.mode !== 'calligraphy') samples = simplify(samples, tolerance, options.mode === 'ink' ? options.width / 2 : 0, closed);
  const contours = options.mode === 'calligraphy' ? buildCadCalligraphyContours(samples, options, closed)
    : options.mode === 'ink' ? inkContours(samples, options.width, closed) : [centerline(samples, options.smoothing, closed)];
  if (!contours.length) throw failure('empty');
  if (!validContours(contours)) throw failure('limit');
  const paint: VectorPaint = { ...VECTOR_DEFAULT_PAINT, dash: [], lineCap: 'round', lineJoin: 'round',
    fill: options.mode !== 'curve' ? options.color : 'none', stroke: options.mode === 'curve' ? options.color : 'none',
    strokeWidth: options.mode === 'curve' ? options.width : 0 };
  return { contours, paint, fillRule: 'nonzero', closed: contours.every(contour => contour.closed),
    nodeCount: contours.reduce((count, contour) => count + contour.nodes.length, 0), sampleCount, bounds: curveBounds(contours) };
}

export function prepareCadFreehandPlan(editor: Editor, samples: readonly FreehandSample[], options: CadFreehandOptions, closeTolerance: number): CadFreehandPlan {
  assertCadEditable(editor);
  const geometry = buildCadFreehandGeometry(samples, options, closeTolerance), opacity = editor.getInstanceState().opacityForNextShape ?? 1;
  if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw failure('invalid');
  if (editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) throw failure('limit');
  const plan = { revision: cadRevision(editor), pageId: editor.getCurrentPageId(), geometry, options: { ...options }, opacity };
  if (JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(geometry).length > 1_850_000) throw failure('limit');
  return plan;
}

/** Final release creates one ordinary editable vector object. It deliberately
 * does not complete/switch the tool, allowing consecutive pen strokes and
 * avoiding re-entry into the active controller's completion callback. */
export function applyCadFreehandPlan(editor: Editor, plan: CadFreehandPlan): boolean {
  try {
    assertCadEditable(editor);
    if (plan.pageId !== editor.getCurrentPageId() || plan.revision !== cadRevision(editor) || !validCadFreehandOptions(plan.options) ||
        !validContours(plan.geometry.contours) || !validVectorPaint(plan.geometry.paint) || !Number.isFinite(plan.opacity) || plan.opacity <= 0 || plan.opacity > 1 ||
        editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) return false;
    const bounds = curveBounds(plan.geometry.contours), local = mapContours(plan.geometry.contours, point => ({ x: point.x - bounds.x, y: point.y - bounds.y }));
    // A legal drawing may straddle both sides of the coordinate limit. Keep
    // page-space nodes if moving the local origin would exceed that same limit.
    const normalize = validContours(local), contours = normalize ? local : structuredClone(plan.geometry.contours);
    const id = createShapeId(), shape = { id, type: 'cad-bezier' as const, parentId: editor.getCurrentPageId(), x: normalize ? bounds.x : 0, y: normalize ? bounds.y : 0, rotation: 0,
      opacity: plan.opacity, props: { contours, fillRule: 'nonzero' as const, color: 'black' as const },
      meta: { omsObjectName: plan.options.mode === 'calligraphy' ? 'Calligraphic ink' : plan.options.mode === 'ink' ? 'Pressure ink' : 'Freehand curve', omsVectorPaint: paintMetadata(plan.geometry.paint) } };
    if (JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(shape).length > 1_900_000) return false;
    return drawingTransaction(editor, () => {
      editor.createShape(shape);
      const saved = editor.getShape(id);
      if (!saved || saved.type !== shape.type || saved.parentId !== shape.parentId || saved.x !== shape.x || saved.y !== shape.y || saved.rotation !== 0 ||
          saved.opacity !== shape.opacity || JSON.stringify((saved.props as { contours: CadContour[] }).contours) !== JSON.stringify(contours) ||
          JSON.stringify(saved.meta.omsVectorPaint) !== JSON.stringify(shape.meta.omsVectorPaint)) throw failure('invalid');
      editor.setSelectedShapes([id]);
    });
  } catch { return false; }
}
