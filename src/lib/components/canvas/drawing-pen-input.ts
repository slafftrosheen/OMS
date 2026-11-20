import { atom, react, type Editor, type TLPointerEventInfo, type TLShapeId } from '@tldraw/tldraw';
import { assertCadEditable } from './cad-plans';
import { isCadNodeEditing } from './cad-node-selection';
import { hasCanvasDraft } from './canvas-document';
import { isDrawingPointerGestureActive, suppressDrawingKeyRelease } from './drawing-pointer-gesture';
import { drawingPenSettings, drawingPenStorageStatus, drawingPenSettingsPersisted, mapDrawingPenPressure, readDrawingPenSettings, type DrawingPenSettings } from './drawing-pen-settings';
import { recordDrawingPenOrientation, validDrawingPenOrientation } from './drawing-pen-samples';

export type DrawingPenNotice = null | 'ink-retained' | 'canceled' | 'readonly' | 'storage-unavailable';
export interface DrawingPenDiagnostics {
  detectedPen: boolean; pointerType: string; pressure: number; mappedPressure: number;
  minPressure: number | null; maxPressure: number | null; tiltX: number; tiltY: number;
  twist: number; tangentialPressure: number; buttons: number; contact: boolean;
  coalescedAvailable: boolean; secureContext: boolean; coalescedSamples: number; notice: DrawingPenNotice;
}
const diagnostics = new WeakMap<Editor, ReturnType<typeof atom<DrawingPenDiagnostics>>>();
const installations = new WeakMap<Editor, () => void>();
const canceledReleases = new WeakMap<Editor, Set<number>>();
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number, fallback = 0) => Math.min(max, Math.max(min, finite(value, fallback)));
function initialDiagnostics(editor: Editor): DrawingPenDiagnostics {
  const win = editor.getContainer().ownerDocument.defaultView;
  return { detectedPen: false, pointerType: '', pressure: 0, mappedPressure: 0, minPressure: null, maxPressure: null,
    tiltX: 0, tiltY: 0, twist: 0, tangentialPressure: 0, buttons: 0, contact: false,
    coalescedAvailable: !!win?.PointerEvent?.prototype.getCoalescedEvents,
    secureContext: !!win?.isSecureContext, coalescedSamples: 0, notice: drawingPenSettingsPersisted(editor) ? null : 'storage-unavailable' };
}
export function drawingPenDiagnostics(editor: Editor) {
  let value = diagnostics.get(editor);
  if (!value) { value = atom<DrawingPenDiagnostics>('Drawing pen input', initialDiagnostics(editor)); diagnostics.set(editor, value); }
  return value;
}
export function resetDrawingPenDiagnostics(editor: Editor): void { drawingPenDiagnostics(editor).set(initialDiagnostics(editor)); }

/** Also used by the independent test pad. It observes input without dispatching
 * editor events or changing a drawing. Pressure range excludes pen hover. */
export function recordDrawingPenSample(editor: Editor, event: PointerEvent): DrawingPenDiagnostics {
  const state = drawingPenDiagnostics(editor), before = state.get(), pen = event.pointerType === 'pen';
  const pressure = clamp(event.pressure, 0, 1), buttons = finite(event.buttons);
  const contact = pen && !['pointerup', 'pointercancel', 'lostpointercapture'].includes(event.type) && !!(buttons & 33);
  const next: DrawingPenDiagnostics = { ...before, detectedPen: before.detectedPen || pen,
    pointerType: event.pointerType || 'mouse', pressure,
    mappedPressure: mapDrawingPenPressure(pressure, readDrawingPenSettings(editor), editor.getCurrentToolId()),
    minPressure: contact ? Math.min(before.minPressure ?? pressure, pressure) : before.minPressure,
    maxPressure: contact ? Math.max(before.maxPressure ?? pressure, pressure) : before.maxPressure,
    tiltX: clamp(event.tiltX, -90, 90), tiltY: clamp(event.tiltY, -90, 90),
    twist: clamp(event.twist, 0, 359), tangentialPressure: clamp(event.tangentialPressure, -1, 1),
    buttons, contact, coalescedAvailable: before.coalescedAvailable || typeof event.getCoalescedEvents === 'function' };
  state.set(next); return next;
}

