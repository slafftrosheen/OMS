import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { getCadShapePageBounds } from './cad-bounds';
import { validCadPoint, type CadPoint } from './cad-settings';

export const CAD_DIMENSION_SOURCE_LIMIT = 256;
export const CAD_RADIAL_DIMENSION_KINDS = ['radius', 'diameter'] as const;
export const CAD_DIMENSION_KINDS = ['horizontal', 'vertical', 'aligned', 'angular', ...CAD_RADIAL_DIMENSION_KINDS] as const;
export type CadRadialDimensionKind = typeof CAD_RADIAL_DIMENSION_KINDS[number];
export type CadDimensionKind = typeof CAD_DIMENSION_KINDS[number];

export function radialDimensionKind(kind?: CadDimensionKind | null): CadRadialDimensionKind | null {
  return kind === 'radius' || kind === 'diameter' ? kind : null;
}
export interface CadDimensionLink {
  kind: CadDimensionKind;
  sourceIds: string[];
  path?: { vertices: number; closed: boolean };
}
type Endpoints = { start: CadPoint; end: CadPoint; angleSweep?: number };
type DimensionSource = TLShape & {
  props: { endX: number; endY: number; link?: CadDimensionLink | null; radialKind?: CadRadialDimensionKind | null; angleSweep?: number | null; angleReflex?: boolean | null };
};

export function dimensionSources(editor: Editor, ids: TLShapeId[]): TLShape[] {
  return [...editor.getShapeAndDescendantIds(ids)].flatMap(id => {
    const source = editor.getShape(id);
    return source && source.type !== 'group' && source.type !== 'cad-dimension' ? [source] : [];
  });
}

export function makeDimensionLink(sources: TLShape[], kind: CadDimensionKind): CadDimensionLink {
  const sourceIds = sources.map(source => source.id);
  if (kind === 'aligned' && sources.length === 1 && sources[0].type === 'cad-path') {
    const { points, closed } = sources[0].props as { points: CadPoint[]; closed: boolean };
    return { kind, sourceIds, path: { vertices: points.length, closed } };
  }
  return { kind, sourceIds };
}

/** Return analytic local points. An arc's bearing stays in the visible sweep as its angles change. */
export function circularDimensionPoints(source: TLShape): { center: CadPoint; rim: CadPoint } | null {
  if (source.type === 'cad-arc') {
    const { radius, startAngle, endAngle } = source.props as { radius: number; startAngle: number; endAngle: number };
    const sweep = endAngle - startAngle;
    if (!(radius > 0 && sweep > 0 && sweep < 360)) return null;
    const angle = (startAngle + sweep / 2) * Math.PI / 180;
    const rim = { x: radius * Math.cos(angle), y: -radius * Math.sin(angle) };
    return validCadPoint(rim) ? { center: { x: 0, y: 0 }, rim } : null;
  }

  const { geo, w, h, growY, text } = source.props as { geo?: string; w: number; h: number; growY?: number; text?: string };
  if (source.type !== 'cad-ellipse' && !(source.type === 'geo' && geo === 'ellipse' && !text?.trim())) return null;
  const height = h + (growY ?? 0);
  if (!(w > 0 && height > 0 && Math.abs(w - height) < 2e-9)) return null;
  return { center: { x: w / 2, y: height / 2 }, rim: { x: w, y: height / 2 } };
}

function straightPathVertices(shape: TLShape): CadPoint[] {
  const props = shape.props as Record<string, any>;
  if (shape.type === 'cad-path' && !props.closed && Array.isArray(props.points)) return props.points;
  if (shape.type === 'line' && props.spline === 'line') return (Object.values(props.points) as Array<CadPoint & { index: string }>)
    .sort((a, b) => a.index < b.index ? -1 : a.index > b.index ? 1 : 0);
  if (shape.type === 'cad-bezier' && props.contours?.length === 1 && !props.contours[0].closed &&
      props.contours[0].nodes.every(node => !node.inX && !node.inY && !node.outX && !node.outY)) return props.contours[0].nodes;
  return [];
}

export function straightDimensionEdge(editor: Editor, shape: TLShape): CadPoint[] | null {
  const points = straightPathVertices(shape);
  if (points.length !== 2) return null;
  const transform = editor.getShapePageTransform(shape);
  return points.map(p => transform.applyToPoint(p));
}

/** Signed smaller angle between two rays. Page coordinates increase downwards. */
export function angleDimensionAt(vertex: CadPoint, a: CadPoint, b: CadPoint): Endpoints | null {
  if (![vertex, a, b].every(validCadPoint)) return null;
  const ax = a.x - vertex.x, ay = a.y - vertex.y, bx = b.x - vertex.x, by = b.y - vertex.y;
  const aLength = Math.hypot(ax, ay), bLength = Math.hypot(bx, by);
  if (Math.min(aLength, bLength) < 1e-6) return null;
  const angleSweep = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  if (Math.abs(angleSweep) < 1e-8) return null;
  const ratio = Math.min(aLength, bLength) / aLength;
  const end = { x: vertex.x + ax * ratio, y: vertex.y + ay * ratio };
  return validCadPoint(end) && validCadPoint({ x: end.x - vertex.x, y: end.y - vertex.y })
    ? { start: vertex, end, angleSweep } : null;
}

