import type { Editor } from '@tldraw/tldraw';
import { bernsteinRoots } from './cad-bernstein-roots';
import { contourSegments, cubicAt, nodeAt, splitCubic, validContours, type CadContour, type CadNodeMode } from './cad-curves';
import { cadSelectedShapes, convertedCurvePaint, shapeCadContours } from './cad-editing';
import { CadOperationError, makeCadPlan, type CadPlan } from './cad-plans';
import { validCadPoint, type CadPoint, type CadSettings } from './cad-settings';
import { cadPaintHasFill } from './cad-shape-appearance';
import { sourceCurveResult } from './cad-source-result';
import { drawingObjectName } from './drawing-operations';

type Cut = { segment: number; t: number; point: CadPoint; side: number };
type Span = { points: CadPoint[]; mode: CadNodeMode };
type Run = { start: Cut; end: Cut; spans: Span[] };
type FillRule = 'evenodd' | 'nonzero';
export interface CadKnifePlan extends CadPlan { cutPoints: CadPoint[] }

function piece(spans: Span[], closed: boolean, epsilon: number): CadContour {
  const nodes = spans.map(({ points: [a, b], mode }, i) => {
    const incoming = spans[i - 1]?.points[2] ?? a;
    const node = { ...nodeAt(a), inX: incoming.x - a.x, inY: incoming.y - a.y, outX: b.x - a.x, outY: b.y - a.y };
    // Subdivision can shorten one handle at a symmetric anchor. Keep its
    // direction without promising equal lengths on later node edits.
    node.mode = i === 0 ? 'corner' : mode === 'symmetric' &&
      Math.hypot(node.inX + node.outX, node.inY + node.outY) > epsilon ? 'smooth' : mode;
    return node;
  });
  const [,, c, d] = spans[spans.length - 1].points;
  nodes.push({ ...nodeAt(d), inX: c.x - d.x, inY: c.y - d.y });
  // Unused handles at the endpoints are zero. Closing makes one straight seam.
  return { nodes, closed };
}

function bladeFrame(controls: CadPoint[][], a: CadPoint, b: CadPoint) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const extent = controls.reduce((max, points) => points.reduce(
    (size, p) => Math.max(size, Math.abs(p.x), Math.abs(p.y), Math.abs(p.x - a.x), Math.abs(p.y - a.y)), max
  ), Math.max(1, length));
  const epsilon = extent * 64 * Number.EPSILON;
  if (length <= epsilon) throw new CadOperationError('knife-blade');
  const ux = dx / length, uy = dy / length;
  const distance = (p: CadPoint) => (p.x - a.x) * uy - (p.y - a.y) * ux;
  const along = (p: CadPoint) => (p.x - a.x) * ux + (p.y - a.y) * uy;
  const inside = (p: CadPoint) => along(p) >= -epsilon && along(p) <= length + epsilon;
  return { epsilon, distance, along, inside };
}

function traceContour(contour: CadContour, controls: CadPoint[][], blade: ReturnType<typeof bladeFrame>) {
  const { distance, epsilon, inside } = blade;
  const trace = controls.map(points => {
    const values = points.map(distance);
    if (values.every(d => Math.abs(d) <= epsilon)) throw new CadOperationError('knife-overlap');
    const roots = [0, ...bernsteinRoots(values, epsilon).filter(t => t > 0 && t < 1), 1];
    const sides = roots.slice(1).map((end, i) => {
      const d = distance(cubicAt(points, (roots[i] + end) / 2));
      if (Math.abs(d) <= epsilon) throw new CadOperationError('knife-overlap');
      return Math.sign(d);
    });
    return { roots, sides };
  });

  const crossings: Cut[] = [];
  let touched = false;
  function contact(segment: number, t: number, point: CadPoint, before: number, after: number) {
    if (before !== after) crossings.push({ segment, t, point, side: after });
    else if (inside(point)) touched = true;
  }
  trace.forEach(({ roots, sides }, i) => {
    const points = controls[i], previous = i > 0 ? trace[i - 1] : contour.closed ? trace.at(-1) : undefined;
    if (previous && Math.abs(distance(points[0])) <= epsilon)
      contact(i, 0, points[0], previous.sides.at(-1)!, sides[0]);
    for (let j = 1; j < roots.length - 1; j++)
      contact(i, roots[j], cubicAt(points, roots[j]), sides[j - 1], sides[j]);
  });
  return { contour, controls, crossings, touched, firstSide: trace[0].sides[0] };
}

