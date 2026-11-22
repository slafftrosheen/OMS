import type { Editor } from '@tldraw/tldraw';
import { bernsteinRoots } from './cad-bernstein-roots';
import { contourSegments, cubicAt, nodeAt, splitCubic, validContours, type CadContour, type CadNodeMode } from './cad-curves';
import { cadSelectedShapes, convertedCurvePaint, shapeCadContours } from './cad-editing';
import { CadOperationError, makeCadPlan, type CadPlan } from './cad-plans';
import { validCadPoint, type CadPoint, type CadSettings } from './cad-settings';
import { cadPaintHasFill } from './cad-shape-appearance';
import { sourceCurveResult } from './cad-source-result';
import { drawingObjectName } from './drawing-operations';

type Cut = { segment: number; t: number; point: CadPoint };
type Span = { points: CadPoint[]; mode: CadNodeMode };
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

/** Split cubic paths along a finite knife. Transverse roots are cut exactly
 * with De Casteljau subdivision. Repeated roots that merely touch the knife
 * do not split an open path. */
export function cutCadContour(contour: CadContour, a: CadPoint, b: CadPoint) {
  if (!validContours([contour]) || !validCadPoint(a) || !validCadPoint(b)) throw new CadOperationError('geometry');
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const controls = [...contourSegments(contour)];
  const extent = controls.reduce((max, points) => points.reduce(
    (size, p) => Math.max(size, Math.abs(p.x), Math.abs(p.y), Math.abs(p.x - a.x), Math.abs(p.y - a.y)), max
  ), Math.max(1, length));
  const epsilon = extent * 64 * Number.EPSILON;
  if (length <= epsilon) throw new CadOperationError('knife-blade');
  const ux = dx / length, uy = dy / length;
  const distance = (p: CadPoint) => (p.x - a.x) * uy - (p.y - a.y) * ux;
  const inside = (p: CadPoint) => {
    const along = (p.x - a.x) * ux + (p.y - a.y) * uy;
    return along >= -epsilon && along <= length + epsilon;
  };
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
    if (before !== after) crossings.push({ segment, t, point });
    else if (inside(point)) touched = true;
  }
  trace.forEach(({ roots, sides }, i) => {
    const points = controls[i], previous = i > 0 ? trace[i - 1] : contour.closed ? trace.at(-1) : undefined;
    if (previous && Math.abs(distance(points[0])) <= epsilon)
      contact(i, 0, points[0], previous.sides.at(-1)!, sides[0]);
    for (let j = 1; j < roots.length - 1; j++)
      contact(i, roots[j], cubicAt(points, roots[j]), sides[j - 1], sides[j]);
  });
  const cuts = crossings.filter(cut => inside(cut.point));
  if (!cuts.length) throw new CadOperationError('knife-miss');
  if (contour.closed && (crossings.length !== 2 || cuts.length !== 2 || touched ||
      Math.hypot(cuts[0].point.x - cuts[1].point.x, cuts[0].point.y - cuts[1].point.y) <= epsilon))
    throw new CadOperationError('knife-closed');

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
      const { t } = cuts[cutIndex++];
      if (t > 0) {
        const [left, right] = splitCubic(remaining, (t - previous) / (1 - previous));
        append(left);
        remaining = right;
      }
      previous = t;
      beginsPiece = true;
    }
    append(remaining);
  }
  const pieces = contour.closed
    ? [
        piece(spans.slice(starts[0], starts[1]), true, epsilon),
        piece([...spans.slice(starts[1]), ...spans.slice(0, starts[0])], true, epsilon),
      ]
    : [0, ...starts].map((start, i) => piece(spans.slice(start, starts[i] ?? spans.length), false, epsilon));
  if (!validContours(pieces)) throw new CadOperationError('limit');
  return { pieces, cutPoints: cuts.map(({ point }) => ({ x: point.x, y: point.y })) };
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
  if (contours.length !== 1) throw new CadOperationError('knife-target');
  const paint = convertedCurvePaint(editor, target);
  if (!contours[0].closed && cadPaintHasFill(paint)) throw new CadOperationError('knife-fill');
  const { pieces, cutPoints } = cutCadContour(contours[0], edge.nodes[0], edge.nodes[1]);
  const name = drawingObjectName(target);
  const fillRule = (target.props as { fillRule?: 'evenodd' | 'nonzero' }).fillRule ?? 'evenodd';
  const result = pieces.map((piece, index) => {
    const shape = sourceCurveResult(editor, target, [piece], fillRule, paint);
    return { ...shape, meta: { ...shape.meta, omsObjectName: `${name} (${index + 1})` } };
  });
  const warnings: string[] = [];
  if (contours[0].closed) warnings.push('knife-shared-edge');
  if (paint.dash.length) warnings.push('knife-dash');
  return {
    ...makeCadPlan(editor, settings, pieces, {
      name, fillRule, sourceIds: [target.id, blade.id],
      removeIds: consumeBlade ? [target.id, blade.id] : [target.id], shapes: result,
      warnings,
    }),
    cutPoints,
  };
}