/** Explicit sector choice is idempotent, including after detaching a linked arc. */
export function dimensionAngleSweep(sweep: number | null | undefined, reflex?: boolean | null): number | null {
  if (sweep == null) return null;
  if (reflex == null || Math.abs(Math.abs(sweep) - Math.PI) < 1e-8 || (Math.abs(sweep) > Math.PI) === reflex) return sweep;
  return sweep - Math.sign(sweep) * 2 * Math.PI;
}

export function angularDimensionPoints(editor: Editor, sources: TLShape[]): Endpoints | null {
  if (sources.length === 1) {
    const source = sources[0];
    const transform = editor.getShapePageTransform(source);
    if (source.type === 'cad-arc') {
      const { radius, startAngle, endAngle } = source.props as { radius: number; startAngle: number; endAngle: number };
      const sweep = (endAngle - startAngle) * Math.PI / 180;
      if (!(radius > 0 && sweep >= 1e-8 && sweep < 2 * Math.PI)) return null;
      const angle = startAngle * Math.PI / 180;
      return {
        start: transform.applyToPoint({ x: 0, y: 0 }),
        end: transform.applyToPoint({ x: radius * Math.cos(angle), y: -radius * Math.sin(angle) }),
        angleSweep: -sweep,
      };
    }
    const points = straightPathVertices(source);
    if (points.length !== 3) return null;
    const [a, vertex, b] = points.map(p => transform.applyToPoint(p));
    return angleDimensionAt(vertex, a, b);
  }
  if (sources.length !== 2) return null;
  const first = straightDimensionEdge(editor, sources[0]), second = straightDimensionEdge(editor, sources[1]);
  if (!first || !second) return null;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    if (Math.hypot(first[a].x - second[b].x, first[a].y - second[b].y) <= 1e-7)
      return angleDimensionAt(first[a], first[1 - a], second[1 - b]);
  }
  return null;
}

export function resolveDimensionLink(editor: Editor, link: CadDimensionLink, pageId: string): Endpoints | null {
  const sources: TLShape[] = [];
  for (const id of link.sourceIds) {
    const source = editor.getShape(id as TLShapeId);
    if (!source || source.type === 'group' || source.type === 'cad-dimension' || editor.getAncestorPageId(source) !== pageId)
      return null;
    sources.push(source);
  }
  let start: CadPoint, end: CadPoint, angleSweep: number | undefined;
  const radial = radialDimensionKind(link.kind);
  if (link.kind === 'angular') {
    const points = !link.path && angularDimensionPoints(editor, sources);
    if (!points) return null;
    ({ start, end, angleSweep } = points);
  } else if (radial) {
    if (sources.length !== 1 || link.path) return null;
    const points = circularDimensionPoints(sources[0]);
    if (!points) return null;
    const { center, rim } = points;
    const other = radial === 'diameter' ? { x: 2 * center.x - rim.x, y: 2 * center.y - rim.y } : center;
    const transform = editor.getShapePageTransform(sources[0]);
    start = transform.applyToPoint(other);
    end = transform.applyToPoint(rim);
  } else if (link.path) {
    const source = sources[0];
    if (link.kind !== 'aligned' || sources.length !== 1 || source.type !== 'cad-path') return null;
    const { points, closed } = source.props as { points: CadPoint[]; closed: boolean };
    if (points.length !== link.path.vertices || closed !== link.path.closed) return null;
    const transform = editor.getShapePageTransform(source);
    start = transform.applyToPoint(points[0]);
    end = transform.applyToPoint(points[points.length - 1]);
  } else {
    const bounds = sources.map(source => getCadShapePageBounds(editor, source));
    if (!bounds.length || bounds.some(bound => !bound)) return null;
    const box = Box.Common(bounds as Box[]);
    start = { x: box.minX, y: box.maxY };
    end = { x: link.kind === 'vertical' ? box.minX : box.maxX, y: link.kind === 'horizontal' ? box.maxY : box.minY };
  }
  if (!validCadPoint(start) || !validCadPoint(end) ||
      !validCadPoint({ x: end.x - start.x, y: end.y - start.y }) ||
      Math.hypot(end.x - start.x, end.y - start.y) < 1e-8) return null;
  return { start, end, ...(angleSweep === undefined ? {} : { angleSweep }) };
}

export function getDimensionEndpoints(editor: Editor, shape: DimensionSource) {
  const { endX, endY, link } = shape.props;
  const radialKind = link ? radialDimensionKind(link.kind) : shape.props.radialKind ?? null;
  const fallback = { start: { x: 0, y: 0 }, end: { x: endX, y: endY }, radialKind, angleSweep: dimensionAngleSweep(shape.props.angleSweep, shape.props.angleReflex) };
  if (!link) return { ...fallback, status: 'free' as const };
  const pageId = editor.getAncestorPageId(shape);
  const points = pageId && resolveDimensionLink(editor, link, pageId);
  if (!points) return { ...fallback, status: 'broken' as const };
  return { start: editor.getPointInShapeSpace(shape, points.start), end: editor.getPointInShapeSpace(shape, points.end), radialKind, angleSweep: dimensionAngleSweep(points.angleSweep, shape.props.angleReflex), status: 'linked' as const };
}

export type { DimensionSource };
