import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';

const NAME_KEY = 'omsObjectName';
const ORDER_FORMS = new Set(['order-details', 'order-address', 'profile-7st']);
const ARTWORK_TYPES = new Set(['geo', 'draw', 'highlight', 'line', 'arrow', 'text', 'note', 'image']);
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

export interface RepeatGridOptions { rows: number; columns: number; gapX: number; gapY: number; }
export type DrawingOperationError = 'selectionRequired' | 'selectionChanged' | 'repeatProtected' | 'repeatLimit' | 'invalidOptions' | 'exportEmpty' | 'exportTooLarge' | 'changedFailed';
type Result<T> = { ok: true; value: T } | { ok: false; error: DrawingOperationError };

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

export function repeatDrawingSelection(editor: Editor, options: RepeatGridOptions, expectedIds: readonly TLShapeId[]): Result<number> {
  const { rows, columns, gapX, gapY } = options;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows > 20 || columns > 20 || rows * columns < 2 ||
      !Number.isFinite(gapX) || !Number.isFinite(gapY) || Math.abs(gapX) > 10_000 || Math.abs(gapY) > 10_000) return { ok: false, error: 'invalidOptions' };
  if (!expectedIds.length) return { ok: false, error: 'selectionRequired' };
  editor.complete(); editor.setCurrentTool('select');
  const current = editor.getSelectedShapeIds();
  if (current.length !== expectedIds.length || !current.every(id => expectedIds.includes(id))) return { ok: false, error: 'selectionChanged' };
  const ids = topLevelIds(editor, expectedIds);
  const descendants = [...editor.getShapeAndDescendantIds(ids)];
  if (editor.getInstanceState().isReadonly || descendants.some(id => {
    const shape = editor.getShape(id); return !shape || ORDER_FORMS.has(shape.type) || editor.isShapeOrAncestorLocked(shape);
  })) return { ok: false, error: 'repeatProtected' };
  const copies = rows * columns - 1;
  const generated = copies * descendants.length;
  if (generated > MAX_REPEAT_SHAPES || generated + editor.getCurrentPageShapeIds().size > editor.options.maxShapesPerPage) return { ok: false, error: 'repeatLimit' };
  const bounds = editor.getSelectionPageBounds();
  if (!bounds) return { ok: false, error: 'selectionRequired' };
  const stepX = bounds.w + gapX, stepY = bounds.h + gapY;
  if (![stepX, stepY, stepX * columns, stepY * rows].every(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000)) return { ok: false, error: 'invalidOptions' };
  const camera = { ...editor.getCamera() };
  const success = drawingTransaction(editor, () => {
    const created: TLShapeId[] = [];
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      if (row === 0 && column === 0) continue;
      const before = editor.getCurrentPageShapeIds().size;
      // Native duplication remaps shape IDs, group ancestry and bindings within
      // each copy. Always duplicate the original immutable roots, not the last copy.
      editor.duplicateShapes(ids, { x: stepX * column, y: stepY * row });
      if (editor.getCurrentPageShapeIds().size - before !== descendants.length) throw new Error('Incomplete grid copy');
      created.push(...editor.getSelectedShapeIds());
    }
    editor.setSelectedShapes([...ids, ...created]);
  });
  editor.setCamera(camera);
  return success ? { ok: true, value: generated } : { ok: false, error: 'changedFailed' };
}

export interface DrawingExportOptions { scope: 'selected' | 'all'; scale: 1 | 2 | 4; background: boolean; padding: number; }
export interface DrawingExportPlan {
  ids: TLShapeId[]; omitted: number; width: number; height: number;
  bounds: { x: number; y: number; w: number; h: number };
  nativeScale: number;
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
    const bounds = editor.getShapeMaskedPageBounds(id);
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
