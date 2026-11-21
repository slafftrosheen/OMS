import { arcContour, nodeAt, type CadContour } from './cad-curves';
import type { DxfEntity } from './cad-dxf';
import type { CadPoint } from './cad-settings';
import { CAD_MAX_COORDINATE } from './cad-limits';

export interface CadSegment {
  start: CadPoint;
  end: CadPoint;
}

const radians = Math.PI / 180;
const delta = (from: CadPoint, to: CadPoint) => ({ x: to.x - from.x, y: to.y - from.y });
const translated = (p: CadPoint, dx: number, dy: number) => ({ x: p.x + dx, y: p.y + dy });

export function measureCadSegment({ start, end }: CadSegment) {
  const { x, y } = delta(start, end);
  return { x, y, length: Math.hypot(x, y), heading: (Math.atan2(y, x) / radians + 360) % 360 };
}

/** Smaller angle between two unoriented edges, in degrees. */
export function measureCadEdgeAngle(first: CadSegment, second: CadSegment) {
  const a = measureCadSegment(first);
  const b = measureCadSegment(second);
  const difference = Math.abs(a.heading - b.heading) % 180;
  return Math.min(difference, 180 - difference);
}

export function parallelCadSegment(segment: CadSegment, distance: number): CadSegment {
  const { x, y, length } = measureCadSegment(segment);
  const dx = -y / length * distance;
  const dy = x / length * distance;
  return { start: translated(segment.start, dx, dy), end: translated(segment.end, dx, dy) };
}

export function angledCadSegment(start: CadPoint, length: number, heading: number): CadSegment {
  const angle = (heading % 360) * radians;
  return { start, end: translated(start, length * Math.cos(angle), length * Math.sin(angle)) };
}

export const productionPresets = [
  { id: 'mountingSlot', category: 'mounting', width: 24, height: 6 },
  { id: 'mountingPlate', category: 'mounting', width: 100, height: 40 },
  { id: 'mountingRail', category: 'mounting', width: 120, height: 24 },
  { id: 'cableEntry', category: 'mounting', width: 20, height: 20, square: true },
  { id: 'signBlank', category: 'signBlanks', width: 300, height: 120 },
  { id: 'registrationTarget', category: 'printMarks', width: 20, height: 20, square: true },
  { id: 'drillMark', category: 'printMarks', width: 10, height: 10, square: true },
  { id: 'trimMarks', category: 'printMarks', width: 116, height: 66 },
] as const satisfies ReadonlyArray<{ id: string; category: string; width: number; height: number; square?: true }>;
export type ProductionPreset = typeof productionPresets[number]['id'];

type ProductionEntity = Extract<DxfEntity, { type: 'circle' | 'polyline' | 'spline' }>;
type PresetSize = { width: number; height: number };

export function productionPresetGeometry(id: ProductionPreset, size?: PresetSize): ProductionEntity[] {
  const preset = productionPresets.find(item => item.id === id);
  if (!preset) return [];
  const { width, height } = size ?? preset;
  if (![width, height].every(dimension => Number.isFinite(dimension) && dimension > 0.001 && dimension <= CAD_MAX_COORDINATE)) return [];
  if ('square' in preset && width !== height) return [];
  const x = width / 2;
  const y = height / 2;
  const point = (x: number, y: number) => ({ x, y });
  const line = (x1: number, y1: number, x2: number, y2: number): ProductionEntity => ({
    type: 'polyline', points: [point(x1, y1), point(x2, y2)], closed: false
  });
  const hole = (x: number, y: number, radius: number): ProductionEntity => ({ type: 'circle', center: point(x, y), radius });
  const rectangle: ProductionEntity = {
    type: 'polyline', points: [point(-x, -y), point(x, -y), point(x, y), point(-x, y)], closed: true
  };
  switch (id) {
    case 'mountingSlot': {
      if (width < height) return [];
      if (width === height) return [hole(0, 0, y)];
      const right = arcContour(x - y, 0, y, y, -Math.PI / 2, Math.PI, Math.PI / 4);
      const left = arcContour(y - x, 0, y, y, Math.PI / 2, Math.PI, Math.PI / 4);
      return [{ type: 'spline', contour: { closed: true, nodes: [...right.nodes, ...left.nodes] } }];
    }
    case 'mountingPlate':
      if (width <= 26 || height <= 26) return [];
      return [rectangle, ...[-x + 10, x - 10].flatMap(cx => [-y + 10, y - 10].map(cy => hole(cx, cy, 3)))];
    case 'mountingRail':
      if (width <= 26 || height <= 6) return [];
      return [rectangle, hole(-x + 10, 0, 3), hole(x - 10, 0, 3)];
    case 'cableEntry':
      return [hole(0, 0, x)];
    case 'signBlank': {
      const r = 5;
      if (width <= 2 * r || height <= 2 * r) return [];
      const corners = [[x - r, y - r], [r - x, y - r], [r - x, r - y], [x - r, r - y]];
      return [{ type: 'spline', contour: { closed: true, nodes: corners.flatMap(([cx, cy], i) =>
        arcContour(cx, cy, r, r, i * Math.PI / 2, Math.PI / 2).nodes) } }];
    }
    case 'registrationTarget':
      return [hole(0, 0, x * 0.6), line(-x, 0, x, 0), line(0, -y, 0, y)];
    case 'drillMark':
      return [line(-x, 0, x, 0), line(0, -y, 0, y)];
    case 'trimMarks':
      if (width <= 16 || height <= 16) return [];
      return [-1, 1].flatMap(sx => [-1, 1].flatMap(sy => [
        line(sx * (x - 5), sy * (y - 8), sx * x, sy * (y - 8)),
        line(sx * (x - 8), sy * (y - 5), sx * (x - 8), sy * y)
      ]));
  }
}

export function segmentContour(segment: CadSegment): CadContour {
  return { closed: false, nodes: [nodeAt(segment.start), nodeAt(segment.end)] };
}
