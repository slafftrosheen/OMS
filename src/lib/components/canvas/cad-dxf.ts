import { productionDxfNames, productionLayerId, readProductionLayers } from './cad-production-layers';
import { validVectorPaint } from './cad-paint';
import { rectangularClipContainsBounds } from './cad-appearance';
import { dxfColor } from './cad-dxf-geometry';
import { buildDxfCommonLines, DxfCommonLineLimitError } from './cad-dxf-common-lines';
import { measureDxfCutLengths, type DxfCutLengths } from './cad-dxf-cut-lengths';
import { buildDxfPreview, type DxfPreview, type DxfPreviewSource } from './cad-dxf-preview';
import { vectorPaint } from './cad-vector';
import type { CubicSpline2d, Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { drawingObjectName } from './drawing-operations';
import { CAD_MAX_COORDINATE, cadMmPerPixel, validateCadSettings, type CadPoint, type CadSettings } from './cad-settings';

import { contourSegments, curveBounds, flattenContours, mapContours, nodeAt, validContours, type CadContour } from './cad-curves';

export class CadDxfError extends Error {
  constructor(public code: 'empty' | 'invalid' | 'limit' | 'common-lines-limit' | 'settings') { super(code); this.name = 'CadDxfError'; }
}
export type CadDxfOmission = 'unsupported' | 'text' | 'curved' | 'clipped' | 'invalid';
export interface CadDxfResult {
  text: string; entities: number; closedContours: number; openContours: number;
  omitted: Array<{ id: string; name: string; reason: CadDxfOmission }>;
  widthMm: number; heightMm: number;
  layers: CadDxfLayer[];
  sharedEdges: number;
  filteredByLayer?: number;
  productionFilter?: { unassigned: number; excluded: number; otherLayers: number };
  passesRemoved: number;
  preview?: DxfPreview;
  cutLengths?: DxfCutLengths;
}
interface CadDxfLayer { name: string; rgb?: string; entities: number }
export type DxfEntity = (
  { type: 'spline'; contour: CadContour } |
  { type: 'polyline'; points: CadPoint[]; closed: boolean } |
  { type: 'circle'; center: CadPoint; radius: number } |
  { type: 'ellipse'; center: CadPoint; major: CadPoint; ratio: number } |
  { type: 'arc'; center: CadPoint; radius: number; start: number; end: number }) & { rgb?: string; commonLine?: true; productionLayer?: string };
const MAX_ENTITIES = 4000, MAX_VERTICES = 100_000, MAX_MM = 100_000_000;

function dxfVertexCount(entity: DxfEntity): number {
  if (entity.type === 'polyline') return entity.points.length;
  if (entity.type === 'spline') {
    const { closed, nodes } = entity.contour;
    // The first anchor is followed by three control points per cubic span.
    return 1 + 3 * (nodes.length - (closed ? 0 : 1));
  }
  return 0;
}

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
  if (closed) {
    // Evaluate signed area relative to a vertex to retain small loops far from
    // the origin, where subtraction of large world-coordinate products loses it.
    const origin = list[0];
    const area = list.reduce((sum, a, i) => {
      const b = list[(i + 1) % list.length];
      return sum + (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    }, 0);
    if (Math.abs(area) < 1e-10) throw new CadDxfError('invalid');
  }
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
export function cadShapeIsClipped(editor: Editor, shape: TLShape): boolean {
  const mask = editor.getShapeMask(shape.id);
  if (!mask) return false;
  if (!mask.length) return true;
  const b = editor.getShapeGeometry(shape).bounds, matrix = editor.getShapePageTransform(shape);
  return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }]
    .some(p => !pointInPolygon(matrix.applyToPoint(p), mask));
}
/** Decorative material fills retain their CAD cutting geometry; PDF/image
 * rasters do not acquire a cutting contour merely by being on the canvas. */
