import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { getCadShapePageBounds } from './cad-bounds';
import { CAD_MAX_COORDINATE, canvasLengthToUnit, unitLengthToCanvas, validCadPoint, type CadPoint, type CadSettings } from './cad-settings';
import { arrangementRoots } from './drawing-arrange';
import { drawingTransaction } from './drawing-commands';
import { canWriteCadSnapSettings } from './cad-snap-settings';

export const DRAWING_DUPLICATE_META_KEY = 'omsDuplicate';
export const DEFAULT_DRAWING_DUPLICATE_OFFSET: Readonly<CadPoint> = { x: 24, y: 24 };
const MAX_DRAWING_BYTES = 1_900_000;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-7, Math.abs(b) * 1e-10);
const sameIds = (a: readonly TLShapeId[], b: readonly TLShapeId[]) =>
  a.length === b.length && new Set(a).size === a.length && a.every(id => b.includes(id));

/** Offsets are stored in page coordinates, independent of display units/zoom.
 * The property form presents CAD directions: positive X right, positive Y up. */
export function readDrawingDuplicateOffset(editor: Editor): CadPoint {
  const value = editor.getCurrentPage().meta[DRAWING_DUPLICATE_META_KEY] as { version?: unknown; x?: unknown; y?: unknown } | undefined;
  return value?.version === 1 && typeof value.x === 'number' && typeof value.y === 'number' && validCadPoint(value as CadPoint)
    ? { x: value.x, y: value.y } : { ...DEFAULT_DRAWING_DUPLICATE_OFFSET };
}

export function drawingDuplicateOffsetFromDisplay(value: CadPoint, settings: CadSettings | null): CadPoint | null {
  const limit = settings ? canvasLengthToUnit(CAD_MAX_COORDINATE, settings) : CAD_MAX_COORDINATE;
  if (![value.x, value.y].every(n => Number.isFinite(n) && Math.abs(n) <= limit)) return null;
  const convert = (n: number) => Math.max(-CAD_MAX_COORDINATE, Math.min(CAD_MAX_COORDINATE, settings ? unitLengthToCanvas(n, settings) : n));
  return { x: convert(value.x), y: -convert(value.y) };
}

export function drawingDuplicateOffsetToDisplay(offset: CadPoint, settings: CadSettings | null): CadPoint {
  const convert = (n: number) => settings ? canvasLengthToUnit(n, settings) : n;
  return { x: convert(offset.x), y: -convert(offset.y) };
}

interface DuplicateMemory {
  pageId: string;
  roots: TLShapeId[];
  offset: CadPoint;
  origins: CadPoint[];
  signature: string;
}
const memories = new WeakMap<Editor, DuplicateMemory>();

function shapeSignature(editor: Editor, roots: TLShapeId[]): string {
  const rootIds = new Set(roots);
  return JSON.stringify([...editor.getShapeAndDescendantIds(roots)].sort().map(id => {
    const shape = editor.getShape(id);
    // Only translation of the whole copied selection is repeatable here.
    // A resize, changed group membership, paint edit or rotation invalidates it.
    return shape && rootIds.has(id) ? { ...shape, x: 0, y: 0 } : shape;
  }));
}

export function writeDrawingDuplicateOffset(editor: Editor, offset: CadPoint): boolean {
  // An unfinished CAD tool can later bail to its own history mark. Saving a
  // separate page setting inside that draft would disappear on Escape.
  if (!canWriteCadSnapSettings(editor) || !validCadPoint(offset)) return false;
  const page = editor.getCurrentPage(), next = { version: 1, x: offset.x, y: offset.y };
  const meta = { ...page.meta, [DRAWING_DUPLICATE_META_KEY]: next };
  if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length +
      JSON.stringify(meta).length - JSON.stringify(page.meta).length > MAX_DRAWING_BYTES) return false;
  const changed = JSON.stringify(page.meta[DRAWING_DUPLICATE_META_KEY]) !== JSON.stringify(next);
  if (changed && !drawingTransaction(editor, () => {
    editor.updatePage({ id: page.id, meta });
    if (JSON.stringify(editor.getPage(page.id)?.meta[DRAWING_DUPLICATE_META_KEY]) !== JSON.stringify(next))
      throw new Error('Duplicate offset was not saved');
  })) return false;
  // Applying an explicit default must also stop a preceding Alt-drag repeat,
  // including when the saved offset already has the requested value.
  editor.updateInstanceState({ duplicateProps: null });
  memories.delete(editor);
  return true;
}

