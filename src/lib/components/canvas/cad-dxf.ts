import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { drawingObjectName } from './drawing-operations';
import { CAD_MAX_COORDINATE, cadMmPerPixel, validateCadSettings, type CadPoint, type CadSettings } from './cad-settings';

import { contourSegments, curveBounds, flattenContours, mapContours, validContours, type CadContour } from './cad-curves';

export class CadDxfError extends Error {
  constructor(public code: 'empty' | 'invalid' | 'limit' | 'settings') { super(code); this.name = 'CadDxfError'; }
}
export type CadDxfOmission = 'unsupported' | 'text' | 'curved' | 'clipped' | 'invalid';
export interface CadDxfResult {
  text: string; entities: number; closedContours: number; openContours: number;
  omitted: Array<{ id: string; name: string; reason: CadDxfOmission }>;
  widthMm: number; heightMm: number;
}
export type DxfEntity =
  { type: 'spline'; contour: CadContour } |
  { type: 'polyline'; points: CadPoint[]; closed: boolean } |
  { type: 'circle'; center: CadPoint; radius: number } |
  { type: 'ellipse'; center: CadPoint; major: CadPoint; ratio: number } |
  { type: 'arc'; center: CadPoint; radius: number; start: number; end: number };
const MAX_ENTITIES = 4000, MAX_VERTICES = 100_000, MAX_MM = 100_000_000;
const POLYGONS = new Set(['rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'trapezoid', 'rhombus']);
const normAngle = (n: number) => ((n % 360) + 360) % 360;
function finite(n: number) { if (!Number.isFinite(n) || Math.abs(n) > MAX_MM) throw new CadDxfError('invalid'); return n; }
function number(n: number) { const value = finite(n); return Math.abs(value) < 1e-12 ? '0' : String(value); }
function validPoint(p: CadPoint) { finite(p.x); finite(p.y); }
function checkedPolyline(points: CadPoint[], closed: boolean): DxfEntity {
  const list = points.map(p => ({ x: finite(p.x), y: finite(p.y) }));
  if (closed && list.length > 2 && Math.hypot(list[0].x - list.at(-1)!.x, list[0].y - list.at(-1)!.y) < 1e-7) list.pop();
  if (list.length < (closed ? 3 : 2)) throw new CadDxfError('invalid');
  for (let i = 1; i < list.length; i++) if (Math.hypot(list[i].x - list[i - 1].x, list[i].y - list[i - 1].y) < 1e-6) throw new CadDxfError('invalid');
  if (closed && Math.abs(list.reduce((area, a, i) => { const b = list[(i + 1) % list.length]; return area + a.x * b.y - b.x * a.y; }, 0)) < 1e-10) throw new CadDxfError('invalid');
  return { type: 'polyline', points: list, closed };
}
function positive(n: number) { if (finite(n) < 1e-6) throw new CadDxfError('invalid'); return n; }
function pointInPolygon(point: CadPoint, polygon: CadPoint[]): boolean {
  // Masks produced by frames are convex; tolerate boundaries without accepting clipped paths.
  let direction = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) < 1e-6) continue;
    const sign = Math.sign(cross);
    if (direction && sign !== direction) return false;
    direction = sign;
  }
  return true;
}
function clipped(editor: Editor, shape: TLShape): boolean {
  const mask = editor.getShapeMask(shape.id);
  if (!mask) return false;
  if (!mask.length) return true;
  const b = editor.getShapeGeometry(shape).bounds, matrix = editor.getShapePageTransform(shape);
  return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }]
    .some(p => !pointInPolygon(matrix.applyToPoint(p), mask));
}
function shapeEntity(editor: Editor, shape: TLShape, settings: CadSettings): { entity?: DxfEntity; entities?: DxfEntity[]; reason?: CadDxfOmission } {
  const p = shape.props as Record<string, any>;
  const matrix = editor.getShapePageTransform(shape);
  const factor = cadMmPerPixel(settings);
  const convert = (point: CadPoint): CadPoint => {
    if (![point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= CAD_MAX_COORDINATE)) throw new CadDxfError('invalid');
    const world = matrix.applyToPoint(point);
    return { x: finite((world.x - settings.originX) * factor), y: finite((settings.originY - world.y) * factor) };
  };
  if (clipped(editor, shape)) return { reason: 'clipped' };
  if (shape.type === 'cad-bezier') {
    if (!validContours(p.contours)) return { reason: 'invalid' };
    return { entities: mapContours(p.contours, convert).map(contour => contour.nodes.every(n => !n.inX && !n.inY && !n.outX && !n.outY)
      ? checkedPolyline(contour.nodes, contour.closed) : { type: 'spline', contour }) };
  }
  if (shape.type === 'cad-path') return { entity: checkedPolyline(p.points.map(convert), p.closed) };
  if (shape.type === 'line') {
    if (p.spline !== 'line') return { reason: 'curved' };
    const points = Object.values(p.points ?? {}).sort((a: any, b: any) => a.index < b.index ? -1 : a.index > b.index ? 1 : 0) as CadPoint[];
    return { entity: checkedPolyline(points.map(convert), false) };
  }
  if (shape.type === 'cad-arc') {
    const sweep = p.endAngle - p.startAngle;
    if (!Number.isFinite(sweep) || sweep <= 0 || sweep >= 360 || !Number.isFinite(p.startAngle)) return { reason: 'invalid' };
    const center = convert({ x: 0, y: 0 });
    const angle = -matrix.rotation() * 180 / Math.PI;
    return { entity: { type: 'arc', center, radius: positive(p.radius * factor), start: normAngle(p.startAngle + angle), end: normAngle(p.endAngle + angle) } };
  }
  if (shape.type === 'geo' || shape.type === 'cad-ellipse') {
    if (shape.type === 'geo' && String(p.text ?? '').trim()) return { reason: 'text' };
    const w = positive(shape.type === 'geo' ? Math.max(1, Number(p.w)) : Number(p.w));
    const h = positive(shape.type === 'geo' ? Math.max(1, Number(p.h)) + Number(p.growY ?? 0) : Number(p.h));
    if (shape.type === 'cad-ellipse' || p.geo === 'ellipse') {
      const center = convert({ x: w / 2, y: h / 2 });
      if (Math.abs(w - h) <= 1e-9) return { entity: { type: 'circle', center, radius: positive(w / 2 * factor) } };
      const endpoint = convert(w >= h ? { x: w, y: h / 2 } : { x: w / 2, y: 0 });
      return { entity: { type: 'ellipse', center, major: { x: endpoint.x - center.x, y: endpoint.y - center.y }, ratio: Math.min(w, h) / Math.max(w, h) } };
    }
    if (!POLYGONS.has(p.geo)) return { reason: 'unsupported' };
    // Use the native polygon body, not label bounds or a second approximation.
    const geometry = editor.getShapeGeometry(shape) as any;
    const body = geometry.children?.[0] ?? geometry;
    return { entity: checkedPolyline(body.vertices.map(convert), true) };
  }
  if (['text', 'note', 'cad-dimension'].includes(shape.type)) return { reason: 'text' };
  if (['draw', 'highlight', 'arrow'].includes(shape.type)) return { reason: 'curved' };
  return { reason: 'unsupported' };
}

