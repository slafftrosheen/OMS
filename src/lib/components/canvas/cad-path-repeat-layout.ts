import { flattenContours, type CadContour } from './cad-curves';
import type { CadPoint } from './cad-settings';

export const MAX_PATH_REPEAT_COPIES = 200;
const EPS = 1e-8;
const MAX_SAMPLE_POINTS = 16000;
export type PathRepeatOptions = {
  startInset: number;
  endInset: number;
  offset: number;
  reverse: boolean;
  followTangent: boolean;
} & ({ mode: 'count'; count: number } | { mode: 'pitch'; pitch: number });

export type PathRepeatError = 'pathInvalid' | 'pathTooComplex' | 'pathInsets' | 'pathCopyLimit';

export interface PathCopyPosition {
  center: CadPoint;
  angle: number;
}

/** Position centres along the sampled guide, measuring pitch along the guide before applying the lateral offset. */
export function layoutPathCopies(
  contour: CadContour, options: PathRepeatOptions, tolerance: number,
): { length: number; pitch: number; positions: PathCopyPosition[] } | PathRepeatError {
  const { startInset, endInset, offset, reverse, followTangent } = options;
  if (contour.nodes.length < 2 || ![startInset, endInset, offset].every(Number.isFinite) ||
      startInset < 0 || endInset < 0 ||
      (options.mode === 'count' ? !Number.isInteger(options.count) || options.count < 1 : !Number.isFinite(options.pitch) || options.pitch <= EPS)) return 'pathInvalid';
  let points: CadPoint[];
  try { [points] = flattenContours([contour], tolerance, MAX_SAMPLE_POINTS); } catch { return 'pathTooComplex'; }
  if (reverse) {
    if (contour.closed) points = [points[0], ...points.slice(1).reverse()];
    else points.reverse();
  }
  if (contour.closed) points.push(points[0]);

  let length = 0;
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i];
    const dx = to.x - from.x, dy = to.y - from.y, span = Math.hypot(dx, dy);
    if (!Number.isFinite(span)) return 'pathInvalid';
    if (span <= EPS) continue;
    segments.push({ from, dx, dy, span, start: length });
    length += span;
  }
  if (!segments.length || !Number.isFinite(length)) return 'pathInvalid';
  const available = length - startInset - endInset;
  if (available <= EPS) return 'pathInsets';
  const fullLoop = contour.closed && startInset === 0 && endInset === 0;
  const count = options.mode === 'count' ? options.count : fullLoop
    ? Math.ceil(available / options.pitch - EPS)
    : Math.floor(available / options.pitch + EPS) + 1;
  if (count > MAX_PATH_REPEAT_COPIES) return 'pathCopyLimit';
  const total = Math.max(1, count);
  const pitch = options.mode === 'pitch' ? options.pitch : fullLoop ? available / total : total > 1 ? available / (total - 1) : 0;
  const first = options.mode === 'count' && total === 1 && !fullLoop ? startInset + available / 2 : startInset;
  let segment = 0;
  const positions = Array.from({ length: total }, (_, i) => {
    const distance = Math.min(length - endInset, first + i * pitch);
    while (segment + 1 < segments.length && distance >= segments[segment + 1].start) segment++;
    const { from, dx, dy, span, start } = segments[segment];
    const progress = (distance - start) / span;
    return {
      center: { x: from.x + dx * progress + dy / span * offset, y: from.y + dy * progress - dx / span * offset },
      angle: followTangent ? Math.atan2(dy, dx) : 0,
    };
  });
  return { length, pitch, positions };
}
