import ClipperLib from 'clipper-lib';
import type { Editor } from '@tldraw/tldraw';
import { cadMmPerPixel, unitMm, type CadSettings } from './cad-settings';
import { flattenContours, nodeAt, type CadContour } from './cad-curves';
import { cadSelectedShapes, shapeCadContours } from './cad-editing';
import { makeCadPlan, CadOperationError, type CadPlan } from './cad-plans';

export interface CadShapingOptions {
  operation: 'weld' | 'trim' | 'intersect' | 'offset';
  toleranceMm: number;
  offset: number;
  join: 'round' | 'miter' | 'square';
  keepSources: boolean;
  targetId?: string;
}
const SCALE = 10000;
type Polygon = Array<{ X: number; Y: number }>;
function clip(a: Polygon[], b: Polygon[], operation: number, evenOdd = false): Polygon[] {
  const engine = new ClipperLib.Clipper();
  engine.StrictlySimple = true;
  engine.AddPaths(a, ClipperLib.PolyType.ptSubject, true);
  if (b.length) engine.AddPaths(b, ClipperLib.PolyType.ptClip, true);
  const result: Polygon[] = [],
    fill = evenOdd ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero;
  if (!engine.Execute(operation, result, fill, fill)) throw new CadOperationError('geometry');
  return result;
}
export function prepareCadShaping(editor: Editor, settings: CadSettings, options: CadShapingOptions): CadPlan {
  const shapes = cadSelectedShapes(editor),
    factor = cadMmPerPixel(settings),
    tolerance = options.toleranceMm;
  if (
    !['weld', 'trim', 'intersect', 'offset'].includes(options.operation) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0.001 ||
    tolerance > 1 ||
    !['round', 'miter', 'square'].includes(options.join)
  )
    throw new CadOperationError('geometry');
  if (options.operation !== 'offset' && shapes.length < 2) throw new CadOperationError('selection');
  let vertices = 0;
  const polygons = shapes.map((shape) => {
    const curves = shapeCadContours(editor, shape, tolerance / factor / 8);
    if (curves.some((c) => !c.closed)) throw new CadOperationError('open');
    const flattened = flattenContours(curves, tolerance / factor / 2);
    const paths = flattened.map((points) =>
      points.map((p) => {
        if (++vertices > 50000) throw new CadOperationError('limit');
        const X = Math.round((p.x - settings.originX) * factor * SCALE),
          Y = Math.round((settings.originY - p.y) * factor * SCALE);
        if (![X, Y].every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 1e12))
          throw new CadOperationError('geometry');
        return { X, Y };
      })
    );
    // Font outlines retain winding-based holes and overlapping glyphs. Other compounds
    // use even-odd holes. Combine the normalized separate solids with non-zero.
    return clip(paths, [], ClipperLib.ClipType.ctUnion, (shape.props as { fillRule?: string }).fillRule !== 'nonzero');
  });
  let result: Polygon[];
  if (options.operation === 'trim') {
    const target = shapes.findIndex((s) => s.id === options.targetId);
    if (target < 0) throw new CadOperationError('selection');
    const cutters = clip(polygons.filter((_, i) => i !== target).flat(), [], ClipperLib.ClipType.ctUnion);
    result = clip(polygons[target], cutters, ClipperLib.ClipType.ctDifference);
  } else if (options.operation === 'intersect')
    result = polygons
      .slice(1)
      .reduce((a, b) => (a.length ? clip(a, b, ClipperLib.ClipType.ctIntersection) : []), polygons[0]);
  else result = clip(polygons.flat(), [], ClipperLib.ClipType.ctUnion);
  if (options.operation === 'offset') {
    const distance = options.offset * unitMm(settings.unit);
    if (!Number.isFinite(distance) || !distance || Math.abs(distance) > 100000) throw new CadOperationError('geometry');
    const offset = new ClipperLib.ClipperOffset(2, (tolerance * SCALE) / 4);
    offset.AddPaths(
      result,
      { round: ClipperLib.JoinType.jtRound, miter: ClipperLib.JoinType.jtMiter, square: ClipperLib.JoinType.jtSquare }[
        options.join
      ],
      ClipperLib.EndType.etClosedPolygon
    );
    result = [];
    offset.Execute(result, distance * SCALE);
  }
  if (!result.length) throw new CadOperationError('empty');
  const contours: CadContour[] = result.map((path) => ({
    closed: true,
    nodes: path.map((p) =>
      nodeAt({ x: settings.originX + p.X / SCALE / factor, y: settings.originY - p.Y / SCALE / factor })
    )
  }));
  const ids = shapes.map((s) => s.id);
  return makeCadPlan(editor, settings, contours, {
    sourceIds: ids,
    removeIds: options.keepSources ? [] : ids,
    name: `CAD ${options.operation}`,
    warnings: ['curves-approximated', ...(options.keepSources ? ['sources-overlap'] : [])]
  });
}
