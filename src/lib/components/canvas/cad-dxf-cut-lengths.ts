import { cubicLength, ellipseLength, type CurveLengthBudget } from './cad-curve-length';
import { contourSegments } from './cad-curves';
import type { DxfEntity } from './cad-dxf';
import type { DxfPreviewSource } from './cad-dxf-preview';
import type { CadPoint } from './cad-settings';

export interface DxfCutLengths {
  totalMm: number | null;
  byLayer: Partial<Record<string, number | null>>;
}

function distance(a: CadPoint, b: CadPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathLength(entity: DxfEntity, budget: CurveLengthBudget) {
  if (entity.type === 'polyline') {
    const { points, closed } = entity;
    let length = closed ? distance(points[points.length - 1], points[0]) : 0;
    for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i]);
    return length;
  }
  if (entity.type === 'circle') return 2 * Math.PI * entity.radius;
  if (entity.type === 'arc') {
    const sweep = (entity.end - entity.start + 360) % 360;
    return sweep * Math.PI / 180 * entity.radius;
  }
  if (entity.type === 'ellipse') {
    const major = Math.hypot(entity.major.x, entity.major.y);
    return ellipseLength(major, major * entity.ratio, Math.max(0.001, major * 1e-7), budget);
  }
  let length = 0;
  for (const points of contourSegments(entity.contour)) {
    const upper = distance(points[0], points[1]) + distance(points[1], points[2]) + distance(points[2], points[3]);
    length += cubicLength(points, Math.max(0.001, upper * 1e-7), budget);
  }
  return length;
}

/** Estimate geometric cutting distance in model-space millimetres. */
export function measureDxfCutLengths(entries: DxfPreviewSource[]): DxfCutLengths {
  const byLayer: DxfCutLengths['byLayer'] = {};
  const budget = { remaining: 200_000 };
  let totalMm: number | null = 0;
  for (const { entity, layer } of entries) {
    if (byLayer[layer.name] === null) continue;
    try {
      const length = pathLength(entity, budget);
      byLayer[layer.name] = (byLayer[layer.name] ?? 0) + length;
      if (totalMm !== null) totalMm += length;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'measurement-limit') throw error;
      // Keep the review usable without displaying an incomplete sum.
      byLayer[layer.name] = null;
      totalMm = null;
    }
  }
  return { totalMm, byLayer };
}
