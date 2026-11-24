import { atom, type Editor } from '@tldraw/tldraw';

const visibility = new WeakMap<Editor, ReturnType<typeof atom<boolean>>>();

/** The engine's grid flag controls snapping. Keep the overlay's visibility
 * separate so displaying the drafting grid does not move artwork. */
export function drawingGridVisible(editor: Editor) {
  let state = visibility.get(editor);
  if (!state) {
    state = atom('Drawing grid visibility', editor.getInstanceState().isGridMode);
    visibility.set(editor, state);
  }
  return state;
}
