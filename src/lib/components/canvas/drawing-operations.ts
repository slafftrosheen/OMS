import { Box, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { getCadShapePageBounds } from './cad-bounds';
import { curveBounds, mapContours } from './cad-curves';
import { CAD_APPEARANCE_TYPES, cadAppearanceGeometry, cadPaintHasFill, cadPaintHasStroke, cadShapePaint } from './cad-shape-appearance';

const NAME_KEY = 'omsObjectName';
const ORDER_FORMS = new Set(['order-details', 'order-address', 'profile-7st']);
const ARTWORK_TYPES = new Set(['geo', 'draw', 'highlight', 'line', 'arrow', 'text', 'note', 'image', 'cad-bezier', 'cad-path', 'cad-ellipse', 'cad-arc', 'cad-dimension']);
export const MAX_REPEAT_SHAPES = 500;
export const MAX_EXPORT_PIXELS = 32_000_000;
export const MAX_EXPORT_SIDE = 8192;

/** Read only the PNG header: browsers may clamp raster output below the requested size. */
export async function drawingPngSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length !== 24 || signature.some((value, index) => bytes[index] !== value)) throw new Error('Invalid PNG');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452) throw new Error('Invalid PNG header');
  const width = header.getUint32(16), height = header.getUint32(20);
  if (!width || !height) throw new Error('Empty PNG');
  return { width, height };
}

export function drawingObjectName(shape: TLShape): string {
  const alias = shape.meta?.[NAME_KEY];
  const props = shape.props as Record<string, unknown>;
  return (typeof alias === 'string' && alias.trim() ? alias : String(props.title || props.name || props.text || (shape.type === 'geo' ? props.geo : shape.type))).slice(0, 90);
}
export function drawingObjectAlias(shape: TLShape): string {
  return typeof shape.meta?.[NAME_KEY] === 'string' ? String(shape.meta[NAME_KEY]) : '';
}
export function renameDrawingObject(editor: Editor, id: TLShapeId, name: string): boolean {
  const shape = editor.getShape(id);
  if (!shape || editor.getInstanceState().isReadonly || name.length > 80 ||
      [...editor.getShapeAndDescendantIds([id])].some(child => editor.isShapeOrAncestorLocked(child))) return false;
  const value = name.trim();
  if (value === drawingObjectAlias(shape)) return true;
  const meta = { ...shape.meta };
  if (value) meta[NAME_KEY] = value; else delete meta[NAME_KEY];
  // Never rename props.title/text/name: those belong to order data or artwork.
  return drawingTransaction(editor, () => { editor.updateShapes([{ id, type: shape.type, meta }]); });
}

export interface RepeatGridOptions {
  rows: number;
  columns: number;
  gapX: number;
  gapY: number;
  spacing?: 'gap' | 'offset';
  directionX?: 1 | -1;
  directionY?: 1 | -1;
}
export type DrawingOperationError = 'selectionRequired' | 'selectionChanged' | 'repeatProtected' | 'repeatLimit' | 'invalidOptions' | 'exportEmpty' | 'exportTooLarge' | 'changedFailed';
type Result<T> = { ok: true; value: T } | { ok: false; error: DrawingOperationError };
type RepeatBounds = { x: number; y: number; w: number; h: number };
export interface RepeatGridPlan {
  revision: string;
  selected: TLShapeId[];
  roots: TLShapeId[];
  options: RepeatGridOptions;
  bounds: RepeatBounds;
  offsets: Array<{ x: number; y: number }>;
  generated: number;
}

/** Preview and apply use a document revision, so geometry and selection
 * cannot silently change between review and mutation. Camera movement is harmless. */
export function repeatDrawingRevision(editor: Editor): string {
  return JSON.stringify([editor.getCurrentPageId(), editor.getCurrentPageShapesSorted(), editor.getSelectedShapeIds()]);
}

function topLevelIds(editor: Editor, ids: readonly TLShapeId[]): TLShapeId[] {
  const selected = new Set(ids);
  return [...selected].filter(id => {
    let parent = editor.getShape(id)?.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      if (selected.has(parent as TLShapeId)) return false;
      seen.add(parent); parent = editor.getShape(parent as TLShapeId)?.parentId;
    }
    return true;
  });
}

