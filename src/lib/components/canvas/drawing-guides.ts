import { atom, uniqueId, type Editor, type TLPageId } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { CAD_MAX_COORDINATE, canvasPointToCad, cadPointToCanvas, type CadPoint, type CadSettings } from './cad-settings';
import { hasCanvasDraft } from './canvas-document';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';

export const DRAWING_GUIDES_META_KEY = 'omsGuides';
export const MAX_DRAWING_GUIDES = 256;
export type DrawingGuideAxis = 'x' | 'y';
export type DrawingGuide = {
  id: string;
  /** x is a vertical line, y is a horizontal line; positions use page coordinates. */
  axis: DrawingGuideAxis;
  position: number;
  visible: boolean;
  locked: boolean;
};
export type DrawingGuidesState = { version: 1; visible: boolean; locked: boolean; guides: DrawingGuide[]; };
export type DrawingGuideChange =
  | { kind: 'add'; axis: DrawingGuideAxis; position: number; id?: string }
  | { kind: 'move'; id: string; position: number }
  | { kind: 'remove'; ids: string[] }
  | { kind: 'guide-visible'; id: string; visible: boolean }
  | { kind: 'guide-locked'; id: string; locked: boolean }
  | { kind: 'settings'; visible?: boolean; locked?: boolean };
export interface DrawingGuidePlan { pageId: TLPageId; revision: string; change: DrawingGuideChange; next: DrawingGuidesState; }
export type DrawingGuideErrorCode = 'invalid' | 'corrupt' | 'readonly' | 'busy' | 'locked' | 'missing' | 'stale' | 'limit' | 'saveLimit' | 'failed';
export class DrawingGuideError extends Error { constructor(public code: DrawingGuideErrorCode) { super(code); } }
const empty = (): DrawingGuidesState => ({ version: 1, visible: true, locked: false, guides: [] });
const validId = (value: unknown): value is string => typeof value === 'string' && /^guide:[a-zA-Z0-9_-]{1,80}$/.test(value);
const validPosition = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= CAD_MAX_COORDINATE;

/** Invalid/future metadata is never rewritten as an empty guide collection. */
export function validateDrawingGuides(value: unknown): DrawingGuidesState | null {
  if (value === undefined) return empty();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as DrawingGuidesState;
  if (state.version !== 1 || typeof state.visible !== 'boolean' || typeof state.locked !== 'boolean' ||
      !Array.isArray(state.guides) || state.guides.length > MAX_DRAWING_GUIDES ||
      state.guides.some(guide => !guide || !validId(guide.id) || !['x', 'y'].includes(guide.axis) || !validPosition(guide.position) ||
        typeof guide.visible !== 'boolean' || typeof guide.locked !== 'boolean') ||
      new Set(state.guides.map(guide => guide.id)).size !== state.guides.length) return null;
  return { version: 1, visible: state.visible, locked: state.locked,
    guides: state.guides.map(({ id, axis, position, visible, locked }) => ({ id, axis, position, visible, locked })) };
}
export function readDrawingGuides(editor: Editor): DrawingGuidesState {
  return validateDrawingGuides(editor.getCurrentPage().meta[DRAWING_GUIDES_META_KEY]) ?? empty();
}
export function drawingGuidesAreValid(editor: Editor): boolean {
  return validateDrawingGuides(editor.getCurrentPage().meta[DRAWING_GUIDES_META_KEY]) !== null;
}
/** Do not put metadata edits inside another gesture's rollback boundary. Custom
 * previews release their pointer claim before committing their guide change. */
export function drawingGuidesBusy(editor: Editor): boolean {
  const path = editor.getPath?.() ?? '', claimed = isDrawingPointerGestureActive(editor);
  return hasCanvasDraft(editor) || claimed || !!editor.inputs?.isDragging ||
    (!!editor.inputs?.isPointing && !!path && !path.endsWith('.idle'));
}
/** Changes to calibration invalidate numeric drafts and pointer gestures. Other
 * page metadata and drawing-object edits are merged without discarding them. */
export function drawingGuidesRevision(editor: Editor): string {
  const page = editor.getCurrentPage();
  return JSON.stringify([page.id, page.meta[DRAWING_GUIDES_META_KEY], page.meta.omsCad]);
}

