import type { Editor } from '@tldraw/tldraw';
import { cadSelectedShapes, shapeCadContours } from './cad-editing';
import { cadMmPerPixel, type CadSettings } from './cad-settings';
import { makeCadPlan, CadOperationError, type CadPlan } from './cad-plans';
import type { CadBezierNode, CadContour } from './cad-curves';

export type CadJoinPair = 'end-start' | 'start-start' | 'end-end' | 'start-end';
export interface CadJoinOptions {
  pairing: CadJoinPair | 'nearest';
  mode: 'bridge' | 'merge';
  toleranceMm: number;
}
export interface CadJoinPlan extends CadPlan { gapMm: number; pairing: CadJoinPair }
const pairs: CadJoinPair[] = ['end-start', 'start-start', 'end-end', 'start-end'];
const reversed = (nodes: CadBezierNode[]) => nodes.slice().reverse().map(n => ({ ...n,
  inX: n.outX, inY: n.outY, outX: n.inX, outY: n.inY
}));
function orient(contours: CadContour[], pair: CadJoinPair) {
  return [pair.startsWith('start') ? reversed(contours[0].nodes) : structuredClone(contours[0].nodes),
    pair.endsWith('end') ? reversed(contours[1].nodes) : structuredClone(contours[1].nodes)];
}

/** Explicit preview of two endpoints. A bridge never distorts the source cubics;
 * merging moves only their anchors, by at most half the acknowledged gap. */
export function prepareCadJoin(editor: Editor, settings: CadSettings, options: CadJoinOptions): CadJoinPlan {
  if (!['bridge', 'merge'].includes(options.mode) || !['nearest', ...pairs].includes(options.pairing) ||
      options.mode === 'merge' && (!Number.isFinite(options.toleranceMm) || options.toleranceMm < 0.001 || options.toleranceMm > 1))
    throw new CadOperationError('geometry');
  const shapes = cadSelectedShapes(editor);
  if (shapes.length > 2) throw new CadOperationError('join-selection');
  const factor = cadMmPerPixel(settings);
  const contours = shapes.flatMap(shape => shapeCadContours(editor, shape, 0.005 / factor));
  if (contours.length !== 2 || contours.some(contour => contour.closed)) throw new CadOperationError('join-selection');
  const rules = shapes.map(shape => (shape.props as any).fillRule ?? 'evenodd');
  if (new Set(rules).size !== 1) throw new CadOperationError('fill-rule');
  const candidates = pairs.map(pair => {
    const [a, b] = orient(contours, pair);
    return { pair, gap: Math.hypot(a.at(-1)!.x - b[0].x, a.at(-1)!.y - b[0].y) };
  });
  const choice = options.pairing === 'nearest'
    ? candidates.reduce((best, next) => next.gap < best.gap ? next : best)
    : candidates.find(value => value.pair === options.pairing)!;
  const gapMm = choice.gap * factor;
  if (!Number.isFinite(gapMm)) throw new CadOperationError('geometry');
  if (options.mode === 'merge' && gapMm > options.toleranceMm) throw new CadOperationError('join-gap');
  const [left, right] = orient(contours, choice.pair);
  const a = left.at(-1)!, b = right[0];
  let nodes: CadBezierNode[];
  if (options.mode === 'merge' || choice.gap === 0) {
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    nodes = [...left.slice(0, -1), { x, y, mode: 'corner',
      inX: a.x + a.inX - x, inY: a.y + a.inY - y,
      outX: b.x + b.outX - x, outY: b.y + b.outY - y
    }, ...right.slice(1)];
  } else {
    a.outX = a.outY = b.inX = b.inY = 0;
    a.mode = b.mode = 'corner';
    nodes = [...left, ...right];
  }
  const joined: CadContour = { closed: false, nodes };
  const ids = shapes.map(shape => shape.id);
  return { ...makeCadPlan(editor, settings, [joined], {
    sourceIds: ids, removeIds: ids, name: 'Joined curve', fillRule: rules[0],
    warnings: shapes.some(s => s.type === 'cad-arc') ? ['join-arc-approximation'] : [],
    shapes: [{ type: 'cad-bezier', x: 0, y: 0, props: {
      contours: [joined], color: (shapes[0].props as any).color ?? 'black', fillRule: rules[0]
    } }]
  }), gapMm, pairing: choice.pair };
}
