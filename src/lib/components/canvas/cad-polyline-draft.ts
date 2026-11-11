import { atom, type Editor } from '@tldraw/tldraw';
import { cadPointToCanvas, unitLengthToCanvas, validCadPoint, type CadPoint, type CadSettings } from './cad-settings';

export type CadPointEntryMode = 'absolute' | 'offset' | 'polar';
export interface PolylineDraft { points: CadPoint[]; pointer: CadPoint | null }
export interface PolylineController {
  add(point: CadPoint): boolean;
  finish(closed: boolean): boolean;
  back(): void;
  cancel(): void;
}
function createSession() { return { state: atom<PolylineDraft | null>('polyline draft', null), controller: null as PolylineController | null }; }
const sessions = new WeakMap<Editor, ReturnType<typeof createSession>>();
export function polylineSession(editor: Editor) {
  let session = sessions.get(editor);
  if (!session) { session = createSession(); sessions.set(editor, session); }
  return session;
}

/** Numeric entry is exact: never resnap an explicitly typed point. Y increases up. */
export function resolveCadDraftPoint(mode: CadPointEntryMode, first: number, second: number, last: CadPoint | undefined, settings: CadSettings | null): CadPoint | null {
  if (![first, second].every(Number.isFinite)) return null;
  let point: CadPoint;
  const length = (n: number) => settings ? unitLengthToCanvas(n, settings) : n;
  if (mode === 'absolute') point = settings ? cadPointToCanvas({ x: first, y: second }, settings) : { x: first, y: -second };
  else if (!last || !validCadPoint(last)) return null;
  else if (mode === 'offset') point = { x: last.x + length(first), y: last.y - length(second) };
  else if (mode === 'polar' && first > 0 && Math.abs(second) <= 360) {
    const radians = second * Math.PI / 180;
    point = { x: last.x + length(first) * Math.cos(radians), y: last.y - length(first) * Math.sin(radians) };
  } else return null;
  return validCadPoint(point) ? point : null;
}
