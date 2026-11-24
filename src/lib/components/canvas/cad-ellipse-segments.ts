import type { Editor } from '@tldraw/tldraw';
import { arcContour, cubicAt, mapContours, nodeAt, type CadContour } from './cad-curves';
import { cadPointToCanvas, unitMm, validateCadSettings, type CadSettings } from './cad-settings';
import { makeNewCadShapePlan } from './drawing-outline-defaults';

export type EllipseSegmentKind = 'arc' | 'pie' | 'chord';
export interface EllipseSegmentOptions {
  kind: EllipseSegmentKind;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  startAngle: number;
  endAngle: number;
  rotation: number;
  clockwise: boolean;
}
export const ELLIPSE_SEGMENT_TOLERANCE_MM = 0.005;
const radians = (degrees: number) => degrees * Math.PI / 180;

/** Maximum unit-circle radial error of the standard tangent-matched cubic.
 * An affine ellipse scales the distance bound by its largest radius.
 * Same extremum and roundoff margin used for CAD node fillets. */
function radialError(angle: number): number {
  const a = Math.abs(angle) / 2, c = Math.cos(a), s = Math.sin(a), k = 4 / 3 * Math.tan(a / 2);
  const p = cubicAt([{ x: c, y: -s }, { x: c + k * s, y: -s + k * c },
    { x: c + k * s, y: s - k * c }, { x: c, y: s }], (3 - Math.sqrt(3)) / 6);
  return Math.max(0, Math.hypot(p.x, p.y) - 1) + 32 * Number.EPSILON;
}

/** Coordinates and tolerance use the same units; angles use CAD Y-up degrees.
 * Equal start/end angles are rejected rather than silently creating a full ellipse. */
export function ellipseSegmentContour(options: EllipseSegmentOptions, tolerance: number): CadContour {
  const { kind, width, height, centerX, centerY, startAngle, endAngle, rotation, clockwise } = options;
  if (!['arc', 'pie', 'chord'].includes(kind) || typeof clockwise !== 'boolean' ||
      ![width, height, centerX, centerY, tolerance].every(Number.isFinite) ||
      width <= 0 || height <= 0 || tolerance <= 0) throw new Error('ellipse-size');
  if (![startAngle, endAngle, rotation].every(a => Number.isFinite(a) && Math.abs(a) <= 360))
    throw new Error('ellipse-angles');
  const ccw = ((endAngle - startAngle) % 360 + 360) % 360;
  if (ccw < 0.001 - 1e-10 || 360 - ccw < 0.001 - 1e-10) throw new Error('ellipse-angles');
  const sweep = radians(clockwise ? ccw - 360 : ccw), radius = Math.max(width, height) / 2;
  let count = Math.ceil(Math.abs(sweep) / (Math.PI / 2));
  while (radius * radialError(sweep / count) > tolerance) {
    if (count >= 1024) throw new Error('limit');
    count *= 2;
  }
  const contour = arcContour(0, 0, width / 2, height / 2, radians(startAngle), sweep, Math.abs(sweep) / count);
  contour.nodes[0].mode = 'corner';
  contour.nodes[contour.nodes.length - 1].mode = 'corner';
  if (kind !== 'arc') {
    contour.closed = true;
    if (kind === 'pie') contour.nodes.push(nodeAt({ x: 0, y: 0 }));
  }
  const a = radians(rotation), c = Math.cos(a), s = Math.sin(a);
  return mapContours([contour], p => ({ x: centerX + p.x * c - p.y * s, y: centerY + p.x * s + p.y * c }))[0];
}

export function prepareEllipseSegment(editor: Editor, settings: CadSettings, options: EllipseSegmentOptions) {
  if (!validateCadSettings(settings)) throw new Error('ellipse-size');
  const mm = unitMm(settings.unit);
  if (Math.max(options.width, options.height) * mm > 1_000_000) throw new Error('ellipse-size');
  const contour = ellipseSegmentContour(options, ELLIPSE_SEGMENT_TOLERANCE_MM / mm);
  const contours = mapContours([contour], point => cadPointToCanvas(point, settings));
  const name = { arc: 'Elliptic arc', pie: 'Pie sector', chord: 'Ellipse chord' }[options.kind];
  return makeNewCadShapePlan(editor, settings, contours, name);
}
