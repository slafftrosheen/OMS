import { atom, react, StateNode, type Editor, type TLEventHandlers, type TLPointerEventInfo } from '@tldraw/tldraw';
import {
  applyCadFreehandPlan, buildCadFreehandGeometry, cadFreehandOptions, MAX_CAD_FREEHAND_SAMPLES,
  prepareCadFreehandPlan, readCadFreehandOptions, type CadFreehandGeometry, type CadFreehandOptions, type FreehandSample,
} from './cad-freehand';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { validCadPoint } from './cad-settings';
import { clearCadSnap } from './cad-snap';
import { isDrawingPointerGestureActive } from './drawing-pointer-gesture';

export const CAD_FREEHAND_CLOSE_DISTANCE = 8;
export interface CadFreehandPreview {
  samples: FreehandSample[];
  geometry: CadFreehandGeometry | null;
  mode: CadFreehandOptions['mode'];
  sampleCount: number;
  isPen: boolean;
  closeCandidate: boolean;
  autoClose: boolean;
  opacity: number;
  error: string | null;
}
const previews = new WeakMap<Editor, ReturnType<typeof atom<CadFreehandPreview | null>>>();
const notices = new WeakMap<Editor, ReturnType<typeof atom<string | null>>>();
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
/** Public cancellation also resets the native editor's drag state. */
export function cancelCadFreehand(editor: Editor): void {
  if (editor.getCurrentToolId() === CadFreehandTool.id) editor.cancel();
}

interface Stroke {
  pointerId: number;
  isPen: boolean;
  samples: FreehandSample[];
  options: CadFreehandOptions;
  revision: string;
  viewport: string;
  opacity: number;
  closeTolerance: number;
  lastScreenPoint: { x: number; y: number };
  invalidated: boolean;
  frame: number;
  window: Window;
  cleanup: () => void;
}
function viewport(editor: Editor): string {
  const c = editor.getCamera(), b = editor.getViewportScreenBounds();
  return JSON.stringify([c.x, c.y, c.z, b.x, b.y, b.w, b.h]);
}
const errorCode = (error: unknown) => error instanceof CadOperationError ? error.code : 'failed';

/** A pen/mouse stroke is view state until release. Preview and final creation
 * share the bounded geometry builder; saved output is an ordinary CAD curve. */
export class CadFreehandTool extends StateNode {
  static override id = 'cad-freehand';
  private stroke: Stroke | null = null;
  private cancelReason: string | null = null;

  override onEnter = () => {
    this.clearStroke(); clearCadSnap(this.editor);
    cadFreehandNotice(this.editor).set(null);
    this.editor.selectNone(); this.editor.setCursor({ type: 'cross', rotation: 0 });
  };
  override onExit = () => { this.clearStroke(this.stroke ? 'canceled' : undefined); clearCadSnap(this.editor); };
  override onCancel = () => { this.clearStroke(this.cancelReason ?? (this.stroke ? 'canceled' : undefined)); };
  override onComplete = () => { this.clearStroke(this.stroke ? 'canceled' : undefined); };
  override onInterrupt = () => { this.clearStroke(this.stroke ? 'canceled' : undefined); };
  override onKeyDown: TLEventHandlers['onKeyDown'] = info => {
    if (info.key === 'Escape') this.requestCancel('canceled');
    // Panning changes the mapping from screen samples to page coordinates.
    else if (info.code === 'Space') this.requestCancel('stale');
  };

