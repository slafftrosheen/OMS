import ClipperLib from 'clipper-lib';
import type { Editor } from '@tldraw/tldraw';
import { cadMmPerPixel, unitMm, type CadSettings } from './cad-settings';
import { CAD_FLATTEN_LIMIT, flattenContours, mix, type CadContour } from './cad-curves';
import { restoreShapingCurves, shapingSpan, type Polygon, type PolygonPoint } from './cad-shaping-curves';
import { cadSelectedShapes, shapeCadContours } from './cad-editing';
import { assertCadMergeContext, cadReferencePaintWarnings, sourceCurveResult } from './cad-source-result';
import { makeCadPlan, CadOperationError, type CadPlan } from './cad-plans';
import { offsetOpenPolyline } from './cad-open-offset';

export interface CadShapingOptions {
  operation: 'weld' | 'trim' | 'intersect' | 'offset' | 'midline';
  toleranceMm: number;
  offset: number;
  join: 'round' | 'miter' | 'square';
  keepSources: boolean;
  targetId?: string;
}
const SCALE = 10000;

function middleContour(a: CadContour, b: CadContour): CadContour {
  if (a.closed || b.closed || a.nodes.length !== b.nodes.length) throw new CadOperationError('midline-pair');
  const distance = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x - b.x, a.y - b.y);
  const first = a.nodes[0], last = a.nodes.at(-1)!, from = b.nodes[0], to = b.nodes.at(-1)!;
  const paired = distance(first, from) + distance(last, to) <= distance(first, to) + distance(last, from)
    ? b.nodes : [...b.nodes].reverse().map(n => ({ ...n, inX: n.outX, inY: n.outY, outX: n.inX, outY: n.inY }));
  const nodes = a.nodes.map((node, i) => ({
    ...mix(node, paired[i], 0.5),
    inX: (node.inX + paired[i].inX) / 2, inY: (node.inY + paired[i].inY) / 2,
    outX: (node.outX + paired[i].outX) / 2, outY: (node.outY + paired[i].outY) / 2,
    mode: 'corner' as const
  }));
  if (nodes.some((node, i) => i > 0 && distance(node, nodes[i - 1]) < 1e-8))
    throw new CadOperationError('midline-pair');
  return { closed: false, nodes };
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
  if (options.operation === 'midline' || options.operation === 'offset' && hasOpen) {
    if (options.operation === 'midline' && (shapes.length !== 2 || sourceCurves.some(curves => curves.length !== 1)))
      throw new CadOperationError('midline-pair');
    const contours = options.operation === 'midline'
      ? [middleContour(sourceCurves[0][0], sourceCurves[1][0])]
      : sourceCurves.flat().map(contour => offsetOpenPolyline(contour, distanceMm / factor, options.join, tolerance / factor));
    const ids = shapes.map(shape => shape.id);
    return makeCadPlan(editor, settings, contours, {
      sourceIds: ids,
      removeIds: options.keepSources ? [] : ids,
      name: options.operation === 'midline' ? 'CAD midline' : 'CAD offset',
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
