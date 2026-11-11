import { atom, type Editor } from '@tldraw/tldraw';
import { CAD_MAX_COORDINATE, validCadPoint, type CadPoint } from './cad-settings';

const normalize = (angle: number) => ((angle % 360) + 360) % 360;

/** Circumcircle in translated coordinates: avoids cancellation far from the origin. */
export function threePointGeometry(kind: 'arc' | 'circle', a: CadPoint, b: CadPoint, c: CadPoint) {
  if (![a, b, c].every(validCadPoint)) return null;
  const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: c.x - a.x, y: c.y - a.y };
  const ul = Math.hypot(u.x, u.y), vl = Math.hypot(v.x, v.y), cross = u.x * v.y - u.y * v.x;
  if (Math.min(ul, vl, Math.hypot(c.x - b.x, c.y - b.y)) < 1e-6 || Math.abs(cross) < ul * vl * 1e-10) return null;
  const ux = ul * ul, vx = vl * vl;
  const offset = { x: (ux * v.y - vx * u.y) / (2 * cross), y: (u.x * vx - v.x * ux) / (2 * cross) };
  const center = { x: a.x + offset.x, y: a.y + offset.y }, radius = Math.hypot(offset.x, offset.y);
  if (!validCadPoint(center) || !Number.isFinite(radius) || radius < 1e-6 || radius > CAD_MAX_COORDINATE) return null;
  // Keep the whole circle within the same coordinate envelope as other CAD tools.
  if (!validCadPoint({ x: center.x - radius, y: center.y - radius }) || !validCadPoint({ x: center.x + radius, y: center.y + radius })) return null;
  if (kind === 'circle') {
    if (radius * 2 > CAD_MAX_COORDINATE) return null;
    return { type: 'cad-ellipse', x: center.x - radius, y: center.y - radius, props: { w: radius * 2, h: radius * 2 } };
  }
  const angle = (p: CadPoint) => normalize(Math.atan2(center.y - p.y, p.x - center.x) * 180 / Math.PI);
  const start = angle(a), through = angle(b), end = angle(c);
  // Native arcs travel counterclockwise. Reverse endpoints for a clockwise input,
  // retaining the requested locus through the middle point, including major arcs.
  const forward = normalize(through - start) < normalize(end - start);
  const startAngle = forward ? start : end, sweep = forward ? normalize(end - start) : normalize(start - end);
  if (sweep < 1e-8 || sweep >= 360 - 1e-8) return null;
  return { type: 'cad-arc', ...center, props: { radius, startAngle, endAngle: startAngle + sweep } };
}

export interface CadConstruction {
  kind: 'arc' | 'circle'; points: CadPoint[]; pointer: CadPoint | null; valid: boolean;
}
function constructionAtom() { return atom<CadConstruction | null>('cad construction', null); }
const sessions = new WeakMap<Editor, ReturnType<typeof constructionAtom>>();
export function cadConstruction(editor: Editor) {
  let value = sessions.get(editor);
  if (!value) { value = constructionAtom(); sessions.set(editor, value); }
  return value;
}
