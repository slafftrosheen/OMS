import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { curveBounds, type CadContour } from './cad-curves';
import { type VectorGradient } from './cad-appearance';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { curveFillSource, updateCurveFill } from './curve-fill';
import { cadRevision } from './cad-plans';
import { drawingObjectName } from './drawing-operations';

export interface GradientFillSettings {
  type: 'linear' | 'radial';
  angle: number;
  opacity: number;
  stops: Array<{ offset: number; color: string }>;
}
export interface GradientFillPlan {
  revision: string;
  shapeId: TLShapeId;
  paint: VectorPaint;
  contours: CadContour[];
  fillRule: 'evenodd' | 'nonzero';
  settings: GradientFillSettings;
}

function source(editor: Editor) {
  // Both image and gradient fills decorate the same supported cutting curves.
  // Keep the existing lock, protected ancestry, clipping and binding guards.
  const current = curveFillSource(editor, undefined, 'gradient-selection');
  if (current.contours.some(contour => !contour.closed) ||
      !['evenodd', 'nonzero'].includes(current.fillRule)) throw new Error('gradient-selection');
  const bounds = curveBounds(current.contours);
  if (!(bounds.w > 0 && bounds.h > 0)) throw new Error('gradient-selection');
  return { ...current, bounds };
}

export function gradientFillSelection(editor: Editor) {
  try {
    const { shape, paint } = source(editor);
    return { id: shape.id, name: drawingObjectName(shape), hasGradient: !!paint.gradient, hasTexture: !!paint.raster };
  } catch { return null; }
}

/** Read colours and direction, including imported or resized gradients. Apply
 * deliberately refits the mapping to the current local bounds, without changing
 * the curve. Arbitrary imported focal points/boxes are not silently retained. */
export function getGradientFillSettings(editor: Editor): GradientFillSettings | null {
  try {
    const { paint } = source(editor), g = paint.gradient;
    let angle = 0;
    if (g?.type === 'linear') {
      const x = g.end[0] - g.start[0], y = g.end[1] - g.start[1], m = g.matrix;
      angle = -Math.atan2(m[1] * x + m[3] * y, m[0] * x + m[2] * y) * 180 / Math.PI;
    }
    return {
      type: g?.type ?? 'linear', angle: Number(angle.toPrecision(14)), opacity: paint.fillOpacity * 100,
      stops: structuredClone(g?.stops ?? [{ offset: 0, color: paint.fill === 'none' ? '#ffffff' : paint.fill }, { offset: 1, color: '#2563eb' }]),
    };
  } catch { return null; }
}

export function prepareGradientFill(editor: Editor, settings: GradientFillSettings): GradientFillPlan {
  const { shape, paint, contours, fillRule, bounds } = source(editor);
  if (!['linear', 'radial'].includes(settings.type) || !Number.isFinite(settings.angle) || Math.abs(settings.angle) > 360 ||
      !Number.isFinite(settings.opacity) || settings.opacity < 0 || settings.opacity > 100) throw new Error('geometry');
  const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
  const theta = -settings.angle * Math.PI / 180, dx = Math.cos(theta), dy = Math.sin(theta);
  // The full bounds projected on the axis: corners reach the end colours at
  // every angle. Coordinates stay in the curve's local system (Y down).
  const half = (Math.abs(dx) * bounds.w + Math.abs(dy) * bounds.h) / 2;
  const gradient: VectorGradient = settings.type === 'linear' ? {
    type: 'linear', matrix: [1, 0, 0, 1, 0, 0],
    start: [cx - dx * half, cy - dy * half], end: [cx + dx * half, cy + dy * half],
    r0: 0, r1: 0, stops: structuredClone(settings.stops),
  } : {
    type: 'radial', matrix: [bounds.w / 2, 0, 0, bounds.h / 2, cx, cy],
    start: [0, 0], end: [0, 0], r0: 0, r1: 1, stops: structuredClone(settings.stops),
  };
  const next: VectorPaint = { ...paint, raster: undefined, gradient, fillOpacity: settings.opacity / 100 };
  if (!validVectorPaint(next)) throw new Error('geometry');
  return { revision: cadRevision(editor), shapeId: shape.id, paint: next, contours: structuredClone(contours), fillRule, settings: structuredClone(settings) };
}

export function applyGradientFill(editor: Editor, plan: GradientFillPlan): boolean {
  try {
    if (plan.revision !== cadRevision(editor)) return false;
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision !== cadRevision(editor)) return false;
    const fresh = prepareGradientFill(editor, plan.settings);
    if (fresh.shapeId !== plan.shapeId || fresh.fillRule !== plan.fillRule ||
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