const selections = new WeakMap<Editor, Map<TLPageId, ReturnType<typeof atom<string | null>>>>();
export function selectedDrawingGuide(editor: Editor) {
  let pages = selections.get(editor);
  if (!pages) { pages = new Map(); selections.set(editor, pages); }
  const pageId = editor.getCurrentPageId();
  let selection = pages.get(pageId);
  if (!selection) { selection = atom<string | null>('Selected document guideline', null); pages.set(pageId, selection); }
  return selection;
}
export function selectDrawingGuide(editor: Editor, id: string | null): boolean {
  if (id !== null && !readDrawingGuides(editor).guides.some(guide => guide.id === id)) return false;
  selectedDrawingGuide(editor).set(id);
  return true;
}

/** Unit and origin changes affect the displayed coordinate, never the guide's
 * position relative to artwork. Calibrated Y coordinates point upwards. */
export function guidePositionToUnit(axis: DrawingGuideAxis, position: number, settings: CadSettings | null): number {
  if (!settings) return position;
  return canvasPointToCad({ x: axis === 'x' ? position : settings.originX, y: axis === 'y' ? position : settings.originY }, settings)[axis];
}
export function guidePositionFromUnit(axis: DrawingGuideAxis, position: number, settings: CadSettings | null): number {
  if (!settings) return position;
  return cadPointToCanvas({ x: axis === 'x' ? position : 0, y: axis === 'y' ? position : 0 }, settings)[axis];
}

function changedState(current: DrawingGuidesState, change: DrawingGuideChange): DrawingGuidesState {
  const next = { ...current, guides: current.guides.map(guide => ({ ...guide })) };
  if (!change || typeof change !== 'object') throw new DrawingGuideError('invalid');
  if (change.kind === 'settings') {
    if (!Object.keys(change).some(key => key !== 'kind') || Object.keys(change).some(key => !['kind', 'visible', 'locked'].includes(key))) throw new DrawingGuideError('invalid');
    for (const key of ['visible', 'locked'] as const) {
      if (key in change) { if (typeof change[key] !== 'boolean') throw new DrawingGuideError('invalid'); next[key] = change[key]!; }
    }
  } else if (change.kind === 'add') {
    if (current.locked) throw new DrawingGuideError('locked');
    if (!['x', 'y'].includes(change.axis) || !validPosition(change.position) || !validId(change.id) || current.guides.some(guide => guide.id === change.id)) throw new DrawingGuideError('invalid');
    if (current.guides.length >= MAX_DRAWING_GUIDES) throw new DrawingGuideError('limit');
    next.guides.push({ id: change.id, axis: change.axis, position: change.position, visible: true, locked: false });
    // Creating a guide must leave a visible result, including when it is dragged
    // from a ruler while guidelines are hidden. Undo restores both together.
    next.visible = true;
  } else if (change.kind === 'remove') {
    if (!Array.isArray(change.ids) || !change.ids.length || change.ids.length > MAX_DRAWING_GUIDES || new Set(change.ids).size !== change.ids.length) throw new DrawingGuideError('invalid');
    if (change.ids.some(id => !current.guides.some(guide => guide.id === id))) throw new DrawingGuideError('missing');
    if (current.locked || current.guides.some(guide => change.ids.includes(guide.id) && guide.locked)) throw new DrawingGuideError('locked');
    next.guides = next.guides.filter(guide => !change.ids.includes(guide.id));
  } else if (['move', 'guide-visible', 'guide-locked'].includes(change.kind)) {
    const update = change as Extract<DrawingGuideChange, { id: string }>;
    const guide = next.guides.find(guide => guide.id === update.id);
    if (!guide) throw new DrawingGuideError('missing');
    if (update.kind === 'move') {
      if (current.locked || guide.locked) throw new DrawingGuideError('locked');
      if (!validPosition(update.position)) throw new DrawingGuideError('invalid');
      guide.position = update.position;
    } else if (update.kind === 'guide-visible') {
      if (typeof update.visible !== 'boolean') throw new DrawingGuideError('invalid');
      guide.visible = update.visible;
    } else if (update.kind === 'guide-locked') {
      if (typeof update.locked !== 'boolean') throw new DrawingGuideError('invalid');
      guide.locked = update.locked;
    }
  } else throw new DrawingGuideError('invalid');
  return next;
}

