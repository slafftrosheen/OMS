import { atom, react, Vec, type Editor, type TLEventInfo, type TLPointerEventInfo, type TLShapeId } from '@tldraw/tldraw';
import { isCadNodeEditing } from './cad-node-selection';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';
import { isDrawingSkewMode, setDrawingSkewMode } from './drawing-pick-skew';
import { readSkewSelection } from './drawing-skew';

interface SelectionState { ids: TLShapeId[]; focused: TLShapeId | null }
type DocumentStamp = { page: ReturnType<Editor['getCurrentPage']>; shapes: ReturnType<Editor['getCurrentPageShapesSorted']> };
type DocumentRecords = ReturnType<Editor['store']['getStoreSnapshot']>['store'];
interface Snapshot {
  document: DocumentStamp;
  viewport: string;
  selection: SelectionState;
  mode: boolean;
}
interface Pending {
  before: Snapshot;
  nativeSelection: SelectionState;
  deadline: number;
}
interface Press {
  before: Snapshot;
  pointerId: number;
  point: { x: number; y: number };
  limit: number;
  released: boolean;
  nativeDown?: TLPointerEventInfo;
  nativeTime?: number;
  releaseDocument?: DocumentRecords;
  historyMark?: string;
  previous: Pending | null;
}
const installations = new WeakMap<Editor, () => void>();
let markSequence = 0;
const ignored = 'input,textarea,select,button,a[href],video,audio,iframe,[contenteditable]:not([contenteditable="false"]),' +
  '[role="button"],[role="textbox"],[data-drawing-guide-control],[data-drawing-skew-edge],' +
  '[data-drawing-rotate-corner],[data-drawing-rotation-pivot],.tl-user-handles,.tl-selection__fg,.tlui-menu';
const modified = (event: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey?: boolean }) =>
  event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
const sameSelection = (a: SelectionState, b: SelectionState) => a.focused === b.focused &&
  a.ids.length === b.ids.length && a.ids.every((id, index) => id === b.ids[index]);
const selectionState = (editor: Editor): SelectionState => ({
  ids: [...editor.getSelectedShapeIds()], focused: editor.getCurrentPageState().focusedGroupId,
});
function documentStamp(editor: Editor): DocumentStamp {
  return { page: editor.getCurrentPage(), shapes: editor.getCurrentPageShapesSorted() };
}
function sameDocumentRecords(before: DocumentRecords | undefined, after: DocumentRecords): boolean {
  if (!before) return false;
  const ids = Object.keys(before) as Array<keyof DocumentRecords>;
  return ids.length === Object.keys(after).length && ids.every(id => before[id] === after[id]);
}
function viewportStamp(editor: Editor): string {
  const camera = editor.getCamera(), bounds = editor.getViewportScreenBounds();
  return JSON.stringify([camera.x, camera.y, camera.z, bounds.x, bounds.y, bounds.w, bounds.h]);
}
function hitArtwork(editor: Editor) {
  return editor.getShapeAtPoint(editor.inputs.currentPagePoint, {
    hitInside: false, margin: editor.options.hitTestMargin / editor.getZoomLevel(), renderingOnly: true,
  }) ?? editor.getSelectedShapeAtPoint(editor.inputs.currentPagePoint);
}
function restoreSelection(editor: Editor, selection: SelectionState) {
  editor.setSelectedShapes(selection.ids);
  editor.setFocusedGroup(selection.focused);
}

/** Corel's ordinary repeated click toggles Pick handles. Native tldraw emits
 * pointer_up before double_click(up), and a group/multiselection click normally
 * drills in or narrows the selection. Keep the original selection in that same
 * transaction, then wait out the editor's own double-click interval before
 * toggling. A real multi-click restores the native first-click result and gives
 * the second press back to the native selection tool. No document records,
 * pointer events or editable-content handlers are replaced. */
