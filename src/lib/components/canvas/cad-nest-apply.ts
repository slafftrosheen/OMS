import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import type { NestResult } from './cad-nesting';

function containsLockedShape(editor: Editor, id: TLShapeId) {
  return [...editor.getShapeAndDescendantIds([id])].some(candidate => {
    const shape = editor.getShape(candidate);
    return !!shape && editor.isShapeOrAncestorLocked(shape);
  });
}

/** Selected page-level objects with bounds in canvas pixels. */
export function nestableSelection(editor: Editor) {
  const page = editor.getCurrentPageId();
  return editor.getSelectedShapeIds().flatMap(id => {
    const shape = editor.getShape(id);
    if (!shape || shape.parentId !== page || containsLockedShape(editor, id)) return [];
    const box = editor.getShapePageBounds(id);
    return box && box.w > 0 && box.h > 0 ? [{ id, x: box.x, y: box.y, w: box.w, h: box.h }] : [];
  });
}

export function applyNest(editor: Editor, result: NestResult, origin: { x: number; y: number }, sheetW: number, spacing: number): boolean {
  if (editor.getInstanceState().isReadonly) return false;
  const page = editor.getCurrentPageId();
  return drawingTransaction(editor, () => {
    for (const placement of result.placements) {
      const id = placement.id as TLShapeId;
      if (editor.getShape(id)?.parentId !== page || containsLockedShape(editor, id)) throw new Error('locked');
      if (placement.rotated) editor.rotateShapesBy([id], Math.PI / 2);
      const shape = editor.getShape(id), box = editor.getShapePageBounds(id);
      if (!shape || !box) throw new Error('missing');
      const x = origin.x + placement.sheet * (sheetW + spacing) + placement.x;
      const y = origin.y + placement.y;
      editor.updateShapes([{ id, type: shape.type, x: shape.x + x - box.x, y: shape.y + y - box.y }]);
    }
  });
}