function subdivide(contour: CadContour, controls: CadPoint[][], cuts: Cut[]) {
  const spans: Span[] = [], starts: number[] = [];
  let cutIndex = 0;
  for (const [segment, source] of controls.entries()) {
    let remaining: CadPoint[] = source;
    let previous = 0, beginsPiece = false;
    const straight = source[0].x === source[1].x && source[0].y === source[1].y &&
      source[2].x === source[3].x && source[2].y === source[3].y;
    function append(points: CadPoint[]) {
      if (beginsPiece) starts.push(spans.length);
      spans.push({
        points: straight ? [points[0], points[0], points[3], points[3]] : points,
        mode: previous === 0 ? contour.nodes[segment].mode : 'corner',
      });
    }
    while (cuts[cutIndex]?.segment === segment) {
      const cut = cuts[cutIndex++];
      const { t } = cut;
      if (t > 0) {
        const [left, right] = splitCubic(remaining, (t - previous) / (1 - previous));
        append(left);
        remaining = right;
      }
      // Neighboring runs and the straight seam must use the same anchor even
      // when split parameters are evaluated in successive cubic subintervals.
      cut.point = remaining[0];
      previous = t;
      beginsPiece = true;
    }
    append(remaining);
  }
  return { spans, starts };
}

function straightSeam(a: CadPoint, b: CadPoint): Span {
  return { points: [a, a, b, b], mode: 'corner' };
}

/** Every crossing has one curve run per side and one shared seam. Walking this
 * graph closes the filled intervals without drawing over a cutout. */
function stitchSide(runs: Run[], mates: Map<Cut, Cut>, fillRule: FillRule, epsilon: number): CadContour[] {
  const byCut = new Map<Cut, Run>();
  for (const run of runs) {
    byCut.set(run.start, run);
    byCut.set(run.end, run);
  }
  const contours: CadContour[] = [];
  for (const { start } of runs) {
    if (!byCut.has(start)) continue;
    const spans: Span[] = [];
    let current = start;
    do {
      const run = byCut.get(current);
      if (!run) throw new CadOperationError('knife-closed');
      byCut.delete(run.start);
      byCut.delete(run.end);
      const forward = run.start === current;
      if (!forward && fillRule === 'nonzero') throw new CadOperationError('knife-winding');
      const end = forward ? run.end : run.start;
      if (forward) {
        spans.push(...run.spans);
      } else {
        for (let i = run.spans.length - 1; i >= 0; i--)
          spans.push({ points: [...run.spans[i].points].reverse(), mode: run.spans[i + 1]?.mode ?? 'corner' });
      }
      current = mates.get(end)!;
      if (current !== start) spans.push(straightSeam(end.point, current.point));
    } while (current !== start);
    contours.push(piece(spans, true, epsilon));
  }
  return contours;
}

/** Split at transverse cubic roots. A closed result has one compound per
 * side, joined only across occupied intervals on the blade. */
export function cutCadContours(contours: CadContour[], a: CadPoint, b: CadPoint, fillRule: FillRule) {
  if (!validContours(contours) || !validCadPoint(a) || !validCadPoint(b)) throw new CadOperationError('geometry');
  const closed = contours[0].closed;
  if (!contours.every(contour => contour.closed === closed) || !closed && contours.length !== 1)
    throw new CadOperationError('knife-target');
  const controls = contours.map(contour => [...contourSegments(contour)]);
  const blade = bladeFrame(controls.flat(), a, b);
  const { epsilon, along, inside } = blade;
  const traces = contours.map((contour, i) => traceContour(contour, controls[i], blade));
  const cuts = traces.flatMap(trace => trace.crossings.filter(cut => inside(cut.point)));
  if (!cuts.length) throw new CadOperationError('knife-miss');
  const cutPoints = () => cuts.map(({ point: { x, y } }) => ({ x, y }));

  if (!closed) {
    const { spans, starts } = subdivide(contours[0], controls[0], cuts);
    const pieces = [0, ...starts].map((start, i) => piece(spans.slice(start, starts[i] ?? spans.length), false, epsilon));
    if (!validContours(pieces)) throw new CadOperationError('limit');
    return { pieces: pieces.map(contour => [contour]), cutPoints: cutPoints() };
  }

  if (traces.some(({ crossings, touched }) => touched || crossings.length % 2 || crossings.some(cut => !inside(cut.point))))
    throw new CadOperationError('knife-closed');
  const sorted = cuts.map(cut => ({ cut, position: along(cut.point) })).sort((p, q) => p.position - q.position);
  if (sorted.some(({ position }, i) => i > 0 && position - sorted[i - 1].position <= epsilon))
    throw new CadOperationError('knife-closed');
  const mates = new Map<Cut, Cut>();
  // Both even-odd and alternating nonzero boundaries occupy pairs of intervals.
  // A same-winding nested boundary can carry its own stroke but leave the fill
  // nonzero on both sides, so a cutting seam would be ambiguous there.
  for (let i = 0; i < sorted.length; i += 2) {
    const left = sorted[i].cut, right = sorted[i + 1].cut;
    if (fillRule === 'nonzero' && left.side === right.side) throw new CadOperationError('knife-winding');
    mates.set(left, right);
    mates.set(right, left);
  }
  const positive = { runs: [] as Run[], contours: [] as CadContour[] };
  const negative = { runs: [] as Run[], contours: [] as CadContour[] };
  for (const { contour, controls, crossings, firstSide } of traces) {
    if (!crossings.length) {
      (firstSide > 0 ? positive : negative).contours.push(contour);
      continue;
    }
    const { spans, starts } = subdivide(contour, controls, crossings);
    for (const [i, start] of crossings.entries()) {
      const end = crossings[(i + 1) % crossings.length];
      const runSpans = i + 1 < starts.length ? spans.slice(starts[i], starts[i + 1])
        : [...spans.slice(starts[i]), ...spans.slice(0, starts[0])];
      (start.side > 0 ? positive : negative).runs.push({ start, end, spans: runSpans });
    }
  }
  const pieces = [positive, negative].map(side => [...stitchSide(side.runs, mates, fillRule, epsilon), ...side.contours]);
  if (!validContours(pieces.flat())) throw new CadOperationError('limit');
  return { pieces, cutPoints: cutPoints() };
}

