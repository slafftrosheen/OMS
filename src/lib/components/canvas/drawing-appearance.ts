import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { curveBounds, validContours } from './cad-curves';
import { transformAppearance } from './cad-appearance';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { vectorPaint, paintMetadata } from './cad-vector';
import { drawingTransaction } from './drawing-commands';
import { drawingObjectName } from './drawing-operations';

export interface DrawingAppearanceFields { fill: boolean; outline: boolean; opacity: boolean }
export type DrawingAppearanceError = 'sourceRequired' | 'noClipboard' | 'targetRequired' | 'protected' | 'incompatible' | 'fieldsRequired' | 'selectionChanged' | 'saveLimit' | 'failed';
export type DrawingAppearanceResult = { ok: true; count: number } | { ok: false; error: DrawingAppearanceError };
export interface DrawingAppearance {
  readonly name: string;
  readonly kind: 'native' | 'curve';
  readonly available: DrawingAppearanceFields;
  readonly opacity: number;
  readonly native?: Record<string, string>;
  readonly paint?: VectorPaint;
  readonly bounds?: { x: number; y: number; w: number; h: number };
}
const nativeTypes = new Set(['geo', 'draw', 'highlight', 'line', 'arrow', 'text']);
const outlineTypes = new Set(['geo', 'draw', 'highlight', 'line', 'arrow']);
const clipboards = new WeakMap<Editor, DrawingAppearance>();
const listeners = new WeakMap<Editor, Set<() => void>>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
export function getDrawingAppearance(editor: Editor): DrawingAppearance | null { return clipboards.get(editor) ?? null; }
export function subscribeDrawingAppearance(editor: Editor, listener: () => void) {
  let set = listeners.get(editor); if (!set) listeners.set(editor, set = new Set());
  set.add(listener); return () => { set!.delete(listener); };
}
function capture(shape: TLShape): DrawingAppearance {
  const props = shape.props as any, opacity = shape.opacity ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('sourceRequired');
  if (shape.type === 'cad-bezier') {
    if (!validContours(props.contours) || shape.meta.omsVectorPaint && !validVectorPaint(shape.meta.omsVectorPaint as any)) throw new Error('sourceRequired');
    const paint = vectorPaint(shape.meta, props.color);
    // Paint clipboard never carries object clipping or embedded/private artwork.
    const canFill = !paint.raster;
    delete paint.clips; delete paint.raster;
    return { name: drawingObjectName(shape), kind: 'curve', paint, bounds: curveBounds(props.contours), opacity,
      available: { fill: canFill, outline: true, opacity: true } };
  }
  if (!nativeTypes.has(shape.type)) throw new Error('sourceRequired');
  const native: Record<string, string> = {};
  for (const key of ['color', 'fill', ...(outlineTypes.has(shape.type) ? ['dash', 'size'] : [])])
    if (typeof props[key] === 'string') native[key] = props[key];
  return { name: drawingObjectName(shape), kind: 'native', native, opacity,
    available: { fill: 'color' in native || 'fill' in native, outline: 'dash' in native || 'size' in native, opacity: true } };
}
export function canCopyDrawingAppearance(editor: Editor): boolean {
  try { const shape = editor.getOnlySelectedShape(); if (!shape) return false; capture(shape); return true; } catch { return false; }
}
/** Copy is read-only, including locked reference artwork. No shape ids, fonts,
 * text content, links, assets or geometries are retained in the clipboard. */
