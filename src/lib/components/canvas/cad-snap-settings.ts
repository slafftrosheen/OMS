import { react, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { drawingGridVisible } from './drawing-grid-state';
import { drawingTransaction } from './drawing-commands';
import { hasCanvasDraft } from './canvas-document';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';

export interface CadSnapSettings {
  objects: boolean;
  endpoints: boolean; midpoints: boolean; centers: boolean; quadrants: boolean;
  intersections: boolean; perpendicular: boolean; tangent: boolean; guidelines: boolean; nearest: boolean; grid: boolean;
  /** Screen pixels, independent of camera zoom and drawing units. */
  tolerance: number;
  /** Canvas units, shared with tldraw's displayed grid and object movement. */
  gridSpacing: number;
}
export const DEFAULT_CAD_SNAP_SETTINGS: CadSnapSettings = {
  objects: true,
  endpoints: true, midpoints: false, centers: true, quadrants: true,
  intersections: false, perpendicular: false, tangent: false, guidelines: true, nearest: false, grid: false, tolerance: 8, gridSpacing: 10,
};
const switches = ['objects', 'endpoints', 'midpoints', 'centers', 'quadrants', 'intersections', 'perpendicular', 'tangent', 'guidelines', 'nearest', 'grid'] as const;

function savedSnapTargets(editor: Editor) {
  const saved = editor.getCurrentPage().meta.omsCadSnap;
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : undefined;
}

export function readCadSnapSettings(editor: Editor): CadSnapSettings {
  const saved = savedSnapTargets(editor), result = { ...DEFAULT_CAD_SNAP_SETTINGS };
  if (saved) {
    for (const key of switches) if (typeof saved[key] === 'boolean') result[key] = saved[key];
    if (typeof saved.tolerance === 'number' && Number.isFinite(saved.tolerance) && saved.tolerance >= 2 && saved.tolerance <= 30) result.tolerance = saved.tolerance;
  }
  const grid = editor.getDocumentSettings?.().gridSize;
  if (Number.isFinite(grid) && grid >= 0.01 && grid <= 1_000_000) result.gridSpacing = grid;
  return result;
}

/** Connect the per-page targets to native Pick, Resize and handle snapping. */
export function installDrawingSnapTargets(editor: Editor): () => void {
  const snaps = editor.snaps, handles = snaps.handles;
  const originalShapes = snaps.getSnappableShapes, originalHandle = handles.snapHandle;
  const empty = new Set<TLShapeId>();
  const shapes: typeof originalShapes = () => savedSnapTargets(editor)?.objects === false ? empty : originalShapes.call(snaps);
  const handle: typeof originalHandle = input => savedSnapTargets(editor)?.objects === false ? null : originalHandle.call(handles, input);
  snaps.getSnappableShapes = shapes;
  handles.snapHandle = handle;
  drawingGridVisible(editor);
  const untrack = react('Drawing grid snapping', () => {
    const grid = editor.user.getIsSnapMode() && readCadSnapSettings(editor).grid;
    if (editor.getInstanceState().isGridMode !== grid) editor.updateInstanceState({ isGridMode: grid });
  }, { scheduleEffect: queueMicrotask });
  return () => {
    untrack();
    if (snaps.getSnappableShapes === shapes) snaps.getSnappableShapes = originalShapes;
    if (handles.snapHandle === handle) handles.snapHandle = originalHandle;
  };
}

export function canWriteCadSnapSettings(editor: Editor): boolean {
  return !editor.getInstanceState().isReadonly && !editor.inputs?.isPointing && !editor.inputs?.isDragging &&
    !hasCanvasDraft(editor) && !isDrawingPointerGestureActive(editor);
}

/** Target choices belong to the page; grid size belongs to the document, as in
 * the native grid renderer. Both writes use one real undo transaction. */
export function writeCadSnapSettings(editor: Editor, patch: Partial<CadSnapSettings>): boolean {
  if (!canWriteCadSnapSettings(editor) || !Object.keys(patch).length ||
    Object.keys(patch).some(key => ![...switches, 'tolerance', 'gridSpacing'].includes(key as any))) return false;
  for (const key of switches) if (key in patch && typeof patch[key] !== 'boolean') return false;
  if ('tolerance' in patch && (!Number.isFinite(patch.tolerance) || patch.tolerance! < 2 || patch.tolerance! > 30)) return false;
  if ('gridSpacing' in patch && (!Number.isFinite(patch.gridSpacing) || patch.gridSpacing! < 0.01 || patch.gridSpacing! > 1_000_000)) return false;
  const current = readCadSnapSettings(editor), next = { ...current, ...patch };
  if (Object.keys(patch).every(key => next[key] === current[key])) return true;
  const { gridSpacing, ...targets } = next, page = editor.getCurrentPage();
  return drawingTransaction(editor, () => {
    if (gridSpacing !== current.gridSpacing) editor.store.put([{ ...editor.getDocumentSettings(), gridSize: gridSpacing }]);
    editor.updatePage({ id: page.id, meta: { ...page.meta, omsCadSnap: targets } });
    const stored = readCadSnapSettings(editor);
    if (Object.keys(patch).some(key => stored[key] !== next[key])) throw new Error('snap-settings-refused');
  });
}