type Kind = 'ink' | 'freehand' | 'native' | 'pan' | 'eraser' | 'blocked';
interface Sample { x: number; y: number; pressure: number; tiltX?: number; tiltY?: number; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }
interface Session {
  pointerId: number; owned: boolean; kind: Kind; tool: string; page: string; view: string;
  preferences: DrawingPenSettings; last: Sample; lastSent: string; capture: Element | null; stale: boolean;
}
const INK = new Set(['draw', 'highlight']);
const ignored = 'input,textarea,select,button,a[href],video,audio,iframe,[contenteditable]:not([contenteditable="false"]),' +
  '[role="button"],[role="textbox"],.canvas-form-sheet,[data-drawing-guide-control],[data-drawing-skew-edge],' +
  '[data-drawing-rotate-corner],[data-drawing-rotation-pivot],.tl-user-handles,.tl-selection__fg,.tlui-menu';
const consume = (event: Event) => {
  event.preventDefault(); event.stopImmediatePropagation(); (event as Event & { isKilled?: boolean }).isKilled = true;
};
const sample = (event: PointerEvent): Sample => ({ x: event.clientX, y: event.clientY, pressure: clamp(event.pressure, 0, 1, .5),
  ...(validDrawingPenOrientation(event) ? { tiltX: event.tiltX, tiltY: event.tiltY } : {}),
  shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey });
const viewport = (editor: Editor) => {
  const c = editor.getCamera(), b = editor.getViewportScreenBounds();
  return JSON.stringify([c.x, c.y, c.z, b.x, b.y, b.w, b.h]);
};

/** Public DOM capture and Editor.dispatch bridge. Native Pick/CAD/handle input
 * remains native; only continuous pen ink and momentary mapped buttons are
 * owned here. No private statechart or device/vendor API is patched. */
