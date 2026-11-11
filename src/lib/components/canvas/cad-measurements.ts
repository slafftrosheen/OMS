import type { Editor, TLShape } from '@tldraw/tldraw';
import { contourSegments, splitCubic } from './cad-curves';
import { cadShapeIsClipped } from './cad-dxf';
import { shapeCadContours } from './cad-editing';
import { cadMmPerPixel, type CadPoint, type CadSettings } from './cad-settings';

const distance = (a: CadPoint, b: CadPoint) => Math.hypot(b.x - a.x, b.y - a.y);
interface Budget { remaining: number }
function spend(budget: Budget) { if (--budget.remaining < 0) throw new Error('measurement-limit'); }

/** Chord and control-polygon lengths bound a Bézier's true length. */
export function cubicLength(points: CadPoint[], tolerance: number, budget: Budget = { remaining: 100000 }, depth = 0): number {
  spend(budget);
  const lower = distance(points[0], points[3]);
  const upper = distance(points[0], points[1]) + distance(points[1], points[2]) + distance(points[2], points[3]);
  if (!Number.isFinite(upper) || !Number.isFinite(tolerance) || tolerance <= 0) throw new Error('measurement-invalid');
  if (upper - lower <= tolerance * 2) return (upper + lower) / 2;
  if (depth >= 24) throw new Error('measurement-limit');
  const [a, b] = splitCubic(points);
  return cubicLength(a, tolerance / 2, budget, depth + 1) + cubicLength(b, tolerance / 2, budget, depth + 1);
}

/** Adaptive integration of the analytic ellipse, without converting it to curves. */
function ellipseLength(rx: number, ry: number, tolerance: number, budget: Budget) {
  const speed = (t: number) => Math.hypot(rx * Math.sin(t), ry * Math.cos(t));
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => (b - a) / 6 * (fa + 4 * fm + fb);
  const visit = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, tolerance: number, depth: number): number => {
    spend(budget);
    const m = (a + b) / 2, fl = speed((a + m) / 2), fr = speed((m + b) / 2);
    const left = simpson(a, m, fa, fl, fm), right = simpson(m, b, fm, fr, fb), error = left + right - whole;
    if (Math.abs(error) <= 15 * tolerance) return left + right + error / 15;
    if (depth >= 24) throw new Error('measurement-limit');
    return visit(a, m, fa, fl, fm, left, tolerance / 2, depth + 1) + visit(m, b, fm, fr, fb, right, tolerance / 2, depth + 1);
  };
  const a = 0, b = Math.PI / 2, fa = speed(a), fm = speed((a + b) / 2), fb = speed(b);
  return 4 * visit(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), tolerance / 4, 0);
}

interface ShapeMeasurement { length: number; open: number; closed: number; approximate: boolean; radius?: number; sweep?: number }
function measureShape(editor: Editor, shape: TLShape, tolerance: number, budget: Budget): ShapeMeasurement {
  const p = shape.props as Record<string, any>, paint = shape.meta.omsVectorPaint as any;
  // A clipped object's full path is not its visible/cutting perimeter.
  if (cadShapeIsClipped(editor, shape) || paint?.clips?.length || paint?.raster) throw new Error('measurement-unsupported');
  if (shape.type === 'cad-arc') {
    const sweep = p.endAngle - p.startAngle;
    if (!(p.radius > 0 && sweep > 0 && sweep < 360)) throw new Error('measurement-invalid');
    return { length: p.radius * sweep * Math.PI / 180, open: 1, closed: 0, approximate: false, radius: p.radius, sweep };
  }
  if (shape.type === 'cad-ellipse' || shape.type === 'geo' && p.geo === 'ellipse' && !p.text?.trim()) {
    const rx = p.w / 2, ry = (p.h + (p.growY ?? 0)) / 2;
    if (!(rx > 0 && ry > 0)) throw new Error('measurement-invalid');
    const circle = Math.abs(rx - ry) < 1e-9;
    return { length: circle ? 2 * Math.PI * rx : ellipseLength(rx, ry, tolerance, budget), open: 0, closed: 1, approximate: !circle, ...(circle ? { radius: rx } : {}) };
  }
  const contours = shapeCadContours(editor, shape), segments = contours.flatMap(c => [...contourSegments(c)]);
  const approximate = contours.some(c => c.nodes.some(n => n.inX || n.inY || n.outX || n.outY));
  const length = segments.reduce((sum, segment) => sum + cubicLength(segment, tolerance / Math.max(1, segments.length), budget), 0);
  return { length, open: contours.filter(c => !c.closed).length, closed: contours.filter(c => c.closed).length, approximate };
}

export function measureCadSelection(editor: Editor, settings: CadSettings | null) {
  const shapes = [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])]
    .map(id => editor.getShape(id)).filter((s): s is TLShape => !!s && s.type !== 'group');
  const result = { length: 0, open: 0, closed: 0, approximate: false, measured: 0, omitted: 0, radius: undefined as number | undefined, sweep: undefined as number | undefined };
  // A total 0.001 mm numerical target (0.001 px for legacy uncalibrated pages).
  const tolerance = (settings ? 0.001 / cadMmPerPixel(settings) : 0.001) / Math.max(1, shapes.length);
  const budget = { remaining: 100000 };
  for (const shape of shapes) {
    try {
      const measurement = measureShape(editor, shape, tolerance, budget);
      if (!Number.isFinite(measurement.length)) throw new Error('measurement-invalid');
      result.length += measurement.length; result.open += measurement.open; result.closed += measurement.closed;
      result.approximate ||= measurement.approximate; result.measured++;
      if (shapes.length === 1) { result.radius = measurement.radius; result.sweep = measurement.sweep; }
    } catch { result.omitted++; }
  }
  return result;
}
