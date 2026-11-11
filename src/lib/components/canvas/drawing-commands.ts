import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { applyToolkitToolbarAction, captureToolkitControls } from './toolkit-controls';

let sequence = 0;

/** Human edits use the same permission/locked-descendant guard as the assistant. */
export function drawingTransaction(editor: Editor, change: () => void): boolean {
  const mark = `drawing-${++sequence}`;
  editor.mark(mark);
  try {
    editor.run(change);
    editor.mark(`${mark}-complete`);
    return true;
  } catch {
    editor.bailToMark(mark);
    return false;
  }
}

export function applyDrawingCommand(editor: Editor, command: string): boolean {
  if (applyToolkitToolbarAction(editor, command)) return true;
  if (command === 'select-all') { editor.selectAll(); editor.focus(); return true; }
  if (command === 'zoom-in') { editor.zoomIn(); return true; }
  if (command === 'zoom-out') { editor.zoomOut(); return true; }
  if (command === 'grid') {
    editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode });
    return true;
  }
  if (command === 'snap') {
    editor.user.updateUserPreferences({ isSnapMode: !editor.user.getIsSnapMode() });
    return true;
  }
  if (!['rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical', 'forward', 'backward', 'lock'].includes(command)) return false;
  editor.complete();
  editor.setCurrentTool('select');
  if (!captureToolkitControls(editor).canEditSelection) return false;
  const ids = [...editor.getSelectedShapeIds()];
  const result = drawingTransaction(editor, () => {
    if (command === 'rotate-left') editor.rotateShapesBy(ids, -Math.PI / 2);
    else if (command === 'rotate-right') editor.rotateShapesBy(ids, Math.PI / 2);
    else if (command === 'flip-horizontal') editor.flipShapes(ids, 'horizontal');
    else if (command === 'flip-vertical') editor.flipShapes(ids, 'vertical');
    else if (command === 'forward') editor.bringForward(ids);
    else if (command === 'backward') editor.sendBackward(ids);
    else editor.toggleLock(ids);
  });
  if (result) editor.focus();
  return result;
}

/** Unlocking is deliberately explicit per row, never an implicit side effect of editing a group. */
export function toggleDrawingObjectLock(editor: Editor, id: TLShapeId): boolean {
  if (editor.getInstanceState().isReadonly) return false;
  const shape = editor.getShape(id);
  if (!shape) return false;
  const parent = editor.getShape(shape.parentId as TLShapeId);
  if (parent && editor.isShapeOrAncestorLocked(parent)) return false;
  return drawingTransaction(editor, () => { editor.toggleLock([id]); });
}

export type DrawingTransformField = 'x' | 'y' | 'w' | 'h' | 'rotation';

/** Local object dimensions and page-space position; display units are canvas px. */
export function transformDrawingSelection(editor: Editor, field: DrawingTransformField, value: number): boolean {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000 || !captureToolkitControls(editor).canEditSelection) return false;
  editor.complete();
  editor.setCurrentTool('select');
  if (!captureToolkitControls(editor).canEditSelection) return false;
  const shapes = editor.getSelectedShapes();
  if (shapes.length !== 1) return false;
  const shape = shapes[0];
  // Group handles resize descendants. resizeShape(group) alone only moves its
  // origin, so numeric size editing is restricted to actual resizable shapes.
  if ((field === 'w' || field === 'h') && (shape.type === 'group' || !editor.getShapeUtil(shape).canResize(shape) || value <= 0)) return false;
  // Arcs hide corner rotation targets to expose their endpoint handles; numeric rotation remains available.
  if (field === 'rotation' && shape.type !== 'cad-arc' && editor.getShapeUtil(shape).hideRotateHandle(shape)) return false;
  return drawingTransaction(editor, () => {
    if (field === 'rotation') {
      editor.rotateShapesBy([shape.id], value * Math.PI / 180 - editor.getShapePageTransform(shape).rotation());
    } else if (field === 'x' || field === 'y') {
      const current = editor.getShapePageTransform(shape).point();
      const local = editor.getPointInParentSpace(shape, { ...current, [field]: value });
      editor.updateShapes([{ id: shape.id, type: shape.type, x: local.x, y: local.y }]);
    } else {
      const bounds = editor.getShapeGeometry(shape).bounds;
      const initial = field === 'w' ? bounds.w : bounds.h;
      if (initial <= 0) throw new Error('Shape has no editable dimension');
      const origin = editor.getShapePageTransform(shape).applyToPoint(bounds.point);
      const ratio = value / initial;
      const lockedAspect = editor.getShapeUtil(shape).isAspectRatioLocked(shape);
      editor.resizeShape(shape, { x: lockedAspect || field === 'w' ? ratio : 1, y: lockedAspect || field === 'h' ? ratio : 1 }, {
        scaleOrigin: origin, scaleAxisRotation: editor.getShapePageTransform(shape).rotation(), mode: 'resize_bounds', isAspectRatioLocked: lockedAspect
      });
    }
  });
}
