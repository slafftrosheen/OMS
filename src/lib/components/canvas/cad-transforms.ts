import { Mat, areAnglesCompatible, type Editor } from '@tldraw/tldraw';

const CAD_TYPES = new Set(['cad-path', 'cad-ellipse', 'cad-arc', 'cad-dimension']);

/** tldraw 2.4's unaligned mirror writes a page rotation as a local rotation,
 * ignoring the resize axes and rotated parents. Correct the public resize
 * operation for CAD shapes so toolbar flips AND selection-handle mirrors agree.
 * Keep the native resize and history lifecycle; remove this adapter when the
 * upstream implementation passes the nested-parent regression. */
export function installCadTransforms(editor: Editor): () => void {
  const original = editor.resizeShape;
  const resize: Editor['resizeShape'] = function (shape, scale, options = {}) {
    const id = typeof shape === 'string' ? shape : shape.id;
    const initial = options.initialShape ?? editor.getShape(id);
    if (!initial || !CAD_TYPES.has(initial.type) || editor.getInstanceState().isReadonly) return original.call(editor, shape, scale, options);
    const transform = options.initialPageTransform ? Mat.Cast(options.initialPageTransform) : editor.getShapePageTransform(initial);
    const rotation = transform.rotation(), axis = options.scaleAxisRotation ?? rotation;
    const mirrored = scale.x * scale.y < 0 && !areAnglesCompatible(rotation, axis);
    const result = original.call(editor, shape, scale, options);
    if (!mirrored) return result;
    const updated = editor.getShape(id), target = editor.getShapePageBounds(id)?.center;
    if (!updated || !target) return result;
    const parentRotation = editor.getShapePageTransform(updated).rotation() - updated.rotation;
    const localRotation = ((2 * axis - rotation - parentRotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    editor.updateShapes([{ id, type: updated.type, rotation: localRotation }]);
    const current = editor.getShape(id)!;
    const center = editor.getShapePageBounds(current)!.center;
    const origin = editor.getShapePageTransform(current).point();
    const point = editor.getPointInParentSpace(current, { x: origin.x + target.x - center.x, y: origin.y + target.y - center.y });
    editor.updateShapes([{ id, type: current.type, x: point.x, y: point.y }]);
    return result;
  };
  editor.resizeShape = resize;
  return () => { if (editor.resizeShape === resize) editor.resizeShape = original; };
}