  private available(): boolean {
    return !this.editor.isDisposed && this.editor.getCurrentToolId() === CadFreehandTool.id &&
      !this.editor.getInstanceState().isReadonly && !this.editor.getIsMenuOpen() &&
      !isDrawingPointerGestureActive(this.editor);
  }
  private sample(info: TLPointerEventInfo): FreehandSample | null {
    const point = this.editor.inputs.currentPagePoint;
    const pressure = info.isPen ? point.z : 1;
    if (!validCadPoint(point) || !Number.isFinite(pressure) || pressure < 0 || pressure > 1) return null;
    return { x: point.x, y: point.y, pressure };
  }
  private fresh(stroke: Stroke): boolean {
    return this.stroke === stroke && !stroke.invalidated && this.available() && stroke.revision === cadRevision(this.editor) &&
      stroke.viewport === viewport(this.editor) && stroke.opacity === this.editor.getInstanceState().opacityForNextShape &&
      JSON.stringify(stroke.options) === JSON.stringify(cadFreehandOptions(this.editor).get());
  }
  private requestCancel(reason: string): void {
    if (!this.stroke) return;
    this.cancelReason = reason;
    this.editor.cancel();
    // cancel dispatch is public and synchronous; this fallback also makes
    // teardown safe if a parent state intercepted the event during a switch.
    if (this.stroke) this.clearStroke(reason);
    this.cancelReason = null;
  }
  private clearStroke(notice?: string, releaseInput = true): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (stroke) {
      if (stroke.frame) stroke.window.cancelAnimationFrame(stroke.frame);
      stroke.cleanup();
      // Native misc cancel does not clear isPointing or the held mouse button.
      // Close that input sequence only after removing our stroke, so this
      // neutral public release cannot commit abandoned geometry. Pen release
      // belongs to the bridge, and editor disposal must not dispatch events.
      if (releaseInput && !stroke.isPen && !this.editor.isDisposed &&
          (this.editor.inputs.isPointing || this.editor.inputs.buttons.has(0))) {
        this.editor.dispatch({ type: 'pointer', name: 'pointer_up', target: 'canvas',
          point: { ...stroke.lastScreenPoint, z: 0 }, pointerId: stroke.pointerId, button: 0, isPen: false,
          shiftKey: this.editor.inputs.shiftKey, ctrlKey: this.editor.inputs.ctrlKey, altKey: this.editor.inputs.altKey });
      }
    }
    cadFreehandPreview(this.editor).set(null);
    if (notice) cadFreehandNotice(this.editor).set(notice);
  }

  override onPointerDown: TLEventHandlers['onPointerDown'] = info => {
    if (this.stroke || info.button !== 0 || info.target === 'handle' || !this.available()) return;
    // Embedded OMS forms own their interactions, including form descendants.
    try { if (info.target === 'shape') assertCadEditable(this.editor, [info.shape.id]); }
    catch { return; }
    // Canvas pointer_down precedes the browser's default focus change. Commit
    // property inputs' blur handlers before freezing the next stroke options.
    // Native isFocused may already be true while a toolbar input owns DOM focus.
    this.editor.getContainer().focus({ preventScroll: true });
    this.editor.focus();
    if (!this.available()) return;
    const sample = this.sample(info), win = this.editor.getContainer().ownerDocument.defaultView;
    if (!sample || !win) { cadFreehandNotice(this.editor).set('freehand-invalid'); return; }
    if (this.editor.getCurrentPageShapeIds().size >= this.editor.options.maxShapesPerPage) {
      cadFreehandNotice(this.editor).set('freehand-limit'); return;
    }
    const stroke: Stroke = {
      pointerId: info.pointerId, isPen: info.isPen, samples: [sample], options: readCadFreehandOptions(this.editor),
      revision: cadRevision(this.editor), viewport: viewport(this.editor), opacity: this.editor.getInstanceState().opacityForNextShape,
      lastScreenPoint: { x: info.point.x, y: info.point.y },
      closeTolerance: CAD_FREEHAND_CLOSE_DISTANCE / this.editor.getZoomLevel(), invalidated: false, frame: 0, window: win, cleanup: () => {},
    };
    this.stroke = stroke; cadFreehandNotice(this.editor).set(null); clearCadSnap(this.editor);
    this.installGuards(stroke);
    if (this.stroke === stroke) this.publish(stroke);
  };
  override onPointerMove: TLEventHandlers['onPointerMove'] = info => {
    const stroke = this.stroke;
    if (!stroke || info.pointerId !== stroke.pointerId || info.isPen !== stroke.isPen) return;
    if (stroke.invalidated || !this.available()) { this.requestCancel('stale'); return; }
    if (!this.append(stroke, info)) return;
    if (!stroke.frame) stroke.frame = stroke.window.requestAnimationFrame(() => {
      stroke.frame = 0;
      if (this.stroke !== stroke) return;
      if (!this.fresh(stroke)) { this.requestCancel('stale'); return; }
      this.publish(stroke);
    });
  };
  override onPointerUp: TLEventHandlers['onPointerUp'] = info => {
    const stroke = this.stroke;
    if (!stroke || info.pointerId !== stroke.pointerId || info.isPen !== stroke.isPen) return;
    if (!this.fresh(stroke)) { this.requestCancel('stale'); return; }
    if (!this.append(stroke, info)) return;
    try {
      const plan = prepareCadFreehandPlan(this.editor, stroke.samples, stroke.options, stroke.closeTolerance);
      // Remove invalidation listeners before our one atomic document write.
      this.clearStroke();
      cadFreehandNotice(this.editor).set(applyCadFreehandPlan(this.editor, plan) ? 'drawn' : 'failed');
    } catch (error) { this.clearStroke(errorCode(error)); }
  };
  private append(stroke: Stroke, info: TLPointerEventInfo): boolean {
    const sample = this.sample(info);
    if (!sample) { this.requestCancel('freehand-invalid'); return false; }
    stroke.lastScreenPoint = { x: info.point.x, y: info.point.y };
    const previous = stroke.samples.at(-1)!;
    if (Math.hypot(sample.x - previous.x, sample.y - previous.y) <= 1e-8) {
      previous.pressure = Math.max(previous.pressure, sample.pressure);
      return true;
    }
    if (stroke.samples.length >= MAX_CAD_FREEHAND_SAMPLES) { this.requestCancel('freehand-limit'); return false; }
    stroke.samples.push(sample); return true;
  }
  private publish(stroke: Stroke): void {
    if (this.stroke !== stroke) return;
    let geometry: CadFreehandGeometry | null = null, error: string | null = null;
    try { geometry = buildCadFreehandGeometry(stroke.samples, stroke.options, stroke.closeTolerance); }
    catch (cause) {
      error = errorCode(cause);
      // A curve begins with one point; zero-pressure ink also has no area yet.
      if (error === 'freehand-empty') error = null;
      else { this.requestCancel(error); return; }
    }
    const first = stroke.samples[0], last = stroke.samples.at(-1)!;
    cadFreehandPreview(this.editor).set({
      samples: stroke.samples.map(sample => ({ ...sample })), geometry, mode: stroke.options.mode,
      sampleCount: stroke.samples.length, isPen: stroke.isPen, opacity: stroke.opacity,
      autoClose: stroke.options.autoClose,
      closeCandidate: stroke.options.autoClose && stroke.samples.length >= 3 && Math.hypot(first.x - last.x, first.y - last.y) <= stroke.closeTolerance,
      error,
    });
  }

  private installGuards(stroke: Stroke): void {
    const container = this.editor.getContainer(), doc = container.ownerDocument, win = stroke.window;
    const scope = container.closest('[data-testid="drawing-workspace"]') ?? container;
    let releasing = false, stopGuard = () => {};
    const cancel = () => this.requestCancel('canceled');
    const ownsPointer = (event: PointerEvent) => event.pointerId === stroke.pointerId;
    const pointerCancel = (event: PointerEvent) => { if (ownsPointer(event)) cancel(); };
    const lostCapture = (event: PointerEvent) => { if (ownsPointer(event) && !releasing) cancel(); };
    const pointerUp = (event: PointerEvent) => {
      if (!ownsPointer(event)) return;
      releasing = true;
      // Native canvas handlers release capture before dispatching pointer_up.
      // If a form swallowed the release, discard the unfinished stroke after
      // propagation instead of leaving a preview or inventing a commit.
      queueMicrotask(() => { if (this.stroke === stroke) cancel(); });
    };
    const blockOtherPointer = (event: PointerEvent) => {
      if (ownsPointer(event) || !(event.target instanceof Node) || !scope.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      (event as PointerEvent & { isKilled?: boolean }).isKilled = true;
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) cancel();
    };
    const visibility = () => { if (doc.visibilityState === 'hidden') cancel(); };
    const viewChanged = () => this.requestCancel('stale');
    const dispose = () => this.clearStroke(undefined, false);
    stroke.cleanup = () => {
      stopGuard(); this.editor.disposables.delete(dispose);
      win.removeEventListener('pointerdown', blockOtherPointer, true);
      win.removeEventListener('pointermove', blockOtherPointer, true);
      win.removeEventListener('pointerup', blockOtherPointer, true);
      win.removeEventListener('pointerup', pointerUp, true);
      win.removeEventListener('pointercancel', pointerCancel, true);
      win.removeEventListener('lostpointercapture', lostCapture, true);
      win.removeEventListener('blur', cancel);
      win.removeEventListener('wheel', viewChanged, true); win.removeEventListener('scroll', viewChanged, true);
      doc.removeEventListener('focusin', focus, true); doc.removeEventListener('visibilitychange', visibility);
      // Pen capture belongs to the input bridge. Mouse capture belongs to the
      // native canvas; release it when cancellation interrupts that gesture.
      if (!stroke.isPen) for (const element of [container, ...container.querySelectorAll('.tl-canvas')]) {
        try { if (element.hasPointerCapture(stroke.pointerId)) element.releasePointerCapture(stroke.pointerId); }
        catch { /* A detached canvas has already released capture. */ }
      }
    };
    this.editor.disposables.add(dispose);
    win.addEventListener('pointerdown', blockOtherPointer, { capture: true, passive: false });
    win.addEventListener('pointermove', blockOtherPointer, { capture: true, passive: false });
    win.addEventListener('pointerup', blockOtherPointer, { capture: true, passive: false });
    win.addEventListener('pointerup', pointerUp, true); win.addEventListener('pointercancel', pointerCancel, true);
    win.addEventListener('lostpointercapture', lostCapture, true); win.addEventListener('blur', cancel);
    win.addEventListener('wheel', viewChanged, { capture: true, passive: true }); win.addEventListener('scroll', viewChanged, true);
    doc.addEventListener('focusin', focus, true); doc.addEventListener('visibilitychange', visibility);
    const stop = react('invalidate freehand preview', () => {
      if (this.stroke !== stroke || stroke.invalidated || this.fresh(stroke)) return;
      stroke.invalidated = true;
      // Native cancel batches state updates, which cannot run inside an atom
      // reaction. Mark stale immediately, then cancel outside that cycle; a
      // synchronous release still sees invalidated and cannot commit.
      queueMicrotask(() => { if (this.stroke === stroke) this.requestCancel('stale'); });
    });
    if (this.stroke === stroke) stopGuard = stop; else stop();
  }
}