export function installDrawingPickClickToggle(editor: Editor): () => void {
  installations.get(editor)?.();
  const container = editor.getContainer(), doc = container.ownerDocument, win = doc.defaultView;
  if (!win) return () => {};
  const epoch = atom('Pick repeat click lifecycle', 0);
  let press: Press | null = null, pending: Pending | null = null, timer = 0, disposed = false;
  const notify = () => epoch.update(value => value + 1);
  const clearTimer = () => { if (timer) win.clearTimeout(timer); timer = 0; };
  const reset = () => { clearTimer(); press = null; pending = null; notify(); };
  const fresh = (before: Snapshot, checkSelection = true) =>
    !disposed && !editor.getInstanceState().isReadonly && !editor.getIsMenuOpen() && !isCadNodeEditing(editor) &&
    !isDrawingPointerGestureActive(editor) && before.mode === isDrawingSkewMode(editor) &&
    before.document.page === editor.getCurrentPage() && before.document.shapes === editor.getCurrentPageShapesSorted() && before.viewport === viewportStamp(editor) &&
    (!checkSelection || sameSelection(before.selection, selectionState(editor)));
  const targetAllowed = (target: EventTarget | null): target is Element => target instanceof Element &&
    container.contains(target) && !!target.closest('.tl-canvas') && !target.closest(ignored);

  const down = (event: PointerEvent) => {
    const previous = pending && fresh(pending.before) ? pending : null;
    reset();
    if (!targetAllowed(event.target) || event.button !== 0 || event.isPrimary === false || modified(event) ||
        !editor.isIn('select.idle') || editor.getIsMenuOpen() || editor.getInstanceState().isReadonly ||
        isCadNodeEditing(editor) || isDrawingPointerGestureActive(editor) || readSkewSelection(editor).error) return;
    const point = editor.screenToPage({ x: event.clientX, y: event.clientY });
    const hit = editor.getShapeAtPoint(point, {
      hitInside: false, margin: editor.options.hitTestMargin / editor.getZoomLevel(), renderingOnly: true,
    }) ?? editor.getSelectedShapeAtPoint(point);
    if (!hit || !editor.getSelectedShapeIds().includes(hit.id) && !editor.isAncestorSelected(hit)) return;
    press = { pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY }, released: false, previous,
      limit: editor.getInstanceState().isCoarsePointer ? editor.options.coarseDragDistanceSquared : editor.options.dragDistanceSquared,
      before: { document: documentStamp(editor), viewport: viewportStamp(editor), selection: selectionState(editor), mode: isDrawingSkewMode(editor) } };
    notify();
  };
  const move = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (modified(event) || (event.clientX - press.point.x) ** 2 + (event.clientY - press.point.y) ** 2 > press.limit) reset();
  };
  const up = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.pointerId) return;
    move(event);
    if (!press) return;
    if (event.button !== 0 || !targetAllowed(event.target) || !fresh(press.before) ||
        !editor.isInAny('select.pointing_shape', 'select.pointing_selection')) { reset(); return; }
    press.released = true;
    // Isolate only this synchronous native release. Native selection changes
    // otherwise leave a no-op Undo entry even after the original selection is
    // restored. A full document check below prevents rolling back any artwork,
    // asset, page or collaborator edit performed by another release handler.
    press.releaseDocument = editor.store.getStoreSnapshot('document').store;
    press.historyMark = `oms-pick-click-${++markSequence}`;
    editor.mark(press.historyMark);
  };
  const commit = () => {
    timer = 0;
    const value = pending;
    pending = null; notify();
    if (!value || !fresh(value.before) || !editor.isIn('select.idle') || readSkewSelection(editor).error) return;
    setDrawingSkewMode(editor, !value.before.mode);
  };

  function nativeMultiClick(info: Extract<TLEventInfo, { type: 'click' }>) {
    const current = press, previous = current?.previous;
    reset();
    if (info.phase !== 'down' || !current?.nativeDown || !previous || modified(info) ||
        !fresh(previous.before, false) || sameSelection(previous.before.selection, previous.nativeSelection) ||
        !editor.isInAny('select.pointing_shape', 'select.pointing_selection')) return;
    // tldraw already handled the second pointer_down against our retained
    // selection. Re-enter its public pointing state against the native result
    // of the first click. This preserves nested-group drill-in and multiselect
    // semantics without ever reading or mutating the private ClickManager.
    editor.mark('Pick native multi-click selection');
    restoreSelection(editor, previous.nativeSelection);
    const hit = hitArtwork(editor), pointer = current.nativeDown;
    editor.setCurrentTool('select.idle');
    if (hit) editor.setCurrentTool('select.pointing_shape', { ...pointer, target: 'shape', shape: hit });
    else {
      const bounds = editor.getSelectionRotatedPageBounds(), only = editor.getOnlySelectedShape();
      const inside = bounds && bounds.containsPoint(Vec.RotWith(editor.inputs.currentPagePoint, bounds.point, -editor.getSelectionRotation()));
      const background = editor.getSelectedShapeIds().length > 1 || only && !editor.getShapeUtil(only).hideSelectionBoundsBg(only);
      editor.setCurrentTool(inside && background ? 'select.pointing_selection' : 'select.pointing_canvas', pointer);
    }
  }
  const native = (info: TLEventInfo) => {
    if (info.type === 'click') { nativeMultiClick(info); return; }
    if (info.type !== 'pointer') {
      if (info.type === 'keyboard' || info.type === 'wheel' || info.type === 'pinch' ||
          info.name === 'cancel' || info.name === 'interrupt' || info.name === 'complete') reset();
      return;
    }
    if (info.name === 'right_click' || info.name === 'middle_click' || info.name === 'long_press') { reset(); return; }
    if (!press || press.pointerId !== info.pointerId) return;
    if (info.name === 'pointer_down') {
      if (modified(info) || info.target === 'handle' || info.target === 'selection' && info.handle ||
          !editor.isInAny('select.pointing_shape', 'select.pointing_selection') || !fresh(press.before)) { reset(); return; }
      press.nativeDown = info; press.nativeTime = win.performance.now();
    } else if (info.name === 'pointer_up') {
      const current = press;
      if (!current.nativeDown || !current.released || !current.historyMark || modified(info) || !editor.isIn('select.idle') || !fresh(current.before, false) ||
          !sameDocumentRecords(current.releaseDocument, editor.store.getStoreSnapshot('document').store)) { reset(); return; }
      const nativeSelection = selectionState(editor);
      press = null;
      editor.bailToMark(current.historyMark);
      editor.run(() => restoreSelection(editor, current.before.selection), { history: 'ignore' });
      pending = { before: current.before, nativeSelection, deadline: current.nativeTime! + editor.options.doubleClickDurationMs };
      notify();
      timer = win.setTimeout(commit, Math.max(0, pending.deadline - win.performance.now()) + 1);
    }
  };
  const canceled = () => reset();
  const focus = (event: FocusEvent) => { if (event.target !== container && !targetAllowed(event.target)) reset(); };
  const visibility = () => { if (doc.visibilityState === 'hidden') reset(); };
  doc.addEventListener('pointerdown', down, true);
  doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', up, true);
  doc.addEventListener('pointercancel', canceled, true);
  doc.addEventListener('keydown', canceled, true);
  doc.addEventListener('contextmenu', canceled, true);
  doc.addEventListener('focusin', focus, true);
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', canceled);
  win.addEventListener('wheel', canceled, true);
  win.addEventListener('scroll', canceled, true);
  editor.on('event', native);
  const stop = react('guard Pick repeat click', () => {
    epoch.get();
    const before = press?.before ?? pending?.before;
    if (!before) return;
    if (!fresh(before) || pending && !editor.isIn('select.idle') || press &&
        !editor.isInAny('select.idle', 'select.pointing_shape', 'select.pointing_selection')) reset();
  });
  const cleanup = () => {
    if (disposed) return;
    disposed = true; stop(); reset(); editor.off('event', native);
    doc.removeEventListener('pointerdown', down, true);
    doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', up, true);
    doc.removeEventListener('pointercancel', canceled, true);
    doc.removeEventListener('keydown', canceled, true);
    doc.removeEventListener('contextmenu', canceled, true);
    doc.removeEventListener('focusin', focus, true);
    doc.removeEventListener('visibilitychange', visibility);
    win.removeEventListener('blur', canceled);
    win.removeEventListener('wheel', canceled, true);
    win.removeEventListener('scroll', canceled, true);
    if (installations.get(editor) === cleanup) installations.delete(editor);
  };
  installations.set(editor, cleanup);
  return cleanup;
}