function offsetForSelection(editor: Editor, roots: TLShapeId[]): CadPoint {
  const native = editor.getInstanceState().duplicateProps;
  if (!native || !sameIds(native.shapeIds, roots) || !validCadPoint(native.offset)) return readDrawingDuplicateOffset(editor);
  const offset = { ...native.offset }, memory = memories.get(editor);
  if (!memory || memory.pageId !== editor.getCurrentPageId() || !sameIds(memory.roots, roots) ||
      !near(memory.offset.x, offset.x) || !near(memory.offset.y, offset.y) ||
      shapeSignature(editor, memory.roots) !== memory.signature) return offset;
  const deltas = memory.roots.map((id, index) => {
    const point = editor.getShapePageTransform(id).point(), previous = memory.origins[index];
    return { x: point.x - previous.x, y: point.y - previous.y };
  });
  if (deltas.length && deltas.every(delta => near(delta.x, deltas[0].x) && near(delta.y, deltas[0].y))) {
    // Corel-style: duplicate once, move the new copy, then Ctrl+D continues at
    // that new displacement. Non-translation changes retain the native offset.
    offset.x += deltas[0].x; offset.y += deltas[0].y;
  }
  return offset;
}

function validateCopy(editor: Editor, roots: TLShapeId[], offset: CadPoint): TLShape[] | null {
  if (!roots.length || !validCadPoint(offset) || editor.getInstanceState().isReadonly) return null;
  const currentPageIds = editor.getCurrentPageShapeIds();
  const descendants = [...editor.getShapeAndDescendantIds(roots)];
  if (!descendants.length || descendants.length + currentPageIds.size > editor.options.maxShapesPerPage) return null;
  const shapes: TLShape[] = [];
  for (const id of descendants) {
    const shape = editor.getShape(id);
    if (!shape || !currentPageIds.has(id) || editor.isShapeOrAncestorLocked(shape)) return null;
    const origin = editor.getShapePageTransform(shape).point();
    if (!validCadPoint({ x: origin.x + offset.x, y: origin.y + offset.y })) return null;
    if (shape.type !== 'group') {
      const bounds = getCadShapePageBounds(editor, shape);
      if (!bounds || bounds.w < 0 || bounds.h < 0 ||
          !validCadPoint({ x: bounds.x + offset.x, y: bounds.y + offset.y }) ||
          !validCadPoint({ x: bounds.maxX + offset.x, y: bounds.maxY + offset.y })) return null;
    }
    shapes.push(shape);
  }
  for (const id of roots) {
    const shape = editor.getShape(id)!, origin = editor.getShapePageTransform(shape).point();
    if (!validCadPoint(editor.getPointInParentSpace(shape, { x: origin.x + offset.x, y: origin.y + offset.y }))) return null;
  }
  if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length + JSON.stringify(shapes).length > MAX_DRAWING_BYTES) return null;
  return shapes;
}

/** Shared toolbar, Ctrl+D and in-place copy command. Native duplication keeps
 * editable groups, paint, assets and bindings; rejection cannot leave half a copy.
 * An explicit offset bypasses remembered displacement (e.g. numpad + at {0,0}). */
export function duplicateDrawingSelection(editor: Editor, explicitOffset?: CadPoint): boolean {
  if (editor.getInstanceState().isReadonly || !editor.getSelectedShapeIds().length) return false;
  editor.complete(); editor.setCurrentTool('select');
  let roots: TLShapeId[], offset: CadPoint, source: TLShape[];
  try {
    roots = arrangementRoots(editor);
    offset = explicitOffset ? { ...explicitOffset } : offsetForSelection(editor, roots);
    const checked = validateCopy(editor, roots, offset);
    if (!checked) return false;
    source = checked;
  } catch { return false; }
  const before = new Set(editor.getCurrentPageShapeIds()), camera = { ...editor.getCamera() };
  const previousDuplicate = editor.getInstanceState().duplicateProps;
  const origins = roots.map(id => editor.getShapePageTransform(id).point());
  const previousSelection = [...editor.getSelectedShapeIds()];
  let copies: TLShapeId[] = [];
  const success = drawingTransaction(editor, () => {
    editor.duplicateShapes(roots, offset);
    copies = [...editor.getSelectedShapeIds()];
    if (copies.length !== roots.length || copies.some(id => before.has(id)) ||
        editor.getCurrentPageShapeIds().size - before.size !== source.length)
      throw new Error('Incomplete duplicate');
    for (let index = 0; index < copies.length; index++) {
      const point = editor.getShapePageTransform(copies[index]).point();
      if (!near(point.x, origins[index].x + offset.x) || !near(point.y, origins[index].y + offset.y))
        throw new Error('Duplicate displacement was not applied');
    }
    if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > MAX_DRAWING_BYTES)
      throw new Error('Duplicate exceeds drawing capacity');
  });
  if (!success) {
    editor.setSelectedShapes(previousSelection);
    editor.updateInstanceState({ duplicateProps: previousDuplicate });
    editor.stopCameraAnimation(); editor.setCamera(camera);
    return false;
  }
  editor.updateInstanceState({ duplicateProps: { shapeIds: copies, offset } });
  memories.set(editor, { pageId: editor.getCurrentPageId(), roots: copies, offset: { ...offset },
    origins: copies.map(id => editor.getShapePageTransform(id).point()), signature: shapeSignature(editor, copies) });
  editor.focus();
  return true;
}

export { CAD_MAX_COORDINATE as MAX_DRAWING_DUPLICATE_OFFSET };