export function cadShapeHasNonCuttingRaster(shape: TLShape): boolean {
  const paint = shape.meta.omsVectorPaint as any;
  return !!paint?.raster && !(['cad-bezier', 'cad-path', 'cad-ellipse', 'cad-arc'].includes(shape.type) &&
    paint.raster.usage === 'material' && validVectorPaint(paint));
}
export function cadShapeDxfGeometry(editor: Editor, shape: TLShape, settings: CadSettings): { entity?: DxfEntity; entities?: DxfEntity[]; reason?: CadDxfOmission } {
  const p = shape.props as Record<string, any>;
  const matrix = editor.getShapePageTransform(shape);
  const factor = cadMmPerPixel(settings);
  const convert = (point: CadPoint): CadPoint => {
    if (![point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= CAD_MAX_COORDINATE)) throw new CadDxfError('invalid');
    const world = matrix.applyToPoint(point);
    return { x: finite((world.x - settings.originX) * factor), y: finite((settings.originY - world.y) * factor) };
  };
  if (cadShapeIsClipped(editor, shape)) return { reason: 'clipped' };
  const paint = shape.meta.omsVectorPaint;
  if ((paint as any)?.clips?.length) {
    // EPS/PDF page clips may cut only the painted stroke at the page edge.
    // A DXF cutting path can keep the centerline when it stays inside the clip.
    if (shape.type !== 'cad-bezier' || !validVectorPaint(paint) || !validContours(p.contours))
      return { reason: 'clipped' };
    const bounds = curveBounds(p.contours);
    if (!paint.clips?.every(clip => rectangularClipContainsBounds(clip, bounds))) return { reason: 'clipped' };
  }
  if (cadShapeHasNonCuttingRaster(shape)) return { reason: 'unsupported' };
  if (shape.type === 'cad-bezier') {
    if (!validContours(p.contours)) return { reason: 'invalid' };
    return { entities: mapContours(p.contours, convert).map(contour => contour.nodes.every(n => !n.inX && !n.inY && !n.outX && !n.outY)
      ? checkedPolyline(contour.nodes, contour.closed) : { type: 'spline', contour }) };
  }
  if (shape.type === 'cad-path') return { entity: checkedPolyline(p.points.map(convert), p.closed) };
  if (shape.type === 'line') {
    if (p.spline === 'cubic') {
      // Export the cubic handles from the same native geometry used to draw
      // the line. The stored point list has anchors but no Bézier handles.
      const { segments } = editor.getShapeGeometry(shape) as CubicSpline2d;
      if (!segments?.length) return { reason: 'invalid' };
      const nodes = [nodeAt(convert(segments[0].a))];
      for (const segment of segments) {
        const previous = nodes[nodes.length - 1];
        const out = convert(segment.b);
        const incoming = convert(segment.c);
        const next = nodeAt(convert(segment.d));
        previous.outX = out.x - previous.x; previous.outY = out.y - previous.y;
        next.inX = incoming.x - next.x; next.inY = incoming.y - next.y;
        nodes.push(next);
      }
      const contour = { closed: false, nodes };
      if (!validContours([contour])) return { reason: 'invalid' };
      return { entity: { type: 'spline', contour } };
    }
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

function flattenForDxf(contour: CadContour, tolerance: number): DxfEntity {
  let finer = tolerance;
  for (let attempt = 0; attempt <= 8; attempt++) {
    try {
      return checkedPolyline(flattenContours([contour], finer)[0], contour.closed);
    } catch (error) {
      if (error instanceof Error && error.message === 'limit') throw new CadDxfError('limit');
      if (!(error instanceof CadDxfError && error.code === 'invalid')) throw error;
    }
    // A coarse tolerance can reduce a closed two-anchor spline to a pair of
    // points. Retry at a finer resolution within the same error budget.
    finer /= 2;
    if (!attempt) {
      const bounds = curveBounds([contour]);
      if (contour.closed && (!bounds.w || !bounds.h)) break;
      finer = Math.min(finer, Math.max(1e-8, Math.min(bounds.w, bounds.h) / 8));
    }
  }
  throw new CadDxfError('invalid');
}

function cuttingColor(shape: TLShape): string | undefined {
  const paint = vectorPaint(shape.meta, (shape.props as { color?: string }).color);
  if (paint.stroke.startsWith('#') && paint.strokeOpacity > 0 && paint.strokeWidth > 0) return paint.stroke.toUpperCase();
  if (paint.fill.startsWith('#') && paint.fillOpacity > 0 && !paint.gradient && !paint.raster) return paint.fill.toUpperCase();
}

interface CadDxfOptions { curves?: 'spline' | 'polyline'; toleranceMm?: number; colorLayers?: boolean; commonLines?: boolean; includePreview?: boolean; productionLayers?: { only?: string; preserveColors?: boolean } }

export interface DxfCapturedScope { pageId: string; shapeIds: readonly TLShapeId[] }
export type DxfExportScope = 'selected' | 'all' | DxfCapturedScope;

function dxfSourceIds(editor: Editor, scope: DxfExportScope): TLShapeId[] {
  if (scope === 'all') return [...editor.getCurrentPageShapeIds()];
  if (scope === 'selected') return [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])];
  if (!scope || typeof scope !== 'object' || scope.pageId !== editor.getCurrentPageId() || !Array.isArray(scope.shapeIds))
    throw new CadDxfError('invalid');
  const ids = [...scope.shapeIds], pageIds = editor.getCurrentPageShapeIds();
  if (ids.some(id => !pageIds.has(id))) throw new CadDxfError('invalid');
  return ids;
}

