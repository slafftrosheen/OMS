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

/** Included angle of the two rays at a shared endpoint, including obtuse corners. Units are millimetres. */
export function measureCadJointAngle(first: CadSegment, second: CadSegment): number | undefined {
  for (const [a, aEnd] of [[first.start, first.end], [first.end, first.start]]) {
    for (const [b, bEnd] of [[second.start, second.end], [second.end, second.start]]) {
      if (Math.hypot(a.x - b.x, a.y - b.y) > 0.001) continue;
      const u = delta(a, aEnd), v = delta(b, bEnd);
      if (Math.min(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y)) < 1e-6) continue;
      return Math.atan2(Math.abs(u.x * v.y - u.y * v.x), u.x * v.x + u.y * v.y) / radians;
    }
  }
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
  { id: 'washer', category: 'mounting', width: 30, height: 30, square: true },
  { id: 'cornerBracket', category: 'mounting', width: 60, height: 60 },
  { id: 'signBlank', category: 'signBlanks', width: 300, height: 120 },
  { id: 'ovalSign', category: 'signBlanks', width: 200, height: 100 },
  { id: 'roundSign', category: 'signBlanks', width: 150, height: 150, square: true },
  { id: 'capsuleSign', category: 'signBlanks', width: 240, height: 80 },
  { id: 'archSign', category: 'signBlanks', width: 160, height: 200 },
  { id: 'pennantSign', category: 'signBlanks', width: 240, height: 100 },
  { id: 'ticketSign', category: 'signBlanks', width: 180, height: 80 },
  { id: 'hexagonSign', category: 'signBlanks', width: 160, height: 140 },
  { id: 'shieldSign', category: 'signBlanks', width: 140, height: 170 },
  { id: 'arrowRight', category: 'arrows', width: 120, height: 60 },
  { id: 'arrowLeft', category: 'arrows', width: 120, height: 60 },
  { id: 'arrowUp', category: 'arrows', width: 60, height: 120 },
  { id: 'arrowDown', category: 'arrows', width: 60, height: 120 },
  { id: 'arrowDouble', category: 'arrows', width: 160, height: 60 },
  { id: 'chevronRight', category: 'arrows', width: 80, height: 100 },
  { id: 'arrowTurnRight', category: 'arrows', width: 100, height: 100 },
  { id: 'heart', category: 'symbols', width: 100, height: 90 },
  { id: 'leaf', category: 'symbols', width: 80, height: 120 },
  { id: 'starFive', category: 'symbols', width: 100, height: 100 },
  { id: 'starEight', category: 'symbols', width: 100, height: 100 },
  { id: 'lightning', category: 'symbols', width: 60, height: 120 },
  { id: 'plus', category: 'symbols', width: 80, height: 80 },
  { id: 'checkMark', category: 'symbols', width: 100, height: 80 },
  { id: 'locationPin', category: 'symbols', width: 80, height: 120 },
  { id: 'registrationTarget', category: 'printMarks', width: 20, height: 20, square: true },
  { id: 'drillMark', category: 'printMarks', width: 10, height: 10, square: true },
  { id: 'trimMarks', category: 'printMarks', width: 116, height: 66 },
  { id: 'rulerMarks', category: 'printMarks', width: 100, height: 10 },
  { id: 'focusTarget', category: 'printMarks', width: 20, height: 20, square: true },
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
  // Normalized outlines use the requested envelope, retaining real Bézier
  // handles rather than baking preview tessellation into the document.
  const polygon = (vertices: ReadonlyArray<readonly [number, number]>): ProductionEntity => ({
    type: 'polyline', closed: true, points: vertices.map(([px, py]) => point(px * x, py * y))
  });
  const curve = (nodes: ReadonlyArray<readonly [number, number, number, number, number, number]>): ProductionEntity => ({
    type: 'spline', contour: { closed: true, nodes: nodes.map(([px, py, ix, iy, ox, oy]) => ({
      ...nodeAt(point(px * x, py * y)), inX: ix * x, inY: iy * y, outX: ox * x, outY: oy * y
    })) }
  });
  const rectangle: ProductionEntity = {
    type: 'polyline', points: [point(-x, -y), point(x, -y), point(x, y), point(-x, y)], closed: true
  };
  switch (id) {
    case 'mountingSlot':
    case 'capsuleSign': {
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
    case 'roundSign':
      return [hole(0, 0, x)];
    case 'washer':
      return [hole(0, 0, x), hole(0, 0, x * .4)];
    case 'cornerBracket': {
      const thickness = Math.min(width, height) * .3;
      return [{ type: 'polyline', closed: true, points: [point(-x, -y), point(x, -y), point(x, -y + thickness),
        point(-x + thickness, -y + thickness), point(-x + thickness, y), point(-x, y)] },
      hole(x - thickness / 2, -y + thickness / 2, thickness * .15),
      hole(-x + thickness / 2, y - thickness / 2, thickness * .15)];
    }
    case 'ovalSign':
      return [{ type: 'spline', contour: arcContour(0, 0, x, y, 0, Math.PI * 2) }];
    case 'archSign': {
      const radiusY = height * .35;
      const arch = arcContour(0, y - radiusY, x, radiusY, 0, Math.PI, Math.PI / 4);
      return [{ type: 'spline', contour: { closed: true, nodes: [...arch.nodes, nodeAt(point(-x, -y)), nodeAt(point(x, -y))] } }];
    }
    case 'pennantSign':
      return [polygon([[-1, -1], [.5, -1], [1, 0], [.5, 1], [-1, 1]])];
    case 'ticketSign':
      return [polygon([[-1, -1], [1, -1], [1, -.3], [.8, 0], [1, .3], [1, 1], [-1, 1], [-1, .3], [-.8, 0], [-1, -.3]])];
    case 'hexagonSign':
      return [polygon([[-.5, -1], [.5, -1], [1, 0], [.5, 1], [-.5, 1], [-1, 0]])];
    case 'shieldSign':
      return [curve([[-1, 1, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0], [1, .15, 0, 0, 0, -.55],
        [0, -1, .45, .2, -.45, .2], [-1, .15, 0, -.55, 0, 0]])];
    case 'arrowRight':
    case 'arrowLeft':
    case 'arrowUp':
    case 'arrowDown': {
      const vertices = [[-1, -.3], [.2, -.3], [.2, -1], [1, 0], [.2, 1], [.2, .3], [-1, .3]] as const;
      return [polygon(vertices.map(([px, py]) => id === 'arrowLeft' ? [-px, py] : id === 'arrowUp' ? [py, px]
        : id === 'arrowDown' ? [py, -px] : [px, py]))];
    }
    case 'arrowDouble':
      return [polygon([[-1, 0], [-.55, -1], [-.55, -.3], [.55, -.3], [.55, -1], [1, 0], [.55, 1], [.55, .3], [-.55, .3], [-.55, 1]])];
    case 'chevronRight':
      return [polygon([[-1, -1], [0, -1], [1, 0], [0, 1], [-1, 1], [0, 0]])];
    case 'arrowTurnRight':
      return [polygon([[-1, -1], [-.4, -1], [-.4, .05], [.2, .05], [.2, -.4], [1, .3], [.2, 1], [.2, .55], [-1, .55]])];
    case 'heart':
      return [curve([[0, -1, .2, .25, -.2, .25], [-1, .2, 0, -.45, 0, .5], [-.5, 1, -.3, 0, .3, 0],
        [0, .45, -.1, .25, .1, .25], [.5, 1, -.3, 0, .3, 0], [1, .2, 0, .5, 0, -.45]])];
    case 'leaf':
      return [curve([[0, -1, .45, .2, -.45, .2], [-1, 0, 0, -.5, 0, .5], [0, 1, -.45, -.2, .45, -.2], [1, 0, 0, .5, 0, -.5]])];
    case 'starFive':
    case 'starEight': {
      const count = id === 'starFive' ? 5 : 8;
      const raw = Array.from({ length: count * 2 }, (_, index) => {
        const angle = Math.PI / 2 + index * Math.PI / count, r = index % 2 ? .42 : 1;
        return point(Math.cos(angle) * r, Math.sin(angle) * r);
      });
      // A five-point star does not have extrema at every quadrant. Normalize its
      // actual vertices so the dimensions shown in the docker remain exact.
      const minX = Math.min(...raw.map(p => p.x)), maxX = Math.max(...raw.map(p => p.x));
      const minY = Math.min(...raw.map(p => p.y)), maxY = Math.max(...raw.map(p => p.y));
      return [polygon(raw.map(p => [(p.x - minX) * 2 / (maxX - minX) - 1, (p.y - minY) * 2 / (maxY - minY) - 1]))];
    }
    case 'lightning':
      return [polygon([[.2, 1], [-1, -.1], [-.2, -.1], [-.5, -1], [1, .25], [.2, .25]])];
    case 'plus':
      return [polygon([[-.3, -1], [.3, -1], [.3, -.3], [1, -.3], [1, .3], [.3, .3], [.3, 1], [-.3, 1], [-.3, .3], [-1, .3], [-1, -.3], [-.3, -.3]])];
    case 'checkMark':
      return [polygon([[-1, -.05], [-.7, .25], [-.3, -.35], [.7, 1], [1, .7], [-.3, -1]])];
    case 'locationPin': {
      const outer = curve([[0, -1, .3, .4, -.3, .4], [-1, .25, 0, -.35, 0, .45], [0, 1, -.55, 0, .55, 0], [1, .25, 0, .45, 0, -.35]]);
      const inner = { type: 'spline' as const, contour: arcContour(0, y * .3, x * .35, y * .23, 0, Math.PI * 2) };
      return [outer, inner];
    }
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
    case 'rulerMarks':
      return [line(-x, -y, x, -y), ...Array.from({ length: 11 }, (_, index) => {
        const px = -x + width * index / 10;
        return line(px, -y, px, index % 5 === 0 ? y : index % 2 === 0 ? y * .35 : 0);
      })];
    case 'focusTarget':
      return [hole(0, 0, x), hole(0, 0, x * .5), line(-x, 0, x, 0), line(0, -y, 0, y)];
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
