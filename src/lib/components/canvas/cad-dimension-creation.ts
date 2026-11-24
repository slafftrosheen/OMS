import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { CAD_MAX_COORDINATE, validCadPoint } from './cad-settings';
import type { CadDimensionShape } from './shapes/CadShapes';

export type DimensionCreationGeometry = Pick<CadDimensionShape, 'type' | 'x' | 'y'> & {
  props: Omit<CadDimensionShape['props'], 'color'> & Partial<Pick<CadDimensionShape['props'], 'color'>>;
};
export type DimensionCreationRequest = DimensionCreationGeometry & { id: TLShapeId; parentId: CadDimensionShape['parentId'] };

/** Preflight the complete annotation, including measured label bounds. The
 * candidate is deliberately free: a new id is not in native geometry caches. */
export function dimensionCreationInsideLimits(editor: Editor, geometry: DimensionCreationGeometry): boolean {
  if (!validCadPoint(geometry) || !validCadPoint({ x: geometry.props.endX, y: geometry.props.endY })) return false;
  const scale = geometry.props.decorationScale;
  if (!Number.isFinite(scale) || scale <= 0 || scale > CAD_MAX_COORDINATE ||
      !Number.isFinite(geometry.props.offset) || Math.abs(geometry.props.offset) > CAD_MAX_COORDINATE) return false;
  try {
    const candidate = { ...geometry, id: 'shape:dimension-candidate', typeName: 'shape', parentId: editor.getCurrentPageId(),
      rotation: 0, index: 'a1', isLocked: false, opacity: 1, meta: {},
      props: { color: 'blue', ...geometry.props, link: null } } as CadDimensionShape;
    const bounds = editor.getShapeUtil(candidate).getGeometry(candidate).bounds;
    return [bounds.minX + candidate.x, bounds.maxX + candidate.x,
      bounds.minY + candidate.y, bounds.maxY + candidate.y]
      .every(value => Number.isFinite(value) && Math.abs(value) <= CAD_MAX_COORDINATE);
  } catch { return false; }
}

/** Creation is successful only if the requested record and its complete world
 * bounds survived schema hooks, source resolution and parent placement. */
export function dimensionCreationMatches(editor: Editor, expected: DimensionCreationRequest): boolean {
  const actual = editor.getShape<CadDimensionShape>(expected.id);
  if (!actual || actual.type !== 'cad-dimension' || actual.parentId !== expected.parentId || actual.rotation !== 0 ||
      actual.x !== expected.x || actual.y !== expected.y ||
      Object.entries(expected.props).some(([key, value]) => JSON.stringify(actual.props[key]) !== JSON.stringify(value))) return false;
  try {
    const bounds = editor.getShapePageBounds(actual);
    return !!bounds && [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]
      .every(value => Number.isFinite(value) && Math.abs(value) <= CAD_MAX_COORDINATE);
  } catch { return false; }
}
