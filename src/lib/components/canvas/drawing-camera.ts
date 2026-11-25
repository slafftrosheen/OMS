import { atom, type Editor, type TLCameraOptions, type TLPageId } from '@tldraw/tldraw';

// CAD imports are in drawing units and can span several hundred metres.
export const DRAWING_CAMERA_OPTIONS: Partial<TLCameraOptions> = {
  wheelBehavior: 'zoom',
  zoomSteps: [.00005, .0001, .00025, .0005, .001, .0025, .005, .01, .025, .05, .1, .25, .5, 1, 2, 4, 8],
};

export function fitDrawingSelection(editor: Editor): boolean {
  const bounds = editor.getSelectionPageBounds();
  if (!bounds) return false;
  editor.zoomToBounds(bounds);
  return true;
}

type DrawingView = { page: TLPageId; x: number; y: number; zoom: number };
const MAX_DRAWING_VIEWS = 24;

/** Camera-only session history. Save the page-space centre so opening a docker
 * or resizing the window before returning still centres the same detail. */
export function createDrawingViewHistory(editor: Editor) {
  const views = atom<DrawingView[]>('previous drawing views', []);
  let restoring = false;
  const lastIndex = () => {
    const page = editor.getCurrentPageId();
    return views.get().findLastIndex(view => view.page === page);
  };
  const canMove = () => !editor.getCameraOptions().isLocked && !editor.getInstanceState().followingUserId;
  return {
    available: () => canMove() && lastIndex() >= 0,
    listen(root: HTMLElement) {
      let lastMove = -Infinity, lastWheel = -Infinity, lastPage: TLPageId | undefined;
      const gap = 250;
      const begin = () => { lastMove = lastWheel = -Infinity; };
      const wheel = () => {
        const now = performance.now();
        if (now - lastWheel > gap) lastMove = -Infinity;
        lastWheel = now;
      };
      // Consecutive frames of a pan, wheel gesture or zoom animation are one
      // visit. Discrete control presses start a new visit even when rapid.
      root.addEventListener('pointerdown', begin, true);
      root.addEventListener('keydown', begin, true);
      root.addEventListener('change', begin, true);
      root.addEventListener('wheel', wheel, true);
      const stop = editor.sideEffects.registerAfterChangeHandler('camera', (before, after, source) => {
        if (source !== 'user' || before.id !== editor.getCamera().id || editor.getInstanceState().followingUserId ||
            before.x === after.x && before.y === after.y && before.z === after.z) return;
        if (restoring) { begin(); return; }
        const page = editor.getCurrentPageId(), now = performance.now();
        if (page !== lastPage || lastMove === -Infinity || (!editor.inputs.isPointing && now - lastMove > gap)) {
          const { w, h } = editor.getViewportScreenBounds();
          const view = { page, x: w / (2 * before.z) - before.x, y: h / (2 * before.z) - before.y, zoom: before.z };
          views.set([...views.get(), view].slice(-MAX_DRAWING_VIEWS));
        }
        lastPage = page;
        lastMove = now;
      });
      return () => {
        stop();
        root.removeEventListener('pointerdown', begin, true);
        root.removeEventListener('keydown', begin, true);
        root.removeEventListener('change', begin, true);
        root.removeEventListener('wheel', wheel, true);
      };
    },
    restore() {
      const index = lastIndex();
      if (index < 0 || !canMove()) return false;
      const previous = views.get()[index], { w, h } = editor.getViewportScreenBounds();
      restoring = true;
      try {
        editor.setCamera({ x: w / (2 * previous.zoom) - previous.x, y: h / (2 * previous.zoom) - previous.y, z: previous.zoom });
        views.set(views.get().filter((_, i) => i !== index));
      } finally { restoring = false; }
      return true;
    }
  };
}

type WheelStep = { x: number; y: number; dx: number; dy: number; pan: boolean };
const nativeScroll = 'input,textarea,select,button,a[href],iframe,video,[contenteditable]:not([contenteditable="false"]),[data-drawing-native-wheel]';

/** Process real wheel events once per frame. The native gesture hook relies
 * on focus and timing heuristics intended for a whiteboard. Pinch and hand
 * gestures still go through the editor. */
export function installDrawingWheel(editor: Editor): () => void {
  const container = editor.getContainer(), win = container.ownerDocument.defaultView;
  if (!win) return () => {};
  let frame = 0;
  let steps: WheelStep[] = [];
  let page: ReturnType<Editor['getCurrentPageId']>;

  function apply() {
    frame = 0;
    const pending = steps;
    steps = [];
    const { isLocked, zoomSpeed, panSpeed, zoomSteps, wheelBehavior } = editor.getCameraOptions();
    if (page !== editor.getCurrentPageId() || isLocked || wheelBehavior === 'none' || editor.getIsMenuOpen()) return;
    const base = editor.getBaseZoom(), min = zoomSteps[0] * base, max = zoomSteps.at(-1)! * base;
    const viewport = editor.getViewportScreenBounds();
    const camera = editor.getCamera();
    let { x, y, z } = camera;
    for (const step of pending) {
      if (step.pan) {
        x -= step.dx * panSpeed / z;
        y -= step.dy * panSpeed / z;
        continue;
      }
      const next = Math.max(min, Math.min(max, z * Math.exp(-Math.max(-160, Math.min(160, step.dy)) * zoomSpeed / 720)));
      const offset = 1 / next - 1 / z;
      x += (step.x - viewport.x) * offset;
      y += (step.y - viewport.y) * offset;
      z = next;
    }
    if (camera.x !== x || camera.y !== y || camera.z !== z) editor.setCamera({ x, y, z });
  }

  function wheel(event: WheelEvent) {
    const target = event.target;
    if (event.defaultPrevented || !(target instanceof Element) || !target.closest('.tl-canvas') ||
        target.closest(nativeScroll) || editor.getIsMenuOpen() || editor.inputs.isPinching) return;
    const editing = editor.getEditingShape();
    if (editing && editor.getShapeUtil(editing).canScroll(editing) &&
        editor.getShapePageBounds(editing)?.containsPoint(editor.screenToPage({ x: event.clientX, y: event.clientY }))) return;
    const { isLocked, wheelBehavior } = editor.getCameraOptions();
    if (isLocked || wheelBehavior === 'none') return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? editor.getViewportScreenBounds().h : 1;
    const dx = event.deltaX * unit, dy = event.deltaY * unit;
    if (!dx && !dy || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextPage = editor.getCurrentPageId();
    if (page !== nextPage) { page = nextPage; steps = []; }
    const modifiedZoom = event.ctrlKey || event.metaKey;
    const pan = !modifiedZoom && (event.shiftKey || wheelBehavior === 'pan' || Math.abs(dx) > Math.abs(dy));
    steps.push({ x: event.clientX, y: event.clientY, dx: pan && event.shiftKey && !dx ? dy : dx,
      dy: pan && event.shiftKey && !dx ? 0 : dy, pan });
    if (!frame) frame = win!.requestAnimationFrame(apply);
  }

  container.addEventListener('wheel', wheel, { capture: true, passive: false });
  return () => {
    container.removeEventListener('wheel', wheel, true);
    if (frame) win.cancelAnimationFrame(frame);
  };
}