function checkCapacity(editor: Editor, current: DrawingGuidesState, next: DrawingGuidesState) {
  if (!editor.store?.getStoreSnapshot) return;
  const before = JSON.stringify(editor.store.getStoreSnapshot()).length;
  const previous = editor.getCurrentPage().meta[DRAWING_GUIDES_META_KEY];
  const delta = JSON.stringify(next).length - (previous === undefined ? 0 : JSON.stringify(previous).length) + (previous === undefined ? DRAWING_GUIDES_META_KEY.length + 4 : 0);
  // Existing oversized drawings must still permit removal and lock/visibility
  // changes needed to clean them up. New geometry may not increase the excess.
  const geometryChanges = next.guides.length > current.guides.length || next.guides.some(guide => current.guides.find(before => before.id === guide.id)?.position !== guide.position);
  if (before + delta > 1_900_000 && (before <= 1_900_000 || delta > 0 && geometryChanges)) throw new DrawingGuideError('saveLimit');
}

export function prepareDrawingGuideChange(editor: Editor, change: DrawingGuideChange, expectedRevision?: string): DrawingGuidePlan {
  if (editor.getInstanceState().isReadonly) throw new DrawingGuideError('readonly');
  if (drawingGuidesBusy(editor)) throw new DrawingGuideError('busy');
  const revision = drawingGuidesRevision(editor), page = editor.getCurrentPage();
  if (expectedRevision !== undefined && expectedRevision !== revision) throw new DrawingGuideError('stale');
  const current = validateDrawingGuides(page.meta[DRAWING_GUIDES_META_KEY]);
  if (!current) throw new DrawingGuideError('corrupt');
  const resolved = change?.kind === 'add' ? { ...change, id: change.id ?? `guide:${uniqueId()}` } : change;
  const next = changedState(current, resolved);
  checkCapacity(editor, current, next);
  return { pageId: page.id, revision, change: structuredClone(resolved), next };
}

/** A ruler or line drag keeps only an ephemeral preview, then commits once on
 * release. It must pass the revision captured on pointer-down. No tool, artwork,
 * document settings or camera state is changed by a guideline transaction. */
export function applyDrawingGuideChange(editor: Editor, plan: DrawingGuidePlan): boolean {
  try {
    if (!plan || plan.pageId !== editor.getCurrentPageId()) return false;
    const fresh = prepareDrawingGuideChange(editor, plan.change, plan.revision);
    const current = readDrawingGuides(editor);
    if (JSON.stringify(current) === JSON.stringify(fresh.next)) return true;
    const changed = drawingTransaction(editor, () => {
      if (drawingGuidesBusy(editor)) throw new DrawingGuideError('busy');
      if (editor.getInstanceState().isReadonly || drawingGuidesRevision(editor) !== fresh.revision) throw new DrawingGuideError('stale');
      const page = editor.getCurrentPage();
      editor.updatePage({ id: page.id, meta: { ...page.meta, [DRAWING_GUIDES_META_KEY]: fresh.next } });
      if (editor.getCurrentPageId() !== fresh.pageId || !drawingGuidesAreValid(editor) || JSON.stringify(readDrawingGuides(editor)) !== JSON.stringify(fresh.next)) throw new DrawingGuideError('failed');
    });
    if (changed) {
      if (fresh.change.kind === 'add') selectDrawingGuide(editor, fresh.change.id!);
      else if (!fresh.next.guides.some(guide => guide.id === selectedDrawingGuide(editor).get())) selectDrawingGuide(editor, null);
    }
    return changed;
  } catch { return false; }
}

/** Bounded O(max-guides) fallback after exact object targets. Visibility and
 * locking do not change snap eligibility; the dedicated snap switch does. */
export function nearestDrawingGuidePoint(state: DrawingGuidesState, point: CadPoint, tolerance: number): CadPoint | null {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || !validPosition(point.x) || !validPosition(point.y)) return null;
  let x: number | undefined, y: number | undefined, dx = tolerance, dy = tolerance;
  for (const guide of state.guides.slice(0, MAX_DRAWING_GUIDES)) {
    if (!validPosition(guide.position)) continue;
    const distance = Math.abs(point[guide.axis] - guide.position);
    if (guide.axis === 'x' && distance <= dx) { x = guide.position; dx = distance; }
    if (guide.axis === 'y' && distance <= dy) { y = guide.position; dy = distance; }
  }
  if (x === undefined && y === undefined) return null;
  // Two-axis acquisition uses the same circular tolerance as all other CAD
  // point targets. Otherwise prefer the closest single line, without a jump.
  if (x !== undefined && y !== undefined && Math.hypot(dx, dy) <= tolerance) return { x, y };
  return x !== undefined && (y === undefined || dx <= dy) ? { x, y: point.y } : { x: point.x, y: y! };
}
