import { validCadPoint, type CadPoint } from './cad-settings';

/** A true perpendicular foot on the finite segment, never a clamped endpoint. */
export function perpendicularSegmentPoint(anchor: CadPoint, a: CadPoint, b: CadPoint): CadPoint | null {
  if (![anchor, a, b].every(validCadPoint)) return null;
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  if (!Number.isFinite(squared) || squared < 1e-18) return null;
  const t = ((anchor.x - a.x) * dx + (anchor.y - a.y) * dy) / squared;
  if (t < 0 || t > 1) return null;
  const foot = { x: a.x + t * dx, y: a.y + t * dy };
  return validCadPoint(foot) && Math.hypot(foot.x - anchor.x, foot.y - anchor.y) >= 1e-6 ? foot : null;
}

/** Tangency is affine invariant: normalize the ellipse to a unit circle, solve
 * its two external tangents, then restore the exact ellipse coordinates.
 * Angles follow CAD arcs (Y up); start/end may cross the 360-degree seam. */
export function ellipseTangentPoints(
  anchor: CadPoint, center: CadPoint, rx: number, ry: number, start = 0, end = 360,
): CadPoint[] {
  if (![anchor, center].every(validCadPoint) || ![rx, ry, start, end].every(Number.isFinite) || rx <= 0 || ry <= 0) return [];
  const sweep = end - start;
  if (sweep <= 0 || sweep > 360 + 1e-8) return [];
  const u = (anchor.x - center.x) / rx, v = (center.y - anchor.y) / ry;
  const distance = Math.hypot(u, v);
  // Interior and on-curve starts have no nonzero external tangent segment.
  if (!Number.isFinite(distance) || distance <= 1 + 1e-12) return [];
  const nx = u / distance, ny = v / distance, cosine = 1 / distance;
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  return [-1, 1].flatMap(sign => {
    const x = nx * cosine - sign * ny * sine, y = ny * cosine + sign * nx * sine;
    const angle = Math.atan2(y, x) * 180 / Math.PI;
    const delta = ((angle - start) % 360 + 360) % 360;
    if (sweep < 360 - 1e-8 && delta > sweep + 1e-8 && 360 - delta > 1e-8) return [];
    const point = { x: center.x + rx * x, y: center.y - ry * y };
    return validCadPoint(point) && Math.hypot(point.x - anchor.x, point.y - anchor.y) >= 1e-6 ? [point] : [];
  });
}
