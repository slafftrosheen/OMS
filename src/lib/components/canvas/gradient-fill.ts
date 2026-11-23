import type { Editor, TLShapeId } from '@tldraw/tldraw';
import type { CadContour } from './cad-curves';
import { type VectorGradient } from './cad-appearance';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { curveFillSource, updateCurveFill } from './curve-fill';
import { cadRevision } from './cad-plans';
import { drawingObjectName } from './drawing-operations';

export interface GradientFillSettings {
  type: 'linear' | 'radial';
  angle: number;
  opacity: number;
  refit?: boolean;
  stops: Array<{ offset: number; color: string }>;
}
export interface GradientFillPlan {
  revision: string;
  shapeId: TLShapeId;
  paint: VectorPaint;
  contours: CadContour[];
  data: string;
  bounds: { x: number; y: number; w: number; h: number };
  fillRule: 'evenodd' | 'nonzero';
  settings: GradientFillSettings;
}

function source(editor: Editor) {
  // Both image and gradient fills decorate the same supported cutting curves.
  // Keep the existing lock, protected ancestry, clipping and binding guards.
  const current = curveFillSource(editor, undefined, 'gradient-selection');
  if (current.contours.some(contour => !contour.closed) ||
      !['evenodd', 'nonzero'].includes(current.fillRule)) throw new Error('gradient-selection');
  const bounds = current.bounds;
  if (!(bounds.w > 0 && bounds.h > 0)) throw new Error('gradient-selection');
  return { ...current, bounds };
}

export function gradientFillSelection(editor: Editor) {
  try {
    const { shape, paint } = source(editor);
    return { id: shape.id, name: drawingObjectName(shape), hasGradient: !!paint.gradient, hasTexture: !!paint.raster };
  } catch { return null; }
}

function gradientAngle(g: VectorGradient | undefined) {
  if (g?.type !== 'linear') return 0;
  const x = g.end[0] - g.start[0], y = g.end[1] - g.start[1];
  const [a, b, c, d] = g.matrix, sign = Math.sign(a * d - b * c);
  // The inverse transpose maps the direction of fastest colour change.
  const angle = -Math.atan2(sign * (a * y - c * x), sign * (d * x - b * y)) * 180 / Math.PI;
  return Number(angle.toPrecision(14));
}

export function getGradientFillSettings(editor: Editor): GradientFillSettings | null {
  try {
    const { paint } = source(editor), g = paint.gradient;
    return {
      type: g?.type ?? 'linear', angle: gradientAngle(g), opacity: paint.fillOpacity * 100,
      stops: structuredClone(g?.stops ?? [{ offset: 0, color: paint.fill === 'none' ? '#ffffff' : paint.fill }, { offset: 1, color: '#2563eb' }]),
    };
  } catch { return null; }
}

function fitGradient(settings: GradientFillSettings, bounds: GradientFillPlan['bounds'], stops: VectorGradient['stops']): VectorGradient {
  const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
  const theta = -settings.angle * Math.PI / 180, dx = Math.cos(theta), dy = Math.sin(theta);
  // The full bounds projected on the axis: corners reach the end colours at
  // every angle. Coordinates stay in the curve's local system (Y down).
  const half = (Math.abs(dx) * bounds.w + Math.abs(dy) * bounds.h) / 2;
  return settings.type === 'linear' ? {
    type: 'linear', matrix: [1, 0, 0, 1, 0, 0],
    start: [cx - dx * half, cy - dy * half], end: [cx + dx * half, cy + dy * half],
    r0: 0, r1: 0, stops,
  } : {
    type: 'radial', matrix: [bounds.w / 2, 0, 0, bounds.h / 2, cx, cy],
    start: [0, 0], end: [0, 0], r0: 0, r1: 1, stops,
  };
}

export function prepareGradientFill(editor: Editor, settings: GradientFillSettings): GradientFillPlan {
  const { shape, paint, contours, fillRule, bounds, data } = source(editor);
  if (!['linear', 'radial'].includes(settings.type) || !Number.isFinite(settings.angle) || Math.abs(settings.angle) > 360 ||
      !Number.isFinite(settings.opacity) || settings.opacity < 0 || settings.opacity > 100 ||
      (settings.refit !== undefined && typeof settings.refit !== 'boolean')) throw new Error('geometry');
  const stored = paint.gradient, stops = structuredClone(settings.stops);
  const keepMapping = stored?.type === settings.type && !settings.refit &&
    (settings.type === 'radial' || settings.angle === gradientAngle(stored));
  const gradient = keepMapping ? { ...structuredClone(stored), stops } : fitGradient(settings, bounds, stops);
  const next: VectorPaint = { ...paint, raster: undefined, gradient, fillOpacity: settings.opacity / 100 };
  if (!validVectorPaint(next)) throw new Error('geometry');
  return { revision: cadRevision(editor), shapeId: shape.id, paint: next, contours: structuredClone(contours), data, bounds: { ...bounds }, fillRule, settings: structuredClone(settings) };
}

export function applyGradientFill(editor: Editor, plan: GradientFillPlan): boolean {
  try {
    if (plan.revision !== cadRevision(editor)) return false;
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision !== cadRevision(editor)) return false;
    const fresh = prepareGradientFill(editor, plan.settings);
    if (fresh.shapeId !== plan.shapeId || fresh.fillRule !== plan.fillRule || fresh.data !== plan.data ||
        JSON.stringify(fresh.bounds) !== JSON.stringify(plan.bounds) ||
        JSON.stringify(fresh.contours) !== JSON.stringify(plan.contours) ||
        JSON.stringify(fresh.paint) !== JSON.stringify(plan.paint)) return false;
    return updateCurveFill(editor, fresh.shapeId, fresh.paint, { omsMaterialTexture: null });
  } catch { return false; }
}

export function removeGradientFill(editor: Editor): boolean {
  try {
    editor.complete(); editor.setCurrentTool('select');
    const { shape, paint } = source(editor);
    if (!paint.gradient) return false;
    delete paint.gradient;
    return updateCurveFill(editor, shape.id, paint, { omsMaterialTexture: null });
  } catch { return false; }
}
