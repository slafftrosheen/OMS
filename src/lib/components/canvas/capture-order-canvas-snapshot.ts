import { getSnapshot, type Editor } from '@tldraw/tldraw';
import { captureCanvasDocument } from './canvas-document';

/** Preserve the Order editor's camera/session contract while saving only
 * committed CAD geometry, exactly like its debounced CanvasApp checkpoint. */
export function captureOrderCanvasSnapshot(editor: Editor) {
  return { ...getSnapshot(editor.store), ...captureCanvasDocument(editor) };
}
