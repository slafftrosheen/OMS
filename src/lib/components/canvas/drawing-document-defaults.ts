import type { Editor } from '@tldraw/tldraw';
import { CAD_META_KEY, DEFAULT_CAD_SETTINGS, cadMmPerPixel, readCadSettings } from './cad-settings';

export const DEFAULT_DRAWING_GRID_MM = 10;

/** Initialize only a genuinely blank document. Reopening saved artwork, a
 * custom calibration, or a multi-page document must never reinterpret its size.
 * Grid spacing is physical too; visibility and snapping remain user choices. */
export function initializeDrawingDocument(editor: Editor): boolean {
  if (editor.getInstanceState().isReadonly || readCadSettings(editor) ||
      editor.getPages().length !== 1 || editor.getCurrentPageShapeIds().size) return false;
  const page = editor.getCurrentPage();
  // An unrecognized saved calibration needs explicit repair, not replacement.
  if (page.meta[CAD_META_KEY] !== undefined) return false;
  const settings = { ...DEFAULT_CAD_SETTINGS };
  editor.run(() => {
    editor.updatePage({ id: page.id, meta: { ...page.meta, [CAD_META_KEY]: settings } });
    editor.store.put([{ ...editor.getDocumentSettings(), gridSize: DEFAULT_DRAWING_GRID_MM / cadMmPerPixel(settings) }]);
  }, { history: 'ignore' });
  return !!readCadSettings(editor);
}
