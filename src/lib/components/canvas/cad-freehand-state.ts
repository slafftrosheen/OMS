import { atom, type Editor } from '@tldraw/tldraw';
import type { CadFreehandGeometry, CadFreehandOptions, FreehandSample } from './cad-freehand';
import type { CadFreehandEndpoint } from './cad-freehand-continuation';
import type { CadContour } from './cad-curves';

/** View state only. Source artwork observes this atom without importing the
 * tool controller, geometry builder, or persistence commands. */
export interface CadFreehandPreview {
  samples: FreehandSample[];
  geometry: (Omit<CadFreehandGeometry, 'fillRule'> & { fillRule: 'evenodd' | 'nonzero' }) | null;
  mode: CadFreehandOptions['mode'];
  sampleCount: number;
  isPen: boolean;
  closeCandidate: boolean;
  autoClose: boolean;
  opacity: number;
  error: string | null;
  continuation: (CadFreehandEndpoint & { oppositePoint: { x: number; y: number }; closing: boolean; localContours: CadContour[] | null }) | null;
}
const previews = new WeakMap<Editor, ReturnType<typeof atom<CadFreehandPreview | null>>>();
const notices = new WeakMap<Editor, ReturnType<typeof atom<string | null>>>();
const hovers = new WeakMap<Editor, ReturnType<typeof atom<CadFreehandEndpoint | null>>>();
export function cadFreehandHover(editor: Editor) {
  let value = hovers.get(editor);
  if (!value) { value = atom<CadFreehandEndpoint | null>('Freehand endpoint hover', null); hovers.set(editor, value); }
  return value;
}
export function cadFreehandPreview(editor: Editor) {
  let value = previews.get(editor);
  if (!value) { value = atom<CadFreehandPreview | null>('Freehand preview', null); previews.set(editor, value); }
  return value;
}
export function cadFreehandNotice(editor: Editor) {
  let value = notices.get(editor);
  if (!value) { value = atom<string | null>('Freehand notice', null); notices.set(editor, value); }
  return value;
}