/** Full model-space millimetres, Cartesian Y-up, no padding or view/zoom rescaling. */
export function buildCadDxf(editor: Editor, scope: DxfExportScope, settings: CadSettings, options: CadDxfOptions = {}): CadDxfResult {
  if (!validateCadSettings(settings)) throw new CadDxfError('settings');
  const tolerance = options.toleranceMm ?? 0.01;
  if (options.curves === 'polyline' && (!Number.isFinite(tolerance) || tolerance < 0.001 || tolerance > 1))
    throw new CadDxfError('invalid');
  const ids = dxfSourceIds(editor, scope);
  if (ids.length > MAX_ENTITIES * 2) throw new CadDxfError('limit');
  const entities: DxfEntity[] = [], omitted: CadDxfResult['omitted'] = [];
  const production = options.productionLayers;
  if (production && options.colorLayers) throw new CadDxfError('invalid');
  const pageLayers = production ? readProductionLayers(editor) : [];
  const names = productionDxfNames(pageLayers);
  const enabled = new Set(pageLayers.filter(layer => layer.includeInDxf).map(layer => layer.id));
  if (production?.only && !enabled.has(production.only)) throw new CadDxfError('invalid');
  let vertices = 0;
  const productionFilter = { unassigned: 0, excluded: 0, otherLayers: 0 };
  for (const id of new Set(ids)) {
    const shape = editor.getShape(id as TLShapeId);
    if (!shape || ['group', 'frame'].includes(shape.type)) continue;
    const assignedLayer = production ? productionLayerId(shape) : undefined;
    if (production && (!assignedLayer || !enabled.has(assignedLayer) || production.only && production.only !== assignedLayer)) {
      if (!assignedLayer || !names.has(assignedLayer)) productionFilter.unassigned++;
      else if (!enabled.has(assignedLayer)) productionFilter.excluded++;
      else productionFilter.otherLayers++;
      continue;
    }
    const productionLayer = assignedLayer ? names.get(assignedLayer) : undefined;
    try {
      const result = cadShapeDxfGeometry(editor, shape, settings);
      const source = result.entities ?? (result.entity ? [result.entity] : []);
      if (source.length) {
        // Treat every contour of an object as one unit. A failed hole must not
        // leave its exterior in the cutting file on its own.
        const rgb = options.colorLayers || production?.preserveColors ? cuttingColor(shape) : undefined;
        let outputVertices = vertices;
        const output = source.map(original => {
          const entity = original.type === 'spline' && options.curves === 'polyline'
            ? flattenForDxf(original.contour, tolerance) : original;
          outputVertices += dxfVertexCount(entity);
          if (outputVertices > MAX_VERTICES) throw new CadDxfError('limit');
          return rgb || productionLayer ? { ...entity, ...(rgb ? { rgb } : {}), ...(productionLayer ? { productionLayer } : {}) } : entity;
        });
        entities.push(...output);
        vertices = outputVertices;
      } else omitted.push({ id: shape.id, name: drawingObjectName(shape), reason: result.reason ?? 'unsupported' });
    } catch (error) {
      if (error instanceof CadDxfError && error.code === 'limit') throw error;
      omitted.push({ id: shape.id, name: drawingObjectName(shape), reason: 'invalid' });
    }
    if (entities.length > MAX_ENTITIES) throw new CadDxfError('limit');
  }
  const filteredByLayer = productionFilter.unassigned + productionFilter.excluded + productionFilter.otherLayers;
  const layerReport = production ? { filteredByLayer, productionFilter } : {};
  if (!entities.length) {
    if (!omitted.length && !filteredByLayer) throw new CadDxfError('empty');
    return { text: '', widthMm: 0, heightMm: 0, entities: 0, closedContours: 0, openContours: 0, omitted, layers: [], sharedEdges: 0, passesRemoved: 0, ...layerReport };
  }
  let output = { entities, sharedEdges: 0, passesRemoved: 0 };
  if (options.commonLines) {
    try { output = buildDxfCommonLines(entities); }
    catch (error) {
      if (error instanceof DxfCommonLineLimitError) throw new CadDxfError('common-lines-limit');
      throw error;
    }
  }
  const dxf = serializeCadDxf(output.entities, options);
  const closedContours = output.entities.filter(e => e.type === 'circle' || e.type === 'ellipse' || e.type === 'polyline' && e.closed || e.type === 'spline' && e.contour.closed).length;
  return { ...dxf, ...layerReport, entities: output.entities.length, closedContours, openContours: output.entities.length - closedContours, omitted,
    sharedEdges: output.sharedEdges, passesRemoved: output.passesRemoved };
}

