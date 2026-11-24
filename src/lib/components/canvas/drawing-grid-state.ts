import { atom, type Editor } from '@tldraw/tldraw';

const visibility = new WeakMap<Editor, ReturnType<typeof atom<boolean>>>();

const MIN_GRID_LINE_SPACING = 12;
type DrawingGridLevel = { step: number; spacing: number; major: boolean };

/** Thin out the displayed grid at overview zooms without changing the snapping
 * lattice. Every displayed line remains an integer multiple of the saved grid.
 * Two SVG tiles cover anything from a small part to a full production layout. */
export function drawingGridLevels(size: number, zoom: number): DrawingGridLevel[] {
  const baseSpacing = size * zoom;
  if (![size, zoom, baseSpacing].every(n => Number.isFinite(n) && n > 0)) return [];
  const minimumStep = Math.max(1, MIN_GRID_LINE_SPACING / baseSpacing);
  const magnitude = 10 ** Math.floor(Math.log10(minimumStep));
  const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= minimumStep)!;
  const spacing = step * baseSpacing;
  if (!Number.isSafeInteger(step) || !Number.isFinite(spacing * 5)) return [];
  return [{ step, spacing, major: false }, { step: step * 5, spacing: spacing * 5, major: true }];
}

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