/** Full model-space millimetres, Cartesian Y-up, no padding or view/zoom rescaling. */
export function buildCadDxf(editor: Editor, scope: 'selected' | 'all', settings: CadSettings, options: { curves?: 'spline' | 'polyline'; toleranceMm?: number } = {}): CadDxfResult {
  if (!validateCadSettings(settings)) throw new CadDxfError('settings');
  if (!['selected', 'all'].includes(scope)) throw new CadDxfError('invalid');
  const ids = scope === 'all' ? [...editor.getCurrentPageShapeIds()] : [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])];
  if (ids.length > MAX_ENTITIES * 2) throw new CadDxfError('limit');
  const entities: DxfEntity[] = [], omitted: CadDxfResult['omitted'] = [];
  let vertices = 0;
  for (const id of new Set(ids)) {
    const shape = editor.getShape(id as TLShapeId);
    if (!shape || ['group', 'frame'].includes(shape.type)) continue;
    let result: ReturnType<typeof shapeEntity>;
    try { result = shapeEntity(editor, shape, settings); }
    catch { result = { reason: 'invalid' }; }
    if (result.entity || result.entities) {
      for (const original of result.entities ?? [result.entity!]) {
        let entity = original;
        if (original.type === 'spline' && options.curves === 'polyline') {
          const tolerance = options.toleranceMm ?? 0.01;
          if (!Number.isFinite(tolerance) || tolerance < 0.001 || tolerance > 1) throw new CadDxfError('invalid');
          entity = checkedPolyline(flattenContours([original.contour], tolerance)[0], original.contour.closed);
        }
        entities.push(entity); vertices += entity.type === 'polyline' ? entity.points.length : entity.type === 'spline' ? entity.contour.nodes.length * 3 + 1 : 1;
      }
    }
    else omitted.push({ id: shape.id, name: drawingObjectName(shape), reason: result.reason ?? 'unsupported' });
    if (entities.length > MAX_ENTITIES || vertices > MAX_VERTICES) throw new CadDxfError('limit');
  }
  if (!entities.length) {
    if (!omitted.length) throw new CadDxfError('empty');
    return { text: '', widthMm: 0, heightMm: 0, entities: 0, closedContours: 0, openContours: 0, omitted };
  }
  const { text, widthMm, heightMm } = serializeCadDxf(entities);
  const closedContours = entities.filter(e => e.type === 'circle' || e.type === 'ellipse' || e.type === 'polyline' && e.closed || e.type === 'spline' && e.contour.closed).length;
  return { text, widthMm, heightMm, entities: entities.length, closedContours, openContours: entities.length - closedContours, omitted };
}

