import type { Editor } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';

export interface CadSnapSettings {
  endpoints: boolean; midpoints: boolean; centers: boolean; quadrants: boolean;
  intersections: boolean; perpendicular: boolean; tangent: boolean; nearest: boolean; grid: boolean;
  /** Screen pixels, independent of camera zoom and drawing units. */
  tolerance: number;
  /** Canvas units, shared with tldraw's displayed grid and object movement. */
  gridSpacing: number;
}
export const DEFAULT_CAD_SNAP_SETTINGS: CadSnapSettings = {
  endpoints: true, midpoints: false, centers: true, quadrants: true,
  intersections: false, perpendicular: false, tangent: false, nearest: false, grid: false, tolerance: 8, gridSpacing: 10,
};
const switches = ['endpoints', 'midpoints', 'centers', 'quadrants', 'intersections', 'perpendicular', 'tangent', 'nearest', 'grid'] as const;

export function readCadSnapSettings(editor: Editor): CadSnapSettings {
  const saved = editor.getCurrentPage().meta.omsCadSnap, result = { ...DEFAULT_CAD_SNAP_SETTINGS };
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const key of switches) if (typeof saved[key] === 'boolean') result[key] = saved[key];
    if (typeof saved.tolerance === 'number' && Number.isFinite(saved.tolerance) && saved.tolerance >= 2 && saved.tolerance <= 30) result.tolerance = saved.tolerance;
  }
  const grid = editor.getDocumentSettings?.().gridSize;
  if (Number.isFinite(grid) && grid >= 0.01 && grid <= 1_000_000) result.gridSpacing = grid;
  return result;
}

/** Target choices belong to the page; grid size belongs to the document, as in
 * the native grid renderer. Both writes use one real undo transaction. */
export function writeCadSnapSettings(editor: Editor, patch: Partial<CadSnapSettings>): boolean {
  if (!Object.keys(patch).length || Object.keys(patch).some(key => ![...switches, 'tolerance', 'gridSpacing'].includes(key as any)) || editor.getInstanceState().isReadonly) return false;
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
