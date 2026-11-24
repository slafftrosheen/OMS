import type { Editor } from '@tldraw/tldraw';

// These gestures preview outside the native tool state machine. A second pen
// or finger must not start another editor mutation while the first is active.
type DrawingPointerOwner = 'guide' | 'skew' | 'pivot' | 'rotation' | 'nodes';
const gestures = new WeakMap<Editor, { owner: DrawingPointerOwner; token: symbol }>();
const keyReleases = new WeakMap<Editor, Map<string, () => void>>();

/** A finishing key can remove its focused SVG control or return focus to the
 * canvas. Its release still belongs to the custom gesture, not native Pick. */
export function suppressDrawingKeyRelease(editor: Editor, key: string): void {
  const win = editor.getContainer().ownerDocument.defaultView;
  if (!win) return;
  const releases = keyReleases.get(editor) ?? new Map<string, () => void>();
  releases.get(key)?.();
  const cleanup = () => {
    win.removeEventListener('keyup', released, true);
    win.removeEventListener('blur', cleanup);
    releases.delete(key);
    if (!releases.size) keyReleases.delete(editor);
  };
  const released = (event: KeyboardEvent) => {
    if (event.key !== key) return;
    event.preventDefault(); event.stopImmediatePropagation();
    (event as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
    cleanup();
  };
  releases.set(key, cleanup); keyReleases.set(editor, releases);
  win.addEventListener('keyup', released, true);
  win.addEventListener('blur', cleanup);
}

export function clearDrawingKeyReleases(editor: Editor): void {
  for (const cleanup of [...(keyReleases.get(editor)?.values() ?? [])]) cleanup();
}

export function drawingPointerGestureOwner(editor: Editor): DrawingPointerOwner | null {
  return gestures.get(editor)?.owner ?? null;
}

export function isDrawingPointerGestureActive(editor: Editor): boolean {
  return gestures.has(editor);
}

export function claimDrawingPointerGesture(editor: Editor, owner: DrawingPointerOwner, pointerId?: number): (() => void) | null {
  if (gestures.has(editor)) return null;
  const token = Symbol(owner);
  gestures.set(editor, { owner, token });
  const container = editor.getContainer();
  const scope = container.closest('[data-testid="drawing-workspace"]') ?? container;
  const win = container.ownerDocument.defaultView;
  const blockSecondPointer = (event: PointerEvent) => {
    if (pointerId === undefined || event.pointerId === pointerId || !(event.target instanceof Node) || !scope.contains(event.target)) return;
    event.preventDefault(); event.stopPropagation();
    (event as PointerEvent & { isKilled?: boolean }).isKilled = true;
  };
  win?.addEventListener('pointerdown', blockSecondPointer, { capture: true, passive: false });
  return () => {
    win?.removeEventListener('pointerdown', blockSecondPointer, true);
    if (gestures.get(editor)?.token === token) gestures.delete(editor);
  };
}