/** DXF R2000 entity writer. Kept pure so an independent CAD reader can verify generated fixtures. */
export function serializeCadDxf(entities: DxfEntity[]): { text: string; widthMm: number; heightMm: number } {
  if (!entities.length) throw new CadDxfError('empty');
  if (entities.length > MAX_ENTITIES) throw new CadDxfError('limit');
  let nextHandle = 0x100, vertexCount = 0;
  const parts: string[] = [], body: string[] = [];
  const add = (out: string[], ...pairs: (string | number)[]) => {
    for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), typeof pairs[i + 1] === 'number' ? number(pairs[i + 1] as number) : pairs[i + 1] as string);
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const bound = (x: number, y: number) => { finite(x); finite(y); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  const startEntity = (type: string, subclass: string, closed: boolean) => add(body, 0, type, 5, (nextHandle++).toString(16).toUpperCase(), 330, '1F', 100, 'AcDbEntity', 8, closed ? 'OMS_CLOSED' : 'OMS_OPEN', 100, subclass);
  for (const original of entities) {
    const e = original.type === 'polyline' ? checkedPolyline(original.points, original.closed) : original;
    if (e.type === 'spline') {
      const contour = e.contour;
      if (!validContours([contour])) throw new CadDxfError('invalid');
      const segments = [...contourSegments(contour)], controls = [contour.nodes[0], ...segments.flatMap(p => p.slice(1))];
      vertexCount += controls.length;
      if (vertexCount > MAX_VERTICES) throw new CadDxfError('limit');
      const knots = [0, 0, 0, 0];
      for (let i = 1; i < segments.length; i++) knots.push(i, i, i);
      knots.push(segments.length, segments.length, segments.length, segments.length);
      startEntity('SPLINE', 'AcDbSpline', contour.closed);
      add(body, 210, 0, 220, 0, 230, 1, 70, contour.closed ? 9 : 8, 71, 3, 72, knots.length, 73, controls.length, 74, 0);
      for (const knot of knots) add(body, 40, knot);
      for (const p of controls) add(body, 10, p.x, 20, p.y, 30, 0);
      const b = curveBounds([contour]); bound(b.x, b.y); bound(b.x + b.w, b.y + b.h);
    } else if (e.type === 'polyline') {
      vertexCount += e.points.length;
      if (vertexCount > MAX_VERTICES) throw new CadDxfError('limit');
      if (e.points.length === 2 && !e.closed) {
        startEntity('LINE', 'AcDbLine', false);
        add(body, 10, e.points[0].x, 20, e.points[0].y, 30, 0, 11, e.points[1].x, 21, e.points[1].y, 31, 0);
      } else {
        startEntity('LWPOLYLINE', 'AcDbPolyline', e.closed); add(body, 90, e.points.length, 70, e.closed ? 1 : 0);
        for (const p of e.points) add(body, 10, p.x, 20, p.y);
      }
      for (const p of e.points) bound(p.x, p.y);
    } else if (e.type === 'circle' || e.type === 'arc') {
      validPoint(e.center); positive(e.radius);
      startEntity(e.type === 'circle' ? 'CIRCLE' : 'ARC', 'AcDbCircle', e.type === 'circle');
      add(body, 10, e.center.x, 20, e.center.y, 30, 0, 40, e.radius);
      if (e.type === 'arc') {
        const start = normAngle(finite(e.start)), end = normAngle(finite(e.end));
        if (Math.abs(start - end) < 1e-9) throw new CadDxfError('invalid');
        add(body, 100, 'AcDbArc', 50, start, 51, end);
        const sweep = normAngle(end - start);
        for (const a of [start, end, 0, 90, 180, 270]) if (a === start || a === end || normAngle(a - start) <= sweep) {
          bound(e.center.x + e.radius * Math.cos(a * Math.PI / 180), e.center.y + e.radius * Math.sin(a * Math.PI / 180));
        }
      } else { bound(e.center.x - e.radius, e.center.y - e.radius); bound(e.center.x + e.radius, e.center.y + e.radius); }
    } else {
      validPoint(e.center); validPoint(e.major); positive(Math.hypot(e.major.x, e.major.y));
      if (!Number.isFinite(e.ratio) || e.ratio <= 0 || e.ratio > 1) throw new CadDxfError('invalid');
      startEntity('ELLIPSE', 'AcDbEllipse', true);
      add(body, 10, e.center.x, 20, e.center.y, 30, 0, 11, e.major.x, 21, e.major.y, 31, 0, 40, e.ratio, 41, 0, 42, Math.PI * 2);
      const dx = Math.hypot(e.major.x, e.major.y * e.ratio), dy = Math.hypot(e.major.y, e.major.x * e.ratio);
      bound(e.center.x - dx, e.center.y - dy); bound(e.center.x + dx, e.center.y + dy);
    }
  }
  add(parts, 0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1,
    9, '$LUNITS', 70, 2, 9, '$LUPREC', 70, 6, 9, '$HANDSEED', 5, nextHandle.toString(16).toUpperCase(),
    9, '$EXTMIN', 10, minX, 20, minY, 30, 0, 9, '$EXTMAX', 10, maxX, 20, maxY, 30, 0, 0, 'ENDSEC');
  add(parts, 0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 5, '10', 330, '0', 100, 'AcDbSymbolTable', 70, 1,
    0, 'LTYPE', 5, '11', 330, '10', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB',
    0, 'TABLE', 2, 'LAYER', 5, '12', 330, '0', 100, 'AcDbSymbolTable', 70, 3);
  for (const [i, layer] of ['0', 'OMS_CLOSED', 'OMS_OPEN'].entries()) add(parts, 0, 'LAYER', 5, (0x13 + i).toString(16).toUpperCase(), 330, '12', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, layer, 70, 0, 62, i === 2 ? 3 : 7, 6, 'CONTINUOUS');
  add(parts, 0, 'ENDTAB', 0, 'TABLE', 2, 'BLOCK_RECORD', 5, '1E', 330, '0', 100, 'AcDbSymbolTable', 70, 2);
  for (const [handle, name] of [['1F', '*Model_Space'], ['20', '*Paper_Space']]) add(parts, 0, 'BLOCK_RECORD', 5, handle, 330, '1E', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, name, 70, 0);
  add(parts, 0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'BLOCKS');
  for (const [owner, name, start, end] of [['1F', '*Model_Space', '21', '22'], ['20', '*Paper_Space', '23', '24']]) add(parts,
    0, 'BLOCK', 5, start, 330, owner, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, name, 70, 0, 10, 0, 20, 0, 30, 0, 3, name, 1, '',
    0, 'ENDBLK', 5, end, 330, owner, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd');
  add(parts, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES'); parts.push(...body); add(parts, 0, 'ENDSEC', 0, 'EOF');
  const text = parts.join('\r\n') + '\r\n';
  if (text.length > 16_000_000) throw new CadDxfError('limit');
  return { text, widthMm: maxX - minX, heightMm: maxY - minY };
}