export function prepareRepeatGrid(editor: Editor, options: RepeatGridOptions, expectedIds: readonly TLShapeId[]): Result<RepeatGridPlan> {
  const { rows, columns, gapX, gapY, spacing = 'gap', directionX = 1, directionY = 1 } = options;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows > 20 || columns > 20 || rows * columns < 2 ||
      !Number.isFinite(gapX) || !Number.isFinite(gapY) || Math.abs(gapX) > 10_000 || Math.abs(gapY) > 10_000 ||
      !['gap', 'offset'].includes(spacing) || ![1, -1].includes(directionX) || ![1, -1].includes(directionY) ||
      (spacing === 'offset' && (gapX < 0 || gapY < 0))) return { ok: false, error: 'invalidOptions' };
  if (!expectedIds.length) return { ok: false, error: 'selectionRequired' };
  const current = editor.getSelectedShapeIds();
  if (current.length !== expectedIds.length || !current.every(id => expectedIds.includes(id))) return { ok: false, error: 'selectionChanged' };
  const roots = topLevelIds(editor, expectedIds);
  const descendants = [...editor.getShapeAndDescendantIds(roots)];
  if (editor.getInstanceState().isReadonly || descendants.some(id => {
    const shape = editor.getShape(id);
    if (!shape || (shape.type !== 'group' && !ARTWORK_TYPES.has(shape.type)) || editor.isShapeOrAncestorLocked(shape) || editor.getShapeMask(id)) return true;
    let parent = editor.getShape(shape.parentId as TLShapeId);
    const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      if (ORDER_FORMS.has(parent.type)) return true;
      seen.add(parent.id); parent = editor.getShape(parent.parentId as TLShapeId);
    }
    return false;
  })) return { ok: false, error: 'repeatProtected' };
  const copies = rows * columns - 1, generated = copies * descendants.length;
  if (generated > MAX_REPEAT_SHAPES || generated + editor.getCurrentPageShapeIds().size > editor.options.maxShapesPerPage) return { ok: false, error: 'repeatLimit' };
  if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length +
      JSON.stringify(descendants.map(id => editor.getShape(id))).length * copies > 1_850_000) return { ok: false, error: 'repeatLimit' };
  const bounds = editor.getSelectionPageBounds();
  if (!bounds || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) || bounds.w < 0 || bounds.h < 0) return { ok: false, error: 'selectionRequired' };
  const stepX = (spacing === 'gap' ? bounds.w + gapX : gapX) * directionX;
  const stepY = (spacing === 'gap' ? bounds.h + gapY : gapY) * directionY;
  if (columns > 1 && Math.abs(stepX) < 1e-8 || rows > 1 && Math.abs(stepY) < 1e-8) return { ok: false, error: 'invalidOptions' };
  const offsets: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    if (row || column) offsets.push({ x: stepX * column, y: stepY * row });
  }
  if (offsets.some(offset => ![bounds.x + offset.x, bounds.x + bounds.w + offset.x,
      bounds.y + offset.y, bounds.y + bounds.h + offset.y].every(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000)))
    return { ok: false, error: 'invalidOptions' };
  for (const id of roots) {
    const shape = editor.getShape(id)!, origin = editor.getShapePageTransform(shape).point();
    for (const offset of offsets) {
      const target = { x: origin.x + offset.x, y: origin.y + offset.y };
      const local = editor.getPointInParentSpace(shape, target);
      if (![target.x, target.y, local.x, local.y].every(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000))
        return { ok: false, error: 'invalidOptions' };
    }
  }
  return { ok: true, value: { revision: repeatDrawingRevision(editor), selected: [...expectedIds], roots,
    options: { ...options }, bounds: {x:bounds.x,y:bounds.y,w:bounds.w,h:bounds.h}, offsets, generated } };
}

/** A complete reviewed grid is one undo operation; native duplication remaps
 * group ancestry and bindings for every copy of the original roots. */
export function applyRepeatGrid(editor: Editor, plan: RepeatGridPlan): Result<number> {
  if (plan.revision !== repeatDrawingRevision(editor)) return { ok: false, error: 'selectionChanged' };
  editor.complete(); editor.setCurrentTool('select');
  if (plan.revision !== repeatDrawingRevision(editor)) return { ok: false, error: 'selectionChanged' };
  const refreshed = prepareRepeatGrid(editor, plan.options, plan.selected);
  if (refreshed.ok === false) return refreshed;
  const fresh = refreshed.value;
  const descendants = editor.getShapeAndDescendantIds(fresh.roots).size;
  const camera = { ...editor.getCamera() };
  const success = drawingTransaction(editor, () => {
    const created: TLShapeId[] = [];
    for (const offset of fresh.offsets) {
      const before = new Set(editor.getCurrentPageShapeIds());
      editor.duplicateShapes(fresh.roots, offset);
      const copied = [...editor.getSelectedShapeIds()];
      if (editor.getCurrentPageShapeIds().size - before.size !== descendants ||
          copied.length !== fresh.roots.length || copied.some(id => before.has(id))) throw new Error('Incomplete grid copy');
      created.push(...copied);
    }
    if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new Error('Drawing payload limit');
    editor.setSelectedShapes([...fresh.roots, ...created]);
  });
  editor.setCamera(camera);
  return success ? { ok: true, value: fresh.generated } : { ok: false, error: 'changedFailed' };
}

