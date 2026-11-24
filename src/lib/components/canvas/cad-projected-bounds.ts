import { type CubicSpline2d, type Editor, type Group2d, type Polyline2d, type TLShape } from '@tldraw/tldraw';
import { contourSegments, validContours } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';

export interface CadProjectionRange { min: number; max: number }
/** Shared across every leaf of an operation, including nested groups. */
export interface CadProjectionBudget { remaining: number }
export const CAD_PROJECTION_LIMIT = 20_000;

const polygonGeos = new Set(['rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star',
  'rhombus', 'rhombus-2', 'trapezoid', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'check-box', 'x-box']);
const finitePoint = (point: CadPoint) => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
const turn = Math.PI * 2;
const normalizeAngle = (angle: number) => ((angle % turn) + turn) % turn;

/** Exact support of the shape's geometry along a page-space direction. This
 * projects the actual path, never its page AABB or sampled hit-test vertices.
 * Stroke thickness/sketch styling are excluded. Text/images and native labels
 * use their local layout boxes; freehand, clouds, hearts and dimensions are
 * deliberately unsupported. Callers enforce editing/clip/binding protections.
 * An arbitrary nonzero direction is allowed; unit vectors give page distances.
 */
export function getCadShapePageProjection(
  editor: Editor, shape: TLShape, direction: CadPoint,
  budget: CadProjectionBudget = { remaining: CAD_PROJECTION_LIMIT },
): CadProjectionRange | undefined {
  try {
    if (!finitePoint(direction) || Math.hypot(direction.x, direction.y) < 1e-12 ||
        !Number.isFinite(budget.remaining) || budget.remaining < 1) return undefined;
    const matrix = editor.getShapePageTransform(shape), p = shape.props as Record<string, any>;
    // Keep the translation out of derivative calculations, preserving small
    // curve extrema even when artwork is far from the page origin.
    const dx = direction.x * matrix.a + direction.y * matrix.b,
      dy = direction.x * matrix.c + direction.y * matrix.d,
      offset = direction.x * matrix.e + direction.y * matrix.f;
    if (![dx, dy, offset].every(Number.isFinite)) return undefined;
    let min = Infinity, max = -Infinity;
    const consume = (count: number) => {
      if (!Number.isInteger(count) || count < 1 || (budget.remaining -= count) < 0) throw Error('projection-limit');
    };
    const scalar = (point: CadPoint) => {
      if (!finitePoint(point)) throw Error('projection-point');
      return point.x * dx + point.y * dy;
    };
    const add = (value: number) => { min = Math.min(min, value); max = Math.max(max, value); };
    const points = (values: CadPoint[]) => {
      if (!Array.isArray(values) || !values.length) throw Error('projection-empty');
      consume(values.length);
      for (const point of values) add(scalar(point));
    };
    const cubic = (values: CadPoint[]) => {
      consume(1);
      const [p0, p1, p2, p3] = values.map(scalar);
      add(p0); add(p3);
      // The derivative divided by three is a*t² + b*t + c. Evaluate all
      // interior roots; a stable quadratic form avoids cancellation at a root.
      const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
      const epsilon = Number.EPSILON * 16 * Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
      let roots: number[] = [];
      if (Math.abs(a) <= epsilon) {
        if (Math.abs(b) > epsilon) roots = [-c / b];
      } else {
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
          const q = -.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
          roots = q ? [q / a, c / q] : [-b / (2 * a)];
        }
      }
      for (const t of roots) if (t > 0 && t < 1) {
        const u = 1 - t;
        add(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3);
      }
    };
    const ellipse = (w: number, h: number) => {
      if (![w, h].every(value => Number.isFinite(value) && value > 0)) throw Error('projection-size');
      consume(1);
      const center = scalar({ x: w / 2, y: h / 2 }), radius = Math.hypot(w / 2 * dx, h / 2 * dy);
      add(center - radius); add(center + radius);
    };

    if (shape.type === 'cad-bezier') {
      if (!validContours(p.contours)) return undefined;
      for (const contour of p.contours) for (const segment of contourSegments(contour)) cubic(segment);
    } else if (shape.type === 'cad-path') {
      if (!Array.isArray(p.points) || p.points.length < 2 || !p.points.every(validCadPoint)) return undefined;
      points(p.points);
    } else if (shape.type === 'cad-ellipse') ellipse(p.w, p.h);
    else if (shape.type === 'cad-arc') {
      const sweep = (p.endAngle - p.startAngle) * Math.PI / 180;
      // Legacy zero, reversed and full-turn SVG arcs do not have the same
      // center/sweep interpretation as the editable analytic arc contract.
      if (![p.radius, p.startAngle, p.endAngle].every(Number.isFinite) || p.radius <= 0 || sweep <= 0 || sweep >= turn) return undefined;
      consume(1);
      const start = normalizeAngle(p.startAngle * Math.PI / 180), a = p.radius * dx, b = -p.radius * dy;
      const at = (angle: number) => a * Math.cos(angle) + b * Math.sin(angle);
      add(at(start)); add(at(start + sweep));
      const critical = Math.atan2(b, a);
      for (const angle of [critical, critical + Math.PI])
        if (normalizeAngle(angle - start) <= sweep + 1e-12) add(at(angle));
    } else if (shape.type === 'line') {
      if (!p.points || Object.keys(p.points).length > budget.remaining) return undefined;
      const geometry = editor.getShapeGeometry(shape);
      if (p.spline === 'line') points((geometry as Polyline2d).points);
      else if (p.spline === 'cubic') {
        const segments = (geometry as CubicSpline2d).segments;
        if (!segments?.length || segments.length > budget.remaining) return undefined;
        for (const segment of segments) cubic([segment.a, segment.b, segment.c, segment.d]);
      } else return undefined;
    } else if (shape.type === 'geo') {
      const w = Math.max(1, p.w), h = Math.max(1, p.h + p.growY);
      if (![w, h].every(Number.isFinite)) return undefined;
      if (p.geo === 'ellipse') ellipse(w, h);
      else if (p.geo === 'oval') {
        consume(1);
        const r = Math.min(w, h) / 2, radius = r * Math.hypot(dx, dy);
        // A stadium is a line segment swept by a circle, not an ellipse.
        const a = scalar({ x: w >= h ? r : w / 2, y: h >= w ? r : h / 2 }),
          b = scalar({ x: w >= h ? w - r : w / 2, y: h >= w ? h - r : h / 2 });
        add(Math.min(a, b) - radius); add(Math.max(a, b) + radius);
      } else if (polygonGeos.has(p.geo)) {
        const body = (editor.getShapeGeometry(shape) as Group2d).children?.[0] as Polyline2d | undefined;
        if (!body) return undefined;
        points(body.points);
      } else return undefined;
      if (typeof p.text === 'string' && p.text.trim()) {
        for (const label of (editor.getShapeGeometry(shape) as Group2d).children.filter(child => child.isLabel)) points(label.bounds.corners);
      }
    } else if (shape.type === 'text' || shape.type === 'image') {
      points(editor.getShapeGeometry(shape).bounds.corners);
    } else return undefined;
    return Number.isFinite(min + offset) && Number.isFinite(max + offset) ? { min: min + offset, max: max + offset } : undefined;
  } catch { return undefined; }
}
