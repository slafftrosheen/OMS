import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { getCadShapePageBounds } from './cad-bounds';
import { validCadPoint, type CadPoint } from './cad-settings';

export const CAD_DIMENSION_SOURCE_LIMIT = 256;
export type CadDimensionKind = 'horizontal' | 'vertical' | 'aligned';
export interface CadDimensionLink {
  kind: CadDimensionKind;
  sourceIds: string[];
  path?: { vertices: number; closed: boolean };
}
type Endpoints = { start: CadPoint; end: CadPoint };
type DimensionSource = TLShape & {
  props: { endX: number; endY: number; link?: CadDimensionLink | null };
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

export function resolveDimensionLink(editor: Editor, link: CadDimensionLink, pageId: string): Endpoints | null {
  const sources: TLShape[] = [];
  for (const id of link.sourceIds) {
    const source = editor.getShape(id as TLShapeId);
    if (!source || source.type === 'group' || source.type === 'cad-dimension' || editor.getAncestorPageId(source) !== pageId)
      return null;
    sources.push(source);
  }
  let start: CadPoint, end: CadPoint;
  if (link.path) {
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
  return { start, end };
}

export function getDimensionEndpoints(editor: Editor, shape: DimensionSource): Endpoints & { status: 'free' | 'linked' | 'broken' } {
  const { endX, endY, link } = shape.props;
  const fallback = { start: { x: 0, y: 0 }, end: { x: endX, y: endY } };
  if (!link) return { ...fallback, status: 'free' };
  const pageId = editor.getAncestorPageId(shape);
  const points = pageId && resolveDimensionLink(editor, link, pageId);
  if (!points) return { ...fallback, status: 'broken' };
  return { start: editor.getPointInShapeSpace(shape, points.start), end: editor.getPointInShapeSpace(shape, points.end), status: 'linked' };
}

export type { DimensionSource };
