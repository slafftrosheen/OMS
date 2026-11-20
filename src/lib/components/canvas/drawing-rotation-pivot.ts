import { atom, react, type Editor } from '@tldraw/tldraw';
import { validCadPoint, type CadPoint } from './cad-settings';
import { readSkewSelection } from './drawing-skew';
import { isDrawingSkewMode } from './drawing-pick-skew';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';

type SavedPivot = { selection: string; point: CadPoint };
const pivots = new WeakMap<Editor, ReturnType<typeof atom<SavedPivot | null>>>();
function pivotState(editor: Editor) {
  let value = pivots.get(editor);
  if (!value) { value = atom<SavedPivot | null>('Pick rotation center', null); pivots.set(editor, value); }
  return value;
}
function selectionKey(editor: Editor): string {
  return JSON.stringify([editor.getCurrentPageId(), [...editor.getSelectedShapeIds()].sort()]);
}

/** A custom center is view state for this selection, in page coordinates. It
 * remains fixed during rotations/Undo, and never enters saved artwork. */
export function readDrawingRotationPivot(editor: Editor): { point: CadPoint; custom: boolean } | null {
  if (readSkewSelection(editor).error) return null;
  const saved = pivotState(editor).get();
  if (saved?.selection === selectionKey(editor)) return { point: { ...saved.point }, custom: true };
  const bounds = editor.getSelectionRotatedPageBounds();
  if (!bounds) return null;
  const angle = editor.getSelectionRotation(), c = Math.cos(angle), s = Math.sin(angle);
  const point = { x: bounds.x + bounds.w / 2 * c - bounds.h / 2 * s,
    y: bounds.y + bounds.w / 2 * s + bounds.h / 2 * c };
  return validCadPoint(point) ? { point, custom: false } : null;
}

export function setDrawingRotationPivot(editor: Editor, point: CadPoint | null): boolean {
  if (!isDrawingSkewMode(editor) || !editor.isIn('select.idle') || editor.getIsMenuOpen() ||
      isDrawingPointerGestureActive(editor) || readSkewSelection(editor).error || point && !validCadPoint(point)) return false;
  pivotState(editor).set(point ? { selection: selectionKey(editor), point: { x: point.x, y: point.y } } : null);
  return true;
}

export function installDrawingRotationPivot(editor: Editor): () => void {
  const value = pivotState(editor);
  const stop = react('clear rotation center when selection changes', () => {
    const selected = selectionKey(editor), saved = value.get();
    if (saved && saved.selection !== selected) value.set(null);
  });
  return () => { stop(); value.set(null); };
}
