import { arcContour, nodeAt, type CadContour } from './cad-curves';
import type { DxfEntity } from './cad-dxf';
import type { CadPoint } from './cad-settings';

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
  { id: 'mountingSlot', width: 24, height: 6 },
  { id: 'mountingPlate', width: 100, height: 40 },
  { id: 'registrationTarget', width: 20, height: 20 },
  { id: 'drillMark', width: 10, height: 10 }
] as const;
export type ProductionPreset = typeof productionPresets[number]['id'];

type ProductionEntity = Extract<DxfEntity, { type: 'circle' | 'polyline' | 'spline' }>;

export function productionPresetGeometry(id: ProductionPreset): ProductionEntity[] {
  const point = (x: number, y: number) => ({ x, y });
  const line = (x1: number, y1: number, x2: number, y2: number): ProductionEntity => ({
    type: 'polyline', points: [point(x1, y1), point(x2, y2)], closed: false
  });
  const hole = (x: number, y: number, radius: number): ProductionEntity => ({ type: 'circle', center: point(x, y), radius });
  switch (id) {
    case 'mountingSlot': {
      const right = arcContour(9, 0, 3, 3, -Math.PI / 2, Math.PI, Math.PI / 4);
      const left = arcContour(-9, 0, 3, 3, Math.PI / 2, Math.PI, Math.PI / 4);
      const contour: CadContour = { closed: true, nodes: [...right.nodes, ...left.nodes] };
      return [{ type: 'spline', contour }];
    }
    case 'mountingPlate':
      return [
        { type: 'polyline', points: [point(-50, -20), point(50, -20), point(50, 20), point(-50, 20)], closed: true },
        ...[-40, 40].flatMap(x => [-10, 10].map(y => hole(x, y, 3)))
      ];
    case 'registrationTarget':
      return [hole(0, 0, 6), line(-10, 0, 10, 0), line(0, -10, 0, 10)];
    case 'drillMark':
      return [line(-5, 0, 5, 0), line(0, -5, 0, 5)];
  }
}

export function segmentContour(segment: CadSegment): CadContour {
  return { closed: false, nodes: [nodeAt(segment.start), nodeAt(segment.end)] };
}
