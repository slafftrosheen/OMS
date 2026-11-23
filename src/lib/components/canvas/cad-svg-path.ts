import { SVGPathData } from 'svg-pathdata';
import type { VectorMatrix } from './cad-appearance';
import { arcContour, CAD_CURVE_NODE_LIMIT, mapContours, nodeAt, type CadContour } from './cad-curves';
import { svgLength, svgNumbers, SVG_MM_PER_PIXEL } from './cad-svg-coordinates';

export const SVG_SHAPES = new Set(['path', 'rect', 'line', 'circle', 'ellipse', 'polyline', 'polygon']);

function pathText(element: Element): string {
  const length = (key: string, fallback = 0) => {
    const value = element.getAttribute(key);
    return value === null ? fallback : svgLength(value);
  };
  if (element.localName === 'path') return element.getAttribute('d') ?? '';
  if (element.localName === 'line') return `M${length('x1')} ${length('y1')}L${length('x2')} ${length('y2')}`;
  if (element.localName === 'polygon' || element.localName === 'polyline') {
    const points = svgNumbers(element.getAttribute('points') ?? '', 2 * CAD_CURVE_NODE_LIMIT);
    if (points.length % 2) throw new Error('svg-format');
    return points.length < 4 ? '' : `M${points.join(' ')}${element.localName === 'polygon' ? 'Z' : ''}`;
  }
  if (element.localName === 'circle' || element.localName === 'ellipse') {
    const cx = length('cx'), cy = length('cy'), circle = element.localName === 'circle';
    const rx = length(circle ? 'r' : 'rx'), ry = circle ? rx : length('ry');
    if (rx <= 0 || ry <= 0) return '';
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
  }
  const x = length('x'), y = length('y'), w = length('width'), h = length('height');
  if (w <= 0 || h <= 0) return '';
  const radiusX = length('rx', length('ry'));
  const rx = Math.min(w / 2, Math.max(0, radiusX)), ry = Math.min(h / 2, Math.max(0, length('ry', radiusX)));
  if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
    `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}` +
    `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
}

export function svgContours(element: Element, matrix: VectorMatrix, warnings: Set<string>): CadContour[] {
  const path = new SVGPathData(pathText(element));
  if (path.commands.length > 2 * CAD_CURVE_NODE_LIMIT) throw new Error('limit');
  const commands = path.toAbs().normalizeHVZ(false, true, true).normalizeST().qtToC().annotateArcs().commands;
  const contours: CadContour[] = [];
  let current: CadContour | undefined, count = 0;
  let last = { x: 0, y: 0 };
  for (const command of commands) {
    if (command.type === SVGPathData.CLOSE_PATH) {
      if (!current) continue;
      const nodes = current.nodes;
      if (nodes.length > 2 && nodes[0].x === last.x && nodes[0].y === last.y) {
        const seam = nodes.pop()!;
        Object.assign(nodes[0], { inX: seam.inX, inY: seam.inY });
      }
      current.closed = true;
      last = nodes[0];
      current = undefined;
      continue;
    }
    if (!('x' in command && 'y' in command)) throw new Error('svg-format');
    const point = { x: command.x, y: command.y };
    if (!current || command.type === SVGPathData.MOVE_TO) {
      current = { closed: false, nodes: [nodeAt(command.type === SVGPathData.MOVE_TO ? point : last)] };
      contours.push(current);
      count++;
    }
    const previous = current.nodes.at(-1)!;
    const next = nodeAt(point);
    if (command.type === SVGPathData.CURVE_TO) {
      previous.outX = command.x1 - previous.x;
      previous.outY = command.y1 - previous.y;
      next.inX = command.x2 - next.x;
      next.inY = command.y2 - next.y;
    } else if (command.type === SVGPathData.ARC) {
      if (last.x === point.x && last.y === point.y) continue;
      const { cX, cY, phi1, phi2, rX, rY, xRot } = command;
      if ([cX, cY, phi1, phi2, rX, rY, xRot].some(n => !Number.isFinite(n))) throw new Error('svg-format');
      const angle = xRot * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
      const effectiveRadiusMm = Math.max(rX, rY) * Math.hypot(...matrix.slice(0, 4)) * SVG_MM_PER_PIXEL;
      const step = Math.min(Math.PI / 2, Math.pow(5 / effectiveRadiusMm, 1 / 6));
      const arc = arcContour(0, 0, rX, rY, phi1! * Math.PI / 180, (phi2! - phi1!) * Math.PI / 180, step);
      const [first, ...tail] = mapContours([arc], p => ({ x: cX! + p.x * c - p.y * s, y: cY! + p.x * s + p.y * c }))[0].nodes;
      previous.outX = first.x + first.outX - previous.x;
      previous.outY = first.y + first.outY - previous.y;
      const end = tail.at(-1)!;
      end.inX += end.x - point.x;
      end.inY += end.y - point.y;
      Object.assign(end, point);
      count += tail.length;
      if (count > CAD_CURVE_NODE_LIMIT) throw new Error('limit');
      current.nodes.push(...tail);
      warnings.add('svg-arcs');
      last = point;
      continue;
    }
    if (command.type !== SVGPathData.MOVE_TO) {
      current.nodes.push(next);
      count++;
    }
    if (count > CAD_CURVE_NODE_LIMIT) throw new Error('limit');
    last = point;
  }
  return mapContours(contours.filter(c => c.nodes.length >= 2), p => ({
    x: matrix[0] * p.x + matrix[2] * p.y + matrix[4], y: matrix[1] * p.x + matrix[3] * p.y + matrix[5],
  }));
}
