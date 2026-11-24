import type { Editor, TLShape } from '@tldraw/tldraw';
import { contourSegments } from './cad-curves';
import { cubicLength, ellipseLength, type CurveLengthBudget } from './cad-curve-length';
import { cadShapeIsClipped, cadShapeHasNonCuttingRaster } from './cad-dxf';
import { shapeCadContours } from './cad-editing';
import { cadMmPerPixel, type CadSettings } from './cad-settings';
import { angularDimensionPoints, straightDimensionEdge } from './cad-dimension-links';

export { cubicLength } from './cad-curve-length';

interface ShapeMeasurement { length: number; open: number; closed: number; approximate: boolean; radius?: number; sweep?: number }
function measureShape(editor: Editor, shape: TLShape, tolerance: number, budget: CurveLengthBudget): ShapeMeasurement {
  const p = shape.props as Record<string, any>, paint = shape.meta.omsVectorPaint as any;
  // A clipped object's full path is not its visible/cutting perimeter.
  if (cadShapeIsClipped(editor, shape) || paint?.clips?.length || cadShapeHasNonCuttingRaster(shape)) throw new Error('measurement-unsupported');
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
  const result = { length: 0, open: 0, closed: 0, approximate: false, measured: 0, omitted: 0,
    radius: undefined as number | undefined, sweep: undefined as number | undefined,
    bearing: undefined as number | undefined, cornerAngle: undefined as number | undefined };
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
  // Only report an angle for supported, unclipped geometry. Page transforms
  // include every rotated ancestor; screen zoom never changes these values.
  if (!result.omitted && shapes.length) {
    const corner = angularDimensionPoints(editor, shapes);
    if (corner && shapes[0].type !== 'cad-arc') result.cornerAngle = Math.abs(corner.angleSweep!) * 180 / Math.PI;
    const edge = shapes.length === 1 && straightDimensionEdge(editor, shapes[0]);
    if (edge && Math.hypot(edge[1].x - edge[0].x, edge[1].y - edge[0].y) >= 1e-6)
      result.bearing = ((-Math.atan2(edge[1].y - edge[0].y, edge[1].x - edge[0].x) * 180 / Math.PI) % 360 + 360) % 360;
  }
  return result;
}