export function cutCadContour(contour: CadContour, a: CadPoint, b: CadPoint) {
  const { pieces, cutPoints } = cutCadContours([contour], a, b, 'evenodd');
  return { pieces: pieces.flat(), cutPoints };
}

export function prepareCadKnife(editor: Editor, settings: CadSettings, swap: boolean, consumeBlade: boolean): CadKnifePlan {
  const selected = editor.getSelectedShapeIds();
  if (selected.length !== 2) throw new CadOperationError('knife-selection');
  const shapes = cadSelectedShapes(editor, true);
  if (shapes.length !== 2 || selected.some(id => !shapes.some(shape => shape.id === id))) throw new CadOperationError('knife-selection');
  const target = shapes.find(shape => shape.id === selected[swap ? 1 : 0])!;
  const blade = shapes.find(shape => shape.id === selected[swap ? 0 : 1])!;
  if (blade.parentId !== target.parentId) throw new CadOperationError('mixed-parents');
  if (editor.getBindingsInvolvingShape(target.id).length ||
      consumeBlade && editor.getBindingsInvolvingShape(blade.id).length) throw new CadOperationError('bound');
  const bladeContours = ['cad-path', 'line', 'cad-bezier'].includes(blade.type) ? shapeCadContours(editor, blade) : [];
  const edge = bladeContours[0];
  if (bladeContours.length !== 1 || edge.closed || edge.nodes.length !== 2 ||
      edge.nodes[0].outX || edge.nodes[0].outY || edge.nodes[1].inX || edge.nodes[1].inY)
    throw new CadOperationError('knife-blade');
  if (!['cad-bezier', 'cad-path', 'line'].includes(target.type)) throw new CadOperationError('knife-target');
  const contours = shapeCadContours(editor, target);
  const paint = convertedCurvePaint(editor, target);
  if (contours.length === 1 && !contours[0].closed && cadPaintHasFill(paint)) throw new CadOperationError('knife-fill');
  const name = drawingObjectName(target);
  const fillRule = (target.props as { fillRule?: FillRule }).fillRule ?? 'evenodd';
  const { pieces, cutPoints } = cutCadContours(contours, edge.nodes[0], edge.nodes[1], fillRule);
  const result = pieces.map((piece, index) => {
    const shape = sourceCurveResult(editor, target, piece, fillRule, paint);
    return { ...shape, meta: { ...shape.meta, omsObjectName: `${name} (${index + 1})` } };
  });
  const warnings: string[] = [];
  if (contours[0].closed) warnings.push('knife-shared-edge');
  if (paint.dash.length) warnings.push('knife-dash');
  return {
    ...makeCadPlan(editor, settings, pieces.flat(), {
      name, fillRule, sourceIds: [target.id, blade.id],
      removeIds: consumeBlade ? [target.id, blade.id] : [target.id], shapes: result,
      warnings,
    }),
    cutPoints,
  };
}