export function installDrawingPenInput(editor: Editor): () => void {
  installations.get(editor)?.();
  const container = editor.getContainer(), doc = container.ownerDocument, win = doc.defaultView;
  if (!win) return () => {};
  const scope = container.closest('[data-testid="drawing-workspace"]') ?? container;
  if (readDrawingPenSettings(editor).mode === 'pen-only') editor.updateInstanceState({ isPenMode: true });
  const releases = canceledReleases.get(editor) ?? new Set<number>(); canceledReleases.set(editor, releases);
  let current: Session | null = null, ending = false, disposed = false, discardErasing = false, observedPointer: number | null = null, lastPenEnd = -Infinity, suppressContextUntil = -Infinity;
  const epoch = atom('Drawing pen gesture lifecycle', 0);
  const notify = () => epoch.update(n => n + 1);
  const within = (target: EventTarget | null, root: Element = container): target is Element => target instanceof Element && root.contains(target);
  const artwork = (target: EventTarget | null): target is Element => within(target) && !!target.closest('.tl-canvas') && !target.closest(ignored);
  const observe = (event: PointerEvent) => { observedPointer = event.pointerId; recordDrawingPenSample(editor, event); };
  const observeRelease = (event: PointerEvent) => {
    if (observedPointer !== event.pointerId && !(within(event.target) && event.pointerType === 'pen')) return;
    recordDrawingPenSample(editor, event);
    drawingPenDiagnostics(editor).update(value => ({ ...value, contact: false, buttons: 0 })); observedPointer = null;
  };
  const setNotice = (notice: DrawingPenNotice) => drawingPenDiagnostics(editor).update(value => ({ ...value,
    notice: drawingPenSettingsPersisted(editor) ? notice : 'storage-unavailable' }));
  const filterErasing = (ids: readonly TLShapeId[]) => ids.filter(id => {
    try { assertCadEditable(editor, [id]); return true; } catch { return false; }
  });
  const protectErasing = () => {
    const ids = editor.getErasingShapeIds(), allowed = filterErasing(ids);
    if (allowed.length !== ids.length) editor.setErasingShapes(allowed);
  };
  // Filter whole roots, before native deletion expands their descendants.
  // A per-record delete veto could otherwise leave a partially erased group.
  const stopErase = editor.sideEffects.registerBeforeChangeHandler('instance_page_state', (_prev, next) => {
    if (editor.getCurrentToolId() !== 'eraser' || !next.erasingShapeIds.length) return next;
    const ids = discardErasing ? [] : filterErasing(next.erasingShapeIds);
    return ids.length === next.erasingShapeIds.length ? next : { ...next, erasingShapeIds: ids };
  });
  const normalKind = (tool: string): Kind => INK.has(tool) ? 'ink' : tool === 'cad-freehand' ? 'freehand' : tool === 'eraser' ? 'eraser' : 'native';
  const action = (event: PointerEvent, prefs: DrawingPenSettings): Kind | null => {
    if (event.buttons & 32 || event.type === 'pointerdown' && event.button === 5) return 'eraser';
    if (event.buttons & 4 || event.type === 'pointerdown' && event.button === 1) return 'pan';
    if ((event.buttons & 2 || event.type === 'pointerdown' && event.button === 2) && prefs.barrelAction !== 'context') return prefs.barrelAction;
    if (event.buttons & 1 || event.type === 'pointerdown' && event.button === 0) return normalKind(current?.tool ?? editor.getCurrentToolId());
    return null;
  };
  const dispatch = (session: Session, name: 'pointer_down' | 'pointer_move' | 'pointer_up', point: Sample) => {
    const z = mapDrawingPenPressure(point.pressure, session.preferences, session.tool);
    const info: TLPointerEventInfo = { type: 'pointer', name, target: 'canvas', point: { x: point.x, y: point.y, z },
      pointerId: session.pointerId, isPen: true, button: session.kind === 'pan' ? 1 : 0,
      shiftKey: point.shiftKey, ctrlKey: point.ctrlKey || point.metaKey, altKey: point.altKey };
    recordDrawingPenOrientation(editor, info, point);
    editor.dispatch(info);
  };
  const restoreTool = (session: Session) => {
    if (session.kind === 'eraser' && editor.getCurrentToolId() === 'eraser') editor.setCurrentTool(session.tool);
  };
  function finishPart(session: Session, interrupted: boolean) {
    if (!session.owned || session.kind === 'blocked') return;
    if (session.kind === 'eraser') {
      // Native Erasing.cancel bails its history mark. Erasing itself has not
      // written artwork yet, so discard its hit list instead; this preserves an
      // unrelated external edit that arrived while the eraser was held down.
      discardErasing = interrupted;
      try {
        if (interrupted) editor.setErasingShapes([]); else protectErasing();
        dispatch(session, 'pointer_move', session.last); dispatch(session, 'pointer_up', session.last);
      } finally { discardErasing = false; }
      if (interrupted) setNotice('canceled');
      restoreTool(session);
    } else if (session.kind === 'pan') {
      dispatch(session, 'pointer_move', session.last); dispatch(session, 'pointer_up', session.last); editor.stopCameraAnimation();
    } else if (session.kind === 'freehand' && interrupted) {
      if (editor.getCurrentToolId() === session.tool) { editor.cancel(); dispatch(session, 'pointer_up', session.last); }
      setNotice('canceled');
    } else if (session.kind === 'ink' && interrupted) {
      if (editor.getCurrentToolId() === session.tool) {
        dispatch(session, 'pointer_move', session.last);
        // Native pointer_up clears input flags but skips the tool when a menu
        // is open. Complete explicitly first. If readonly just became active,
        // native completion retains the existing ink without bypassing its
        // write guard; the tool still returns to idle.
        editor.complete(); dispatch(session, 'pointer_up', session.last);
      }
      setNotice('ink-retained');
    } else { dispatch(session, 'pointer_move', session.last); dispatch(session, 'pointer_up', session.last); }
  }
  function finish(interrupted: boolean) {
    const session = current;
    if (!session || ending) return;
    ending = true;
    try {
      finishPart(session, interrupted);
      if (!session.owned && interrupted && editor.getCurrentToolId() === session.tool) { editor.cancel(); dispatch(session, 'pointer_up', session.last); }
      // A tool switch may already have discarded its old draft. Still release
      // native pointing/buttons through the public dispatcher; the eventual
      // physical release is consumed below. Do not move or cancel the new tool.
      if (interrupted && (editor.inputs.isPointing || editor.inputs.buttons.has(session.kind === 'pan' ? 1 : 0)))
        dispatch(session, 'pointer_up', session.last);
      if (interrupted && session.kind === 'pan' && editor.inputs.isPanning && !editor.inputs.keys.has('Space')) {
        // Menu-open pointer_up returns before native panning cleanup. The
        // public Space release also ends middle-button panning once its
        // button is released, without disturbing a physically held Space.
        editor.dispatch({ type: 'keyboard', name: 'key_up', key: ' ', code: 'Space',
          shiftKey: false, ctrlKey: false, altKey: false });
      }
    } finally {
      if (interrupted) {
        releases.add(session.pointerId);
        while (releases.size > 16) releases.delete(releases.values().next().value!);
      }
      current = null; lastPenEnd = win!.performance.now();
      drawingPenDiagnostics(editor).update(value => ({ ...value, contact: false, buttons: 0 }));
      try { if (session.capture?.hasPointerCapture(session.pointerId)) session.capture.releasePointerCapture(session.pointerId); } catch { /* Already detached. */ }
      ending = false; notify();
    }
  }
  function startPart(session: Session, kind: Kind) {
    session.kind = kind; session.lastSent = '';
    if (kind === 'eraser') {
      const idle = editor.getPath().endsWith('.idle') || editor.getPath() === session.tool && !hasCanvasDraft(editor);
      if (editor.getInstanceState().isReadonly || isCadNodeEditing(editor) || !idle) {
        session.kind = 'blocked'; setNotice(editor.getInstanceState().isReadonly ? 'readonly' : 'canceled'); return;
      }
      editor.setCurrentTool('eraser');
    }
    if (kind === 'pan' || kind === 'eraser') suppressContextUntil = win!.performance.now() + 700;
    dispatch(session, 'pointer_down', session.last);
  }
  function transition(session: Session, next: Kind) {
    if (session.kind === next || !session.owned) return;
    ending = true;
    try {
      // A pressure stroke ends before its barrel action begins. A CAD draft is
      // preview-only and is discarded; returning to contact starts a fresh one.
      finishPart(session, session.kind === 'freehand');
      session.view = viewport(editor);
      if (next === 'native') session.kind = 'blocked';
      else startPart(session, next);
    } finally { ending = false; notify(); }
  }
  const down = (event: PointerEvent) => {
    if (!within(event.target, scope)) return;
    releases.delete(event.pointerId);
    if (current && event.pointerId !== current.pointerId) { consume(event); return; }
    if (current || !within(event.target)) return;
    const preferences = readDrawingPenSettings(editor);
    if (event.pointerType !== 'pen') {
      if (!event.target.closest('.tl-canvas') || event.target.closest('input,textarea,select,button,a[href],video,audio,iframe,.canvas-form-sheet,[contenteditable]:not([contenteditable="false"])')) return;
      if (preferences.mode === 'pen-only' || event.pointerType === 'touch' && win.performance.now() - lastPenEnd < 250) { consume(event); return; }
      editor.updateInstanceState({ isPenMode: false }); return;
    }
    // Embedded controls own their pen input. Observing contact before this
    // exclusion can disable a UI field before its click reaches that field.
    if (!artwork(event.target)) return;
    observe(event);
    if (event.isPrimary === false || isDrawingPointerGestureActive(editor) || editor.getIsMenuOpen()) return;
    const kind = action(event, preferences);
    if (!kind) return;
    const owned = kind === 'ink' || kind === 'freehand' || kind === 'pan' || kind === 'eraser';
    if (owned && kind !== 'pan' && editor.getInstanceState().isReadonly) { consume(event); setNotice('readonly'); return; }
    if (kind === 'ink' && !editor.getPath().endsWith('.idle')) return;
    if (!owned && editor.getInstanceState().isReadonly) return;
    editor.updateInstanceState({ isPenMode: true });
    ending = true;
    try {
      current = { pointerId: event.pointerId, owned, kind, tool: editor.getCurrentToolId(), page: editor.getCurrentPageId(), view: viewport(editor),
        preferences, last: sample(event), lastSent: '', capture: event.target.closest('.tl-canvas'), stale: false };
      setNotice(null);
      if (!owned) return;
      consume(event); editor.focus();
      current.capture = event.target.closest('.tl-canvas') ?? container;
      try { current.capture.setPointerCapture(event.pointerId); } catch { /* Document listeners retain this pointer. */ }
      startPart(current, kind);
    } finally { ending = false; notify(); }
  };
  const move = (event: PointerEvent) => {
    if (!current) { if (artwork(event.target) && event.pointerType === 'pen') observe(event); return; }
    if (event.pointerId !== current.pointerId) {
      if (within(event.target, scope)) consume(event); return;
    }
    recordDrawingPenSample(editor, event);
    const session = current; session.last = sample(event);
    if (session.stale) { if (session.owned) consume(event); finish(true); return; }
    if (!session.owned) return;
    consume(event);
    const next = action(event, session.preferences);
    if (!next) { finish(false); return; }
    transition(session, next);
    if (current !== session || session.kind === 'blocked') return;
    if (session.kind === 'pan' || session.kind === 'eraser') suppressContextUntil = win.performance.now() + 700;
    let points = [event];
    if (session.kind === 'ink' || session.kind === 'freehand') {
      try {
        const coalesced = event.getCoalescedEvents?.();
        if (coalesced?.length) {
          const valid = coalesced.filter(p => p.pointerId === event.pointerId && Number.isFinite(p.clientX) && Number.isFinite(p.clientY));
          // The parent is an aggregate of these samples, not another raw point.
          // Appending it can replace the last real pressure with an average.
          points = valid.length ? valid : [event];
          if (points.length > 64) points = Array.from({ length: 64 }, (_, i) => points[Math.round(i * (points.length - 1) / 63)]);
          drawingPenDiagnostics(editor).update(value => ({ ...value, coalescedAvailable: true, coalescedSamples: value.coalescedSamples + (valid.length ? points.length : 0) }));
        }
      } catch { /* Ordinary pressure events also work in insecure/older contexts. */ }
    }
    for (const point of points) {
      const value = sample(point), key = JSON.stringify(value);
      if (session.lastSent === key) continue;
      session.lastSent = key; dispatch(session, 'pointer_move', value);
    }
    session.last = sample(points[points.length - 1]);
  };
  const up = (event: PointerEvent) => {
    observeRelease(event);
    if (releases.delete(event.pointerId)) { consume(event); return; }
    const session = current;
    if (!session || event.pointerId !== session.pointerId) {
      if (current && within(event.target, scope)) consume(event); return;
    }
    session.last = sample(event); recordDrawingPenSample(editor, event);
    if (session.stale) { if (session.owned) consume(event); finish(true); return; }
    if (session.owned) { consume(event); finish(false); }
    else {
      // Native handlers receive their own release and target information.
      if (!within(event.target)) dispatch(session, 'pointer_up', session.last);
      current = null; lastPenEnd = win.performance.now(); notify();
    }
  };
  const pointerCancel = (event: PointerEvent) => {
    observeRelease(event);
    if (current?.pointerId === event.pointerId) { if (current.owned) consume(event); finish(true); }
  };
  const lost = (event: PointerEvent) => { observeRelease(event); if (!ending && current?.pointerId === event.pointerId) finish(true); };
  const captured = (event: PointerEvent) => {
    if (current?.pointerId === event.pointerId && within(event.target)) current.capture = event.target;
  };
  const cancel = () => {
    finish(true); observedPointer = null; drawingPenDiagnostics(editor).update(value => ({ ...value, contact: false, buttons: 0 }));
  };
  const visible = () => { if (doc.visibilityState === 'hidden') cancel(); };
  const focus = (event: FocusEvent) => { if (within(event.target) && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) cancel(); };
  const keys = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !current?.owned) return;
    consume(event); suppressDrawingKeyRelease(editor, event.key); finish(true);
  };
  const touch = (event: TouchEvent) => { if (current && within(event.target, scope)) consume(event); };
  const context = (event: MouseEvent) => {
    const pointerType = (event as PointerEvent).pointerType;
    if (within(event.target) && (!pointerType || pointerType === 'pen') && win.performance.now() < suppressContextUntil) consume(event);
  };
  doc.addEventListener('pointerdown', down, { capture: true, passive: false });
  doc.addEventListener('pointermove', move, { capture: true, passive: false });
  doc.addEventListener('pointerup', up, true); doc.addEventListener('pointercancel', pointerCancel, true);
  doc.addEventListener('lostpointercapture', lost, true); doc.addEventListener('gotpointercapture', captured, true); doc.addEventListener('focusin', focus, true);
  doc.addEventListener('visibilitychange', visible); doc.addEventListener('keydown', keys, true);
  doc.addEventListener('touchstart', touch, { capture: true, passive: false }); doc.addEventListener('contextmenu', context, true);
  win.addEventListener('blur', cancel);
  const stop = react('guard drawing pen gesture', () => {
    epoch.get(); const preferences = drawingPenSettings(editor).get(), session = current;
    if (!session || ending || session.stale) return;
    const expectedTool = session.kind === 'eraser' ? 'eraser' : session.tool;
    if (editor.getCurrentPageId() !== session.page || editor.getIsMenuOpen() ||
        session.kind !== 'pan' && editor.getInstanceState().isReadonly ||
        editor.getCurrentToolId() !== expectedTool || JSON.stringify(preferences) !== JSON.stringify(session.preferences) ||
        session.owned && session.kind !== 'pan' && viewport(editor) !== session.view) {
      session.stale = true;
      // Public completion mutates editor/diagnostic atoms; leave the reactive
      // calculation first. Incoming move/up also checks stale before commit.
      win.queueMicrotask(() => { if (!disposed && current === session) finish(true); });
    }
  });
  const stopStorage = react('report pen preference persistence', () => {
    const persisted = drawingPenStorageStatus(editor).get();
    win.queueMicrotask(() => {
      if (disposed || drawingPenSettingsPersisted(editor) !== persisted) return;
      drawingPenDiagnostics(editor).update(value => persisted
        ? value.notice === 'storage-unavailable' ? { ...value, notice: null } : value
        : { ...value, notice: 'storage-unavailable' });
    });
  });
  const cleanup = () => {
    if (disposed) return;
    disposed = true; stop(); stopStorage(); cancel(); stopErase();
    doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', pointerCancel, true);
    doc.removeEventListener('lostpointercapture', lost, true); doc.removeEventListener('gotpointercapture', captured, true); doc.removeEventListener('focusin', focus, true);
    doc.removeEventListener('visibilitychange', visible); doc.removeEventListener('keydown', keys, true);
    doc.removeEventListener('touchstart', touch, true); doc.removeEventListener('contextmenu', context, true);
    win.removeEventListener('blur', cancel);
    if (installations.get(editor) === cleanup) installations.delete(editor);
  };
  installations.set(editor, cleanup); return cleanup;
}