export function repeatDrawingSelection(editor: Editor, options: RepeatGridOptions, expectedIds: readonly TLShapeId[]): Result<number> {
  const planned = prepareRepeatGrid(editor, options, expectedIds);
  return planned.ok === true ? applyRepeatGrid(editor, planned.value) : planned;
}

export interface DrawingExportOptions { scope: 'selected' | 'all'; scale: 1 | 2 | 4; background: boolean; padding: number; }
export interface DrawingExportPlan {
  ids: TLShapeId[]; omitted: number; width: number; height: number;
  bounds: { x: number; y: number; w: number; h: number };
  nativeScale: number;
}

/** Export frames include CAD paint, while native bounds remain geometric for
 * dimensions and snaps. Padding is additional user whitespace, not a hidden
 * allowance for a pen that might be much wider than the default padding. */
function drawingExportBounds(editor: Editor, shape: TLShape): Box | undefined {
  if (!CAD_APPEARANCE_TYPES.has(shape.type)) return editor.getShapeMaskedPageBounds(shape.id);
  const paint = cadShapePaint(shape), stroke = cadPaintHasStroke(paint);
  if (!stroke && !cadPaintHasFill(paint)) return;
  for (let ancestor: TLShape | undefined = shape; ancestor; ancestor = editor.getShape(ancestor.parentId)) {
    if (ancestor.opacity === 0) return;
  }
  let bounds: Box | undefined;
  try { cadAppearanceGeometry(shape); bounds = getCadShapePageBounds(editor, shape); }
  catch { bounds = editor.getShapePageBounds(shape); }
  if (!bounds) return;
  bounds = bounds.clone();
  if (stroke) {
    const props = shape.props as any;
    const joins = shape.type === 'cad-bezier' ? props.contours.some((c: any) => c.closed || c.nodes.length > 2)
      : shape.type === 'cad-path' && (props.closed || props.points.length > 2);
    // A disk bounds round/bevel joins. Square caps can project sqrt(2) radii
    // onto an axis; miter joins are conservatively bounded by their limit.
    const reach = Math.max(paint.lineCap === 'square' ? Math.SQRT2 : 1,
      joins && paint.lineJoin === 'miter' ? paint.miterLimit : 1) * paint.strokeWidth / 2;
    bounds.expandBy(reach);
  }
  const intersect = (clip: { x: number; y: number; w: number; h: number }) => {
    const x = Math.max(bounds!.x, clip.x), y = Math.max(bounds!.y, clip.y);
    const right = Math.min(bounds!.maxX, clip.x + clip.w), bottom = Math.min(bounds!.maxY, clip.y + clip.h);
    if (right < x || bottom < y) return false;
    bounds = new Box(x, y, right - x, bottom - y); return true;
  };
  const matrix = editor.getShapePageTransform(shape);
  for (const clip of paint.clips ?? []) {
    if (!intersect(curveBounds(mapContours(clip.contours, point => matrix.applyToPoint(point))))) return;
  }
  const mask = editor.getShapeMask(shape.id);
  if (mask && (!mask.length || !intersect(Box.FromPoints(mask)))) return;
  return bounds;
}

export function planDrawingExport(editor: Editor, format: 'svg' | 'png', options: DrawingExportOptions): Result<DrawingExportPlan> {
  if (!['selected', 'all'].includes(options.scope) || ![1, 2, 4].includes(options.scale) || typeof options.background !== 'boolean' ||
      !Number.isFinite(options.padding) || options.padding < 0 || options.padding > 1000) return { ok: false, error: 'invalidOptions' };
  const candidates = options.scope === 'selected' ? [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])] : [...editor.getCurrentPageShapeIds()];
  const ids: TLShapeId[] = [];
  let omitted = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of candidates) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    if (!ARTWORK_TYPES.has(shape.type)) { if (shape.type !== 'group') omitted++; continue; }
    const bounds = drawingExportBounds(editor, shape);
    if (!bounds) continue;
    ids.push(id); minX = Math.min(minX, bounds.x); minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w); maxY = Math.max(maxY, bounds.y + bounds.h);
  }
  if (!ids.length) return { ok: false, error: 'exportEmpty' };
  const scale = format === 'png' ? options.scale : 1;
  const width = Math.ceil((maxX - minX + options.padding * 2) * scale);
  const height = Math.ceil((maxY - minY + options.padding * 2) * scale);
  if (![width, height].every(value => Number.isFinite(value) && value > 0) ||
      format === 'png' && (width > MAX_EXPORT_SIDE || height > MAX_EXPORT_SIDE || width * height > MAX_EXPORT_PIXELS)) return { ok: false, error: 'exportTooLarge' };
  return { ok: true, value: { ids, omitted, width, height, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    // tldraw 2.4 exportToBlob rasterizes its SVG at a fixed 2× scale. Divide
    // here so the UI's 1×/2×/4× are the actual PNG output dimensions.
    nativeScale: format === 'png' ? options.scale / 2 : 1 } };
}