export function copyDrawingAppearance(editor: Editor): DrawingAppearanceResult {
  try {
    const shape = editor.getOnlySelectedShape(); if (!shape) return { ok: false, error: 'sourceRequired' };
    clipboards.set(editor, freeze(structuredClone(capture(shape))));
    listeners.get(editor)?.forEach(listener => listener());
    return { ok: true, count: 1 };
  } catch { return { ok: false, error: 'sourceRequired' }; }
}
function targets(editor: Editor): TLShape[] {
  if (editor.getInstanceState().isReadonly) throw new Error('protected');
  const selected = editor.getSelectedShapeIds(); if (!selected.length) throw new Error('targetRequired');
  const result: TLShape[] = [];
  for (const id of editor.getShapeAndDescendantIds(selected)) {
    const shape = editor.getShape(id);
    if (!shape || editor.isShapeOrAncestorLocked(shape)) throw new Error('protected');
    if (shape.type === 'group') continue;
    if (!nativeTypes.has(shape.type) && shape.type !== 'cad-bezier') throw new Error('incompatible');
    // Embedded order forms and frame descendants are never appearance targets.
    let parent = editor.getShape(shape.parentId as TLShapeId); const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      if (parent.type !== 'group') throw new Error('incompatible');
      seen.add(parent.id); parent = editor.getShape(parent.parentId as TLShapeId);
    }
    result.push(shape);
  }
  if (!result.length) throw new Error('targetRequired');
  return result;
}
function updateFor(shape: TLShape, source: DrawingAppearance, fields: DrawingAppearanceFields) {
  const update: any = { id: shape.id, type: shape.type }, props = shape.props as any;
  if (fields.opacity) update.opacity = source.opacity;
  if (!fields.fill && !fields.outline) return update;
  if (source.kind === 'curve') {
    if (shape.type !== 'cad-bezier' || !validContours(props.contours) ||
      shape.meta.omsVectorPaint && !validVectorPaint(shape.meta.omsVectorPaint as any)) throw new Error('incompatible');
    const paint = vectorPaint(shape.meta, props.color), copied = source.paint!;
    if (fields.fill) {
      if (paint.raster || !source.available.fill) throw new Error('incompatible');
      if ((copied.gradient || copied.fill !== 'none') && props.contours.some((c: any) => !c.closed)) throw new Error('incompatible');
      paint.fill = copied.fill; paint.fillOpacity = copied.fillOpacity;
      delete paint.gradient;
      if (copied.gradient) {
        const a = source.bounds!, b = curveBounds(props.contours);
        if (Math.min(a.w, a.h, b.w, b.h) <= 0) throw new Error('incompatible');
        // Both matrices are object-local. Page translation, rotation and group
        // transforms must not enter this fit-to-object mapping.
        const sx = b.w / a.w, sy = b.h / a.h;
        paint.gradient = transformAppearance({ gradient: structuredClone(copied.gradient) },
          [sx, 0, 0, sy, b.x - a.x * sx, b.y - a.y * sy]).gradient;
      }
    }
    if (fields.outline) for (const key of ['stroke', 'strokeWidth', 'strokeOpacity', 'lineCap', 'lineJoin', 'miterLimit', 'dash', 'dashOffset'] as const)
      (paint as any)[key] = structuredClone(copied[key]);
    if (!validVectorPaint(paint)) throw new Error('incompatible');
    update.meta = { ...shape.meta, omsVectorPaint: paintMetadata(paint) };
  } else {
    if (!nativeTypes.has(shape.type)) throw new Error('incompatible');
    const patch: Record<string, string> = {}, native = source.native!;
    if (fields.fill) {
      for (const key of ['color', 'fill']) if (key in native && key in props) patch[key] = native[key];
      if (!Object.keys(patch).length) throw new Error('incompatible');
    }
    if (fields.outline) {
      if (!outlineTypes.has(shape.type)) throw new Error('incompatible');
      const keys = ['dash', 'size'].filter(key => key in native && key in props);
      if (!keys.length) throw new Error('incompatible');
      keys.forEach(key => { patch[key] = native[key]; });
    }
    update.props = patch;
  }
  return update;
}
function prepare(editor: Editor, fields?: DrawingAppearanceFields) {
  const source = getDrawingAppearance(editor); if (!source) throw new Error('noClipboard');
  const chosen = fields ?? source.available;
  if (!chosen.fill && !chosen.outline && !chosen.opacity) throw new Error('fieldsRequired');
  if (Object.keys(chosen).some(key => chosen[key as keyof DrawingAppearanceFields] && !source.available[key as keyof DrawingAppearanceFields])) throw new Error('incompatible');
  const shapes = targets(editor), updates = shapes.map(shape => updateFor(shape, source, chosen));
  const changed = updates.filter((u, i) => !same(u.props ?? {}, Object.fromEntries(Object.keys(u.props ?? {}).map(k => [k, (shapes[i].props as any)[k]]))) ||
    u.meta && !same(u.meta, shapes[i].meta) || u.opacity !== undefined && u.opacity !== shapes[i].opacity);
  return { shapes, updates: changed };
}
function errorResult(error: unknown): DrawingAppearanceResult {
  const message = error instanceof Error ? error.message : '';
  return { ok: false, error: ['sourceRequired', 'noClipboard', 'targetRequired', 'protected', 'incompatible', 'fieldsRequired', 'selectionChanged', 'saveLimit'].includes(message) ? message as DrawingAppearanceError : 'failed' };
}
export function inspectDrawingAppearanceTargets(editor: Editor, fields?: DrawingAppearanceFields): DrawingAppearanceResult {
  try { return { ok: true, count: prepare(editor, fields).shapes.length }; } catch (error) { return errorResult(error); }
}
/** Revalidate immediately before writing and verify every affected record. A
 * single rejected target rolls the whole edit back to its history boundary. */
export function applyDrawingAppearance(editor: Editor, fields?: DrawingAppearanceFields, expectedIds?: readonly TLShapeId[]): DrawingAppearanceResult {
  try {
    prepare(editor, fields);
    const ids = expectedIds ?? [...editor.getSelectedShapeIds()];
    editor.complete(); editor.setCurrentTool('select');
    const current = editor.getSelectedShapeIds();
    if (current.length !== ids.length || !current.every(id => ids.includes(id))) throw new Error('selectionChanged');
    const { shapes, updates } = prepare(editor, fields);
    if (!updates.length) return { ok: true, count: 0 };
    const expected = shapes.map(shape => {
      const patch = updates.find(u => u.id === shape.id);
      return patch ? { ...shape, ...patch, props: { ...shape.props, ...patch.props } } : shape;
    });
    const before = JSON.stringify(editor.store?.getStoreSnapshot() ?? editor.getCurrentPageShapesSorted()).length;
    const delta = expected.reduce((total, shape, i) => total + JSON.stringify(shape).length - JSON.stringify(shapes[i]).length, 0);
    if (delta > 0 && before + delta > 1_900_000) throw new Error('saveLimit');
    const applied = drawingTransaction(editor, () => {
      editor.updateShapes(updates);
      if (expected.some(shape => !same(editor.getShape(shape.id), shape))) throw new Error('failed');
    });
    return applied ? { ok: true, count: updates.length } : { ok: false, error: 'failed' };
  } catch (error) { return errorResult(error); }
}
