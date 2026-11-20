import type { TLShape } from '@tldraw/tldraw';
import { curveBounds, flattenContours, validContours } from './cad-curves';
import { vectorPaint } from './cad-vector';
import type { VectorPaint } from './cad-paint';

export const CAD_APPEARANCE_TYPES = new Set(['cad-bezier', 'cad-path', 'cad-ellipse', 'cad-arc']);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000;

/** Local geometric bounds, never page-aligned bounds or sampled conics. */
export function cadAppearanceGeometry(shape: TLShape) {
  const p = shape.props as any;
  if (shape.type === 'cad-bezier') {
    if (!validContours(p.contours)) throw new Error('incompatible');
    return { bounds: curveBounds(p.contours), closed: p.contours.every((c: any) => c.closed) };
  }
  if (shape.type === 'cad-path') {
    if (!Array.isArray(p.points) || p.points.length < 2 || p.points.length > 256 ||
        typeof p.closed !== 'boolean' || p.points.some((q: any) => !finite(q.x) || !finite(q.y))) throw new Error('incompatible');
    const xs = p.points.map((q: any) => q.x), ys = p.points.map((q: any) => q.y);
    return { bounds: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, closed: p.closed };
  }
  if (shape.type === 'cad-ellipse') {
    if (!finite(p.w) || !finite(p.h) || p.w <= 0 || p.h <= 0) throw new Error('incompatible');
    return { bounds: { x: 0, y: 0, w: p.w, h: p.h }, closed: true };
  }
  if (shape.type === 'cad-arc') {
    if (!finite(p.radius) || p.radius <= 0 || !finite(p.startAngle) || !finite(p.endAngle) ||
        p.endAngle <= p.startAngle || p.endAngle - p.startAngle >= 360) throw new Error('incompatible');
    const angles = [p.startAngle, p.endAngle];
    for (let a = Math.ceil(p.startAngle / 90) * 90; a < p.endAngle; a += 90) angles.push(a);
    const xs = angles.map(a => p.radius * Math.cos(a * Math.PI / 180));
    const ys = angles.map(a => -p.radius * Math.sin(a * Math.PI / 180));
    return { bounds: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, closed: false };
  }
  throw new Error('incompatible');
}

/** Analytic arcs/open paths stay outlines; do not implicitly close them for fill. */
export function cadShapePaint(shape: TLShape): VectorPaint {
  const paint = vectorPaint(shape.meta, (shape.props as any).color);
  if (shape.type === 'cad-arc' || shape.type === 'cad-path' && !(shape.props as any).closed) {
    paint.fill = 'none'; delete paint.gradient; delete paint.raster;
  }
  return paint;
}
export function cadPaintHasStroke(paint: VectorPaint): boolean {
  return paint.stroke !== 'none' && paint.strokeOpacity > 0 && paint.strokeWidth > 0;
}
export function cadPaintHasFill(paint: VectorPaint): boolean {
  return paint.fillOpacity > 0 && (paint.fill !== 'none' || !!paint.gradient || !!paint.raster);
}

/** The exact native conic path is used by the canvas and SVG export. */
export function cadAnalyticPath(shape: TLShape): string {
  cadAppearanceGeometry(shape);
  const p = shape.props as any;
  if (shape.type === 'cad-path') return p.points.map((q: any, i: number) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ') + (p.closed ? ' Z' : '');
  if (shape.type === 'cad-ellipse') {
    const rx = p.w / 2, ry = p.h / 2;
    return `M0,${ry} A${rx},${ry} 0 1 0 ${p.w},${ry} A${rx},${ry} 0 1 0 0,${ry} Z`;
  }
  if (shape.type === 'cad-arc') {
    const a = p.startAngle * Math.PI / 180, b = p.endAngle * Math.PI / 180;
    return `M${p.radius * Math.cos(a)},${-p.radius * Math.sin(a)} A${p.radius},${p.radius} 0 ${p.endAngle - p.startAngle > 180 ? 1 : 0} 0 ${p.radius * Math.cos(b)},${-p.radius * Math.sin(b)}`;
  }
  throw new Error('incompatible');
}

/** Preflatten clips once per cached geometry, matching the Bézier hit-test tolerance. */
export function cadPaintClipTest(paint: VectorPaint) {
  const clips = (paint.clips ?? []).map(clip => ({ rule: clip.fillRule, points: flattenContours(clip.contours, 0.25, 200000) }));
  return (point: { x: number; y: number }) => clips.every(clip => {
    let winding = 0;
    for (const points of clip.points) for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
      if (a.y <= point.y && b.y > point.y && side > 0) winding++;
      if (a.y > point.y && b.y <= point.y && side < 0) winding--;
    }
    return clip.rule === 'evenodd' ? Math.abs(winding) % 2 === 1 : winding !== 0;
  });
}
