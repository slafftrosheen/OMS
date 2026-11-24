import ClipperLib from 'clipper-lib';
import type { Editor, TLShape } from '@tldraw/tldraw';
import { cadMmPerPixel, unitMm, type CadSettings } from './cad-settings';
import { CAD_FLATTEN_LIMIT, flattenContours } from './cad-curves';
import { restoreShapingCurves, shapingSpan, type Polygon, type PolygonPoint } from './cad-shaping-curves';
import { cadSelectedShapes, shapeCadContours } from './cad-editing';
import { assertCadMergeContext, cadReferencePaintWarnings, sourceCurveResult } from './cad-source-result';
import { makeCadPlan, CadOperationError, type CadPlan } from './cad-plans';
import { offsetOpenPolyline } from './cad-open-offset';
import { prepareMidline, type MidlineMatching, type MidlinePairing } from './cad-midline';
import type { CadArcShape } from './shapes/CadShapes';

export interface CadShapingOptions {
  operation: 'weld' | 'trim' | 'intersect' | 'offset' | 'midline';
  toleranceMm: number;
  offset: number;
  join: 'round' | 'miter' | 'square';
  keepSources: boolean;
  targetId?: string;
  midlinePairing?: MidlinePairing;
  midlineMatching?: MidlineMatching;
}
const SCALE = 10000;

function offsetArc(editor: Editor, source: TLShape, distance: number, tolerance: number) {
  const arc = source as CadArcShape;
  const sweep = arc.props.endAngle - arc.props.startAngle;
  if (!(sweep > 0 && sweep < 360) || !(arc.props.radius > 0)) throw new CadOperationError('offset-open');
  // Positive sweep is counterclockwise in CAD coordinates, so left is inward.
  const radius = arc.props.radius - distance;
  if (radius <= 1e-8) throw new CadOperationError('offset-collapse');
  const props = { ...arc.props, radius };
  const contours = shapeCadContours(editor, { ...arc, props }, tolerance);
  const shape = {
    type: 'cad-arc' as const, aboveSourceId: arc.id,
    x: arc.x, y: arc.y, rotation: arc.rotation, opacity: arc.opacity, props, meta: arc.meta
  };
  return { contours, shape };
}

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
    !['weld', 'trim', 'intersect', 'offset', 'midline'].includes(options.operation) ||
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
  const sourceCurves = shapes.map(shape => shapeCadContours(editor, shape, tolerance / factor / 8));
  const hasOpen = sourceCurves.some(curves => curves.some(curve => !curve.closed));
  const distanceMm = options.offset * unitMm(settings.unit);
  if (options.operation === 'offset' && (!Number.isFinite(distanceMm) || !distanceMm || Math.abs(distanceMm) > 100_000))
    throw new CadOperationError('geometry');
  const ids = shapes.map(shape => shape.id);
  const removeIds = options.keepSources ? [] : ids;
  if (options.operation === 'midline') {
    if (shapes.length !== 2 || sourceCurves.some(curves => curves.length !== 1))
      throw new CadOperationError('midline-pair');
    const { contour, sampled, fitted } = prepareMidline(sourceCurves[0][0], sourceCurves[1][0], tolerance / factor,
      { pairing: options.midlinePairing, matching: options.midlineMatching });
    return makeCadPlan(editor, settings, [contour], {
      sourceIds: ids, removeIds, name: 'CAD midline',
      shapes: [sourceCurveResult(editor, reference, [contour], 'nonzero')],
      warnings: [...(sampled ? [fitted ? 'midline-fitted' : 'midline-sampled'] : []), ...cadReferencePaintWarnings(editor, shapes, reference)]
    });
  }
  if (options.operation === 'offset' && hasOpen) {
    const offsetPolyline = (curves: typeof sourceCurves[number]) =>
      curves.map(contour => offsetOpenPolyline(contour, distanceMm / factor, options.join, tolerance / factor));
    if (shapes.some(shape => shape.type === 'cad-arc')) {
      const results = shapes.map((source, i) => {
        if (source.type === 'cad-arc') return offsetArc(editor, source, distanceMm / factor, tolerance / factor / 8);
        const contours = offsetPolyline(sourceCurves[i]);
        return { contours, shape: sourceCurveResult(editor, source, contours, 'nonzero') };
      });
      return makeCadPlan(editor, settings, results.flatMap(result => result.contours), {
        sourceIds: ids, removeIds, name: 'CAD offset', shapes: results.map(result => result.shape)
      });
    }
    const contours = sourceCurves.flatMap(offsetPolyline);
    return makeCadPlan(editor, settings, contours, {
      sourceIds: ids, removeIds, name: 'CAD offset',
      shapes: [sourceCurveResult(editor, reference, contours, 'nonzero')],
      warnings: cadReferencePaintWarnings(editor, shapes, reference)
    });
  }
  if (hasOpen) throw new CadOperationError('open');
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
  const polygons = shapes.map((shape, i) => {
    const curves = sourceCurves[i];
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
    const offset = new ClipperLib.ClipperOffset(2, (tolerance * SCALE) / 4);
    offset.AddPaths(
      result,
      { round: ClipperLib.JoinType.jtRound, miter: ClipperLib.JoinType.jtMiter, square: ClipperLib.JoinType.jtSquare }[
        options.join
      ],
      ClipperLib.EndType.etClosedPolygon
    );
    result = [];
    offset.Execute(result, distanceMm * SCALE);
  }
  if (!result.length) throw new CadOperationError('empty');
  const { contours, restored } = restoreShapingCurves(result, spans, tolerance * SCALE + 2, toPage);
  return makeCadPlan(editor, settings, contours, {
    sourceIds: ids,
    removeIds,
    name: `CAD ${options.operation}`,
    fillRule: 'nonzero',
    shapes: [sourceCurveResult(editor, reference, contours, 'nonzero')],
    warnings: ['curves-approximated', ...(restored ? ['curves-retained'] : []), ...cadReferencePaintWarnings(editor, shapes, reference),
      ...(options.keepSources ? ['sources-overlap'] : [])]
  });
}
