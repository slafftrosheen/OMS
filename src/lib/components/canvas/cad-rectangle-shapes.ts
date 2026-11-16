import type { Editor } from '@tldraw/tldraw';
import { mapContours, nodeAt, type CadBezierNode, type CadContour } from './cad-curves';
import { ellipseSegmentContour, ELLIPSE_SEGMENT_TOLERANCE_MM } from './cad-ellipse-segments';
import { cadPointToCanvas, unitMm, validateCadSettings, type CadSettings } from './cad-settings';
import { CadOperationError, makeCadPlan } from './cad-plans';

export const RECTANGLE_CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
export type RectangleCorner = typeof RECTANGLE_CORNERS[number];
export type RectangleCornerKind = 'sharp' | 'round' | 'scallop' | 'chamfer';
export interface RectangleCornerOptions { kind: RectangleCornerKind; size: number }
export interface RectangleShapeOptions {
  width: number; height: number; centerX: number; centerY: number; rotation: number;
  corners: Record<RectangleCorner, RectangleCornerOptions>;
}

/** Dimensions are the unrotated outer rectangle; coordinates use CAD Y-up.
 * Each corner size is limited to half the shorter side, including concave
 * scallops, so independent corner edits cannot produce crossing toolpaths.
 * Rounded/scalloped quarters use the same bounded cubic approximation as
 * elliptic arcs. Sharp and chamfered segments remain exact straight lines. */
export function rectangleShapeContours(options: RectangleShapeOptions, tolerance: number): CadContour[] {
  const { width, height, centerX, centerY, rotation, corners } = options;
  if (![width, height, centerX, centerY, rotation, tolerance].every(Number.isFinite) ||
      width <= 0 || height <= 0 || tolerance <= 0 || Math.abs(rotation) > 360 ||
      Math.min(width, height) <= Math.max(width, height) * Number.EPSILON * 32)
    throw new CadOperationError('rectangle-input');
  const maximum = Math.min(width, height) / 2;
  if (!corners || RECTANGLE_CORNERS.some(key => {
    const c = corners[key];
    return !c || !['sharp', 'round', 'scallop', 'chamfer'].includes(c.kind) ||
      !Number.isFinite(c.size) || c.size < 0 || c.kind !== 'sharp' && c.size > maximum;
  })) throw new CadOperationError('rectangle-corner');
  const vertices = [{ x: -width / 2, y: height / 2 }, { x: width / 2, y: height / 2 },
    { x: width / 2, y: -height / 2 }, { x: -width / 2, y: -height / 2 }];
  const nodes: CadBezierNode[] = [], epsilon = Math.max(width, height) * Number.EPSILON * 16;
  function append(node: CadBezierNode) {
    const last = nodes.at(-1);
    if (last && Math.hypot(last.x - node.x, last.y - node.y) <= epsilon) {
      // A fully rounded side may have no straight segment left. Join its
      // endpoint once, retaining both incoming and outgoing cubic controls.
      last.outX = node.outX; last.outY = node.outY;
    } else nodes.push(node);
  }
  for (let i = 0; i < 4; i++) {
    const p = vertices[i], previous = vertices[(i + 3) % 4], next = vertices[(i + 1) % 4];
    const u = { x: Math.sign(previous.x - p.x), y: Math.sign(previous.y - p.y) };
    const v = { x: Math.sign(next.x - p.x), y: Math.sign(next.y - p.y) };
    const { kind, size } = corners[RECTANGLE_CORNERS[i]];
    if (kind === 'sharp' || size === 0) { append(nodeAt(p)); continue; }
    const a = { x: p.x + u.x * size, y: p.y + u.y * size };
    const b = { x: p.x + v.x * size, y: p.y + v.y * size };
    if (kind === 'chamfer') { append(nodeAt(a)); append(nodeAt(b)); continue; }
    const center = kind === 'scallop' ? p : { x: p.x + (u.x + v.x) * size, y: p.y + (u.y + v.y) * size };
    const arc = ellipseSegmentContour({ kind: 'arc', width: 2 * size, height: 2 * size,
      centerX: center.x, centerY: center.y, rotation: 0,
      startAngle: Math.atan2(a.y - center.y, a.x - center.x) * 180 / Math.PI,
      endAngle: Math.atan2(b.y - center.y, b.x - center.x) * 180 / Math.PI,
      clockwise: kind === 'round' }, tolerance);
    Object.assign(arc.nodes[0], a); Object.assign(arc.nodes.at(-1)!, b);
    arc.nodes.forEach(append);
  }
  const first = nodes[0], last = nodes.at(-1)!;
  if (nodes.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) <= epsilon) {
    first.inX = last.inX; first.inY = last.inY; nodes.pop();
  }
  const angle = rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return mapContours([{ closed: true, nodes }], p => ({
    x: centerX + p.x * c - p.y * s, y: centerY + p.x * s + p.y * c
  }));
}

export function prepareRectangleShape(editor: Editor, settings: CadSettings, options: RectangleShapeOptions) {
  if (!validateCadSettings(settings) || Math.max(options.width, options.height) * unitMm(settings.unit) > 1_000_000)
    throw new CadOperationError('rectangle-input');
  const contours = rectangleShapeContours(options, ELLIPSE_SEGMENT_TOLERANCE_MM / unitMm(settings.unit));
  return makeCadPlan(editor, settings, mapContours(contours, p => cadPointToCanvas(p, settings)), { name: 'Rectangle' });
}
