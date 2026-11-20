import ClipperLib from 'clipper-lib';
import type { Editor } from '@tldraw/tldraw';
import { cadMmPerPixel, unitMm, type CadSettings } from './cad-settings';
import { CAD_FLATTEN_LIMIT, flattenContours } from './cad-curves';
import { restoreShapingCurves, shapingSpan, type Polygon, type PolygonPoint } from './cad-shaping-curves';
import { cadSelectedShapes, shapeCadContours } from './cad-editing';
import { assertCadMergeContext, cadReferencePaintWarnings, sourceCurveResult } from './cad-source-result';
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
  const shapes = cadSelectedShapes(editor, true),
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
  const target = options.operation === 'trim' ? shapes.findIndex(s => s.id === options.targetId) : shapes.length - 1;
  if (target < 0) throw new CadOperationError('selection');
  const reference = shapes[target];
  assertCadMergeContext(shapes, reference);
  let vertices = 0;
  const spans: ReturnType<typeof shapingSpan>[] = [];
  const toClip = (point: { x: number; y: number }) => ({
    x: (point.x - settings.originX) * factor * SCALE,
    y: (settings.originY - point.y) * factor * SCALE
  });
  const toPage = (point: PolygonPoint) => ({
    x: settings.originX + point.X / SCALE / factor,
    y: settings.originY - point.Y / SCALE / factor
  });
  const polygons = shapes.map((shape) => {
    const curves = shapeCadContours(editor, shape, tolerance / factor / 8);
    if (curves.some((c) => !c.closed)) throw new CadOperationError('open');
    const ranges: Array<Array<{ index: number; first: number; last: number }>> = curves.map(() => []);
    const flattened = flattenContours(curves, tolerance / factor / 2, CAD_FLATTEN_LIMIT,
      options.operation === 'offset' ? undefined : (contour, index, first, last) => ranges[contour].push({ index, first, last }));
    const paths = flattened.map((points) =>
      points.map((p) => {
        if (++vertices > CAD_FLATTEN_LIMIT) throw new CadOperationError('limit');
        const point = toClip(p), X = Math.round(point.x), Y = Math.round(point.y);
        if (![X, Y].every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 1e12))
          throw new CadOperationError('geometry');
        return { X, Y };
      })
    );
    paths.forEach((path, ci) => {
      for (const { index, first, last } of ranges[ci]) {
        const samples = path.slice(first, last + 1);
        // flattenContours omits the final duplicate anchor of a closed ring.
        if (last === path.length) samples.push(path[0]);
        spans.push(shapingSpan(curves[ci], index, samples, toClip));
      }
    });
    // Font outlines retain winding-based holes and overlapping glyphs. Other compounds
    // use even-odd holes. Combine the normalized separate solids with non-zero.
    return clip(paths, [], ClipperLib.ClipType.ctUnion, (shape.props as { fillRule?: string }).fillRule !== 'nonzero');
  });
  let result: Polygon[];
  if (options.operation === 'trim') {
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
  const { contours, restored } = restoreShapingCurves(result, spans, tolerance * SCALE + 2, toPage);
  const ids = shapes.map((s) => s.id);
  return makeCadPlan(editor, settings, contours, {
    sourceIds: ids,
    removeIds: options.keepSources ? [] : ids,
    name: `CAD ${options.operation}`,
    fillRule: 'nonzero',
    shapes: [sourceCurveResult(editor, reference, contours, 'nonzero')],
    warnings: ['curves-approximated', ...(restored ? ['curves-retained'] : []), ...cadReferencePaintWarnings(editor, shapes, reference),
      ...(options.keepSources ? ['sources-overlap'] : [])]
  });
}
