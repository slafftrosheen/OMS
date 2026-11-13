import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { getMaterialTextureDraft } from './material-texture';
import { drawingObjectName } from './drawing-operations';

/** Existing drawing objects are the catalogue: no parallel asset store or copies. */
export function drawingMaterialOptions(editor: Editor): { id:TLShapeId; name:string }[] {
  return editor.getCurrentPageShapesSorted().filter(shape =>
    shape.type === 'cad-bezier' && getMaterialTextureDraft(editor,shape.id) !== null,
  ).map(shape => ({id:shape.id,name:drawingObjectName(shape)}));
}

/** Reuse an image at its source scale/angle, centred on the new object. Locked
 * source objects may be read; normal target edit guards still apply at Review. */
export function readDrawingMaterial(editor: Editor, id: TLShapeId) {
  if (!editor.getCurrentPageShapeIds().has(id)) return null;
  const material=getMaterialTextureDraft(editor,id);
  return material ? structuredClone({...material,offsetXmm:0,offsetYmm:0}) : null;
}
