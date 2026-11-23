import { curvePathData, mapContours } from './cad-curves';
import type { DxfEntity } from './cad-dxf';
import { entityEndpoints } from './cad-cut-order';
import type { CadPoint } from './cad-settings';

type Layer = { name: string; rgb?: string };
type PreviewPath = { rgb?: string; path: string };
export type DxfPreviewSource = { entity: DxfEntity; layer: Layer; rgb?: string };
export interface DxfPreview {
  viewBox: string;
  layers: Array<Layer & PreviewPath & { colorPaths?: PreviewPath[] }>;
  /** Round 7 · rapid moves between entities in file order, and the first start point. */
  travel?: { path: string; start: CadPoint; moves: number };
}

type ProjectPoint = (p: CadPoint) => CadPoint;
const coord = (p: CadPoint) => `${p.x},${p.y}`;

function ellipsePath(center: CadPoint, major: CadPoint, ratio: number, project: ProjectPoint) {
  const origin = project(center);
  const a = { x: origin.x + major.x, y: origin.y - major.y };
  const b = { x: origin.x - major.x, y: origin.y + major.y };
  const radius = Math.hypot(major.x, major.y), angle = -Math.atan2(major.y, major.x) * 180 / Math.PI;
  const arc = `A${radius},${radius * ratio} ${angle} 0 0 `;
  return `M${coord(a)} ${arc}${coord(b)} ${arc}${coord(a)} Z`;
}

function pathFor(entity: DxfEntity, project: ProjectPoint): string {
  if (entity.type === 'polyline') {
    const points = entity.points.map(p => coord(project(p)));
    return `M${points[0]} L${points.slice(1).join(' ')}${entity.closed ? ' Z' : ''}`;
  }
  if (entity.type === 'spline') return curvePathData(mapContours([entity.contour], project));
  if (entity.type === 'circle') return ellipsePath(entity.center, { x: entity.radius, y: 0 }, 1, project);
  if (entity.type === 'ellipse') return ellipsePath(entity.center, entity.major, entity.ratio, project);
  const { center, radius, start, end } = entity;
  const origin = project(center);
  const at = (angle: number) => {
    const rad = angle * Math.PI / 180;
    return coord({ x: origin.x + radius * Math.cos(rad), y: origin.y - radius * Math.sin(rad) });
  };
  const sweep = (end - start + 360) % 360;
  return `M${at(start)} A${radius},${radius} 0 ${sweep > 180 ? 1 : 0} 0 ${at(end)}`;
}

/** Use the emitted geometry and layer names. Translate near SVG origin
 * so distant model coordinates do not erode display precision. */
export function buildDxfPreview(
  entries: DxfPreviewSource[],
  { minX, minY, maxX, maxY }: { minX: number; minY: number; maxX: number; maxY: number },
): DxfPreview {
  const w = maxX - minX, h = maxY - minY, margin = Math.max(w, h, 1e-6) * 0.06;
  const project = (p: CadPoint) => ({ x: p.x - minX, y: maxY - p.y });
  const grouped = new Map<string, Map<string | undefined, string[]>>();
  for (const { entity, layer, rgb } of entries) {
    const colors = grouped.get(layer.name) ?? new Map<string | undefined, string[]>();
    const color = rgb ?? layer.rgb;
    const paths = colors.get(color) ?? [];
    paths.push(pathFor(entity, project));
    colors.set(color, paths);
    grouped.set(layer.name, colors);
  }
  // Rapid moves in emitted order: lift at an entity's end, go down at the next one's start.
  const hops: string[] = [];
  let last: CadPoint | null = null, first: CadPoint | null = null;
  for (const { entity } of entries) {
    const { start, end } = entityEndpoints(entity);
    const s = project(start);
    if (!first) first = s;
    if (last && Math.hypot(s.x - last.x, s.y - last.y) > 1e-9) hops.push(`M${coord(last)} L${coord(s)}`);
    last = project(end);
  }
  return {
    ...(first ? { travel: { path: hops.join(' '), start: first, moves: hops.length } } : {}),
    viewBox: `${-margin} ${-margin} ${w + 2 * margin} ${h + 2 * margin}`,
    layers: Array.from(grouped, ([name, colors]) => {
      const paths = Array.from(colors, ([rgb, parts]) => ({ rgb, path: parts.join(' ') }));
      return paths.length === 1 ? { name, ...paths[0] } : { name, path: '', colorPaths: paths };
    }),
  };
}
