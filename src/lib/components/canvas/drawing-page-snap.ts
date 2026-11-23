import type { Box } from '@tldraw/tldraw';
import { validCadPoint, type CadPoint } from './cad-settings';

export type DrawingPageSnap =
  | { point: CadPoint; target: 'corner' | 'midpoint' | 'center' }
  | { point: CadPoint; target: 'edge'; axis: 'x' | 'y' };

/** Page features are finite geometry. Landmarks take priority over edge
 * projections, and an axis already owned by Pick may not move. */
export function nearestDrawingPageSnap(
  page: Box, point: CadPoint, tolerance: number, blocked?: ReadonlySet<'x' | 'y'>,
): DrawingPageSnap | null {
  if (!validCadPoint(point) || !Number.isFinite(tolerance) || tolerance <= 0) return null;
  const { minX, minY, midX, midY, maxX, maxY } = page;
  if (point.x < minX - tolerance || point.x > maxX + tolerance ||
      point.y < minY - tolerance || point.y > maxY + tolerance) return null;
  let closest: DrawingPageSnap | null = null, distance = tolerance;
  const offer = (candidate: DrawingPageSnap) => {
    const { x, y } = candidate.point;
    if (blocked?.has('x') && Math.abs(x - point.x) > 1e-8 ||
        blocked?.has('y') && Math.abs(y - point.y) > 1e-8) return;
    const error = Math.hypot(x - point.x, y - point.y);
    if (error <= distance && (!closest || error < distance)) {
      closest = candidate;
      distance = error;
    }
  };
  offer({ point: { x: midX, y: midY }, target: 'center' });
  for (const x of [minX, maxX]) {
    offer({ point: { x, y: minY }, target: 'corner' });
    offer({ point: { x, y: maxY }, target: 'corner' });
    offer({ point: { x, y: midY }, target: 'midpoint' });
  }
  offer({ point: { x: midX, y: minY }, target: 'midpoint' });
  offer({ point: { x: midX, y: maxY }, target: 'midpoint' });
  if (closest) return closest;
  // Off-segment projections cannot land on an edge. The corners above
  // handle valid approaches from outside in either direction.
  if (!blocked?.has('x') && point.y >= minY && point.y <= maxY) {
    offer({ point: { x: minX, y: point.y }, target: 'edge', axis: 'x' });
    offer({ point: { x: maxX, y: point.y }, target: 'edge', axis: 'x' });
  }
  if (!blocked?.has('y') && point.x >= minX && point.x <= maxX) {
    offer({ point: { x: point.x, y: minY }, target: 'edge', axis: 'y' });
    offer({ point: { x: point.x, y: maxY }, target: 'edge', axis: 'y' });
  }
  return closest;
}
