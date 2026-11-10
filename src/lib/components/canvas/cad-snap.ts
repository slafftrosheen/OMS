import type { Editor, TLShapeId } from '@tldraw/tldraw';
import type { CadPoint } from './cad-settings';

/** Drafting snaps use stored endpoints/centres, never sampled curve vertices. */
export function snapCadPoint(editor: Editor, point: CadPoint, exclude: TLShapeId | null): CadPoint {
  const enabled = editor.user.getIsSnapMode() !== !!editor.inputs.ctrlKey;
  if (!enabled) return point;
  const tolerance = 8 / editor.getZoomLevel();
  let nearest = point, distance = tolerance;
  for (const shape of editor.getCurrentPageShapesSorted()) {
    if (shape.id === exclude) continue;
    const p = shape.props as Record<string, any>;
    let points: CadPoint[];
    if (shape.type === 'cad-bezier') points = p.contours.flatMap(c => c.nodes);
    else if (shape.type === 'cad-path') points = p.points;
    else if (shape.type === 'line' && p.spline === 'line') points = Object.values(p.points);
    else if (shape.type === 'cad-ellipse') points = [{ x: p.w / 2, y: p.h / 2 }, { x: 0, y: p.h / 2 }, { x: p.w, y: p.h / 2 }, { x: p.w / 2, y: 0 }, { x: p.w / 2, y: p.h }];
    else if (shape.type === 'cad-arc') points = [{ x: 0, y: 0 }, ...[p.startAngle, p.endAngle].map(a => ({ x: p.radius * Math.cos(a * Math.PI / 180), y: -p.radius * Math.sin(a * Math.PI / 180) }))];
    else if (shape.type === 'geo' && ['rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star'].includes(p.geo)) {
      const geometry = editor.getShapeGeometry(shape) as any;
      points = (geometry.children?.[0] ?? geometry).vertices;
    } else continue;
    const bounds = editor.getShapePageBounds(shape);
    // Arc centres can sit outside their visible arc bounds.
    if (shape.type !== 'cad-arc' && bounds && (point.x < bounds.minX - tolerance || point.x > bounds.maxX + tolerance || point.y < bounds.minY - tolerance || point.y > bounds.maxY + tolerance)) continue;
    const matrix = editor.getShapePageTransform(shape);
    for (const candidate of points) {
      const world = matrix.applyToPoint(candidate), delta = Math.hypot(point.x - world.x, point.y - world.y);
      if (delta < distance) { nearest = world; distance = delta; }
    }
  }
  return nearest;
}