const rgbNumber = (hex: string) => parseInt(hex.slice(1), 16);
const fallbackColors = Array.from({ length: 9 }, (_, i) => rgbNumber(dxfColor(-1, i + 1)));
function fallbackColorIndex(rgb: number) {
  let index = 7, best = Infinity;
  // Indexed-only viewers still get a basic color. Index 7 adapts to their background.
  if (rgb === 0xffffff) return 7;
  for (const [i, color] of fallbackColors.entries()) {
    const distance = [16, 8, 0].reduce((sum, shift) => sum + (((rgb >> shift) & 255) - ((color >> shift) & 255)) ** 2, 0);
    if (distance < best) { index = i + 1; best = distance; }
  }
  return index;
}

/** R2000 by default, R2004 when exact RGB is requested. */
export function serializeCadDxf(
  entities: DxfEntity[],
  { colorLayers = false, includePreview = false, productionLayers }: Pick<CadDxfOptions, 'colorLayers' | 'includePreview' | 'productionLayers'> = {},
): Pick<CadDxfResult, 'text' | 'widthMm' | 'heightMm' | 'layers' | 'preview' | 'cutLengths'> {
  if (!entities.length) throw new CadDxfError('empty');
  if (entities.length > MAX_ENTITIES) throw new CadDxfError('limit');
  const preserveProductionColors = productionLayers?.preserveColors === true;
  let nextHandle = 0x100, vertexCount = 0;
  const previewSources: DxfPreviewSource[] | undefined = includePreview ? [] : undefined;
  const parts: string[] = [], body: string[] = [];
  const layers = new Map<string, CadDxfLayer>(
    ['0', 'OMS_CLOSED', 'OMS_OPEN'].map(name => [name, { name, entities: 0 }]),
  );
  const add = (out: string[], ...pairs: (string | number)[]) => {
    for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), typeof pairs[i + 1] === 'number' ? number(pairs[i + 1] as number) : pairs[i + 1] as string);
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const bound = (x: number, y: number) => { finite(x); finite(y); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  const startEntity = (type: string, subclass: string, closed: boolean, original: DxfEntity) => {
    const base = original.commonLine ? 'OMS_SHARED' : closed ? 'OMS_CLOSED' : 'OMS_OPEN';
    const rgb = (original.productionLayer ? preserveProductionColors : colorLayers) ? original.rgb?.toUpperCase() : undefined;
    if (rgb !== undefined && !/^#[0-9A-F]{6}$/.test(rgb)) throw new CadDxfError('invalid');
    if (original.productionLayer && !/^OMS_JOB_[A-Z0-9_]+$/.test(original.productionLayer)) throw new CadDxfError('invalid');
    const name = original.productionLayer ?? (rgb ? `${base}_${rgb.slice(1)}` : base);
    const layer = layers.get(name) ?? { name, rgb: original.productionLayer ? undefined : rgb, entities: 0 };
    layer.entities++;
    layers.set(name, layer);
    add(body, 0, type, 5, (nextHandle++).toString(16).toUpperCase(), 330, '1F', 100, 'AcDbEntity', 8, name);
    if (rgb) {
      const color = rgbNumber(rgb);
      if (original.productionLayer) add(body, 62, fallbackColorIndex(color));
      add(body, 420, color);
    }
    add(body, 100, subclass);
    return layer;
  };
  for (const original of entities) {
    let e = original.type === 'polyline' ? checkedPolyline(original.points, original.closed) : original;
    if (e.type === 'spline' && !validContours([e.contour])) throw new CadDxfError('invalid');
    vertexCount += dxfVertexCount(e);
    if (vertexCount > MAX_VERTICES) throw new CadDxfError('limit');
    let layer: CadDxfLayer;
    if (e.type === 'spline') {
      const contour = e.contour;
      const segments = [...contourSegments(contour)], controls = [contour.nodes[0], ...segments.flatMap(p => p.slice(1))];
      const knots = [0, 0, 0, 0];
      for (let i = 1; i < segments.length; i++) knots.push(i, i, i);
      knots.push(segments.length, segments.length, segments.length, segments.length);
      layer = startEntity('SPLINE', 'AcDbSpline', contour.closed, original);
      add(body, 210, 0, 220, 0, 230, 1, 70, contour.closed ? 9 : 8, 71, 3, 72, knots.length, 73, controls.length, 74, 0);
      for (const knot of knots) add(body, 40, knot);
      for (const p of controls) add(body, 10, p.x, 20, p.y, 30, 0);
      const b = curveBounds([contour]); bound(b.x, b.y); bound(b.x + b.w, b.y + b.h);
    } else if (e.type === 'polyline') {
      if (e.points.length === 2 && !e.closed) {
        layer = startEntity('LINE', 'AcDbLine', false, original);
        add(body, 10, e.points[0].x, 20, e.points[0].y, 30, 0, 11, e.points[1].x, 21, e.points[1].y, 31, 0);
      } else {
        layer = startEntity('LWPOLYLINE', 'AcDbPolyline', e.closed, original); add(body, 90, e.points.length, 70, e.closed ? 1 : 0);
        for (const p of e.points) add(body, 10, p.x, 20, p.y);
      }
      for (const p of e.points) bound(p.x, p.y);
    } else if (e.type === 'circle' || e.type === 'arc') {
      validPoint(e.center); positive(e.radius);
      layer = startEntity(e.type === 'circle' ? 'CIRCLE' : 'ARC', 'AcDbCircle', e.type === 'circle', original);
      add(body, 10, e.center.x, 20, e.center.y, 30, 0, 40, e.radius);
      if (e.type === 'arc') {
        const start = normAngle(finite(e.start)), end = normAngle(finite(e.end));
        if (Math.abs(start - end) < 1e-9) throw new CadDxfError('invalid');
        add(body, 100, 'AcDbArc', 50, start, 51, end);
        const sweep = normAngle(end - start);
        for (const a of [start, end, 0, 90, 180, 270]) if (a === start || a === end || normAngle(a - start) <= sweep) {
          bound(e.center.x + e.radius * Math.cos(a * Math.PI / 180), e.center.y + e.radius * Math.sin(a * Math.PI / 180));
        }
        if (previewSources) e = { ...e, start, end };
      } else { bound(e.center.x - e.radius, e.center.y - e.radius); bound(e.center.x + e.radius, e.center.y + e.radius); }
    } else {
      validPoint(e.center); validPoint(e.major); positive(Math.hypot(e.major.x, e.major.y));
      if (!Number.isFinite(e.ratio) || e.ratio <= 0 || e.ratio > 1) throw new CadDxfError('invalid');
      layer = startEntity('ELLIPSE', 'AcDbEllipse', true, original);
      add(body, 10, e.center.x, 20, e.center.y, 30, 0, 11, e.major.x, 21, e.major.y, 31, 0, 40, e.ratio, 41, 0, 42, Math.PI * 2);
      const dx = Math.hypot(e.major.x, e.major.y * e.ratio), dy = Math.hypot(e.major.y, e.major.x * e.ratio);
      bound(e.center.x - dx, e.center.y - dy); bound(e.center.x + dx, e.center.y + dy);
    }
    previewSources?.push({ entity: e, layer, rgb: original.productionLayer && preserveProductionColors ? original.rgb?.toUpperCase() : undefined });
  }
  const layerEntries = [...layers.values()];
  add(parts, 0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, colorLayers || preserveProductionColors ? 'AC1018' : 'AC1015', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1,
    9, '$LUNITS', 70, 2, 9, '$LUPREC', 70, 6, 9, '$HANDSEED', 5, (nextHandle + layerEntries.length - 3).toString(16).toUpperCase(),
    9, '$EXTMIN', 10, minX, 20, minY, 30, 0, 9, '$EXTMAX', 10, maxX, 20, maxY, 30, 0, 0, 'ENDSEC');
  add(parts, 0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 5, '10', 330, '0', 100, 'AcDbSymbolTable', 70, 1,
    0, 'LTYPE', 5, '11', 330, '10', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB',
    0, 'TABLE', 2, 'LAYER', 5, '12', 330, '0', 100, 'AcDbSymbolTable', 70, layerEntries.length);
  for (const [i, { name, rgb }] of layerEntries.entries()) {
    const handle = i < 3 ? 0x13 + i : nextHandle + i - 3;
    const exact = rgb === undefined ? undefined : rgbNumber(rgb);
    const indexed = exact === undefined ? (name === 'OMS_OPEN' ? 3 : name === 'OMS_SHARED' ? 6 : 7) : fallbackColorIndex(exact);
    add(parts, 0, 'LAYER', 5, handle.toString(16).toUpperCase(), 330, '12', 100, 'AcDbSymbolTableRecord', 100,
      'AcDbLayerTableRecord', 2, name, 70, 0, 62, indexed);
    if (exact !== undefined) add(parts, 420, exact);
    add(parts, 6, 'CONTINUOUS');
  }
  add(parts, 0, 'ENDTAB', 0, 'TABLE', 2, 'BLOCK_RECORD', 5, '1E', 330, '0', 100, 'AcDbSymbolTable', 70, 2);
  for (const [handle, name] of [['1F', '*Model_Space'], ['20', '*Paper_Space']]) add(parts, 0, 'BLOCK_RECORD', 5, handle, 330, '1E', 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, name, 70, 0);
  add(parts, 0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'BLOCKS');
  for (const [owner, name, start, end] of [['1F', '*Model_Space', '21', '22'], ['20', '*Paper_Space', '23', '24']]) add(parts,
    0, 'BLOCK', 5, start, 330, owner, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, name, 70, 0, 10, 0, 20, 0, 30, 0, 3, name, 1, '',
    0, 'ENDBLK', 5, end, 330, owner, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd');
  add(parts, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const footer: string[] = [];
  add(footer, 0, 'ENDSEC', 0, 'EOF');
  const text = [parts, body, footer].map(section => section.join('\r\n')).join('\r\n') + '\r\n';
  if (text.length > 16_000_000) throw new CadDxfError('limit');
  const result = { text, widthMm: maxX - minX, heightMm: maxY - minY, layers: layerEntries.filter(layer => layer.entities > 0) };
  if (!previewSources) return result;
  return { ...result, preview: buildDxfPreview(previewSources, { minX, minY, maxX, maxY }), cutLengths: measureDxfCutLengths(previewSources) };
}
