import type { Editor, TLPointerEventInfo } from '@tldraw/tldraw';

export interface DrawingPenOrientation { tiltX: number; tiltY: number }
const orientations = new WeakMap<Editor, WeakMap<TLPointerEventInfo, Readonly<DrawingPenOrientation>>>();

/** Pointer Events already defines tilt in the screen coordinate system. Missing
 * data must remain missing: a real (0, 0) sample means an upright pen and cannot
 * distinguish unsupported hardware from that orientation. */
export function validDrawingPenOrientation(value: Partial<DrawingPenOrientation>): value is DrawingPenOrientation {
  return typeof value.tiltX === 'number' && Number.isFinite(value.tiltX) && Math.abs(value.tiltX) <= 90 &&
    typeof value.tiltY === 'number' && Number.isFinite(value.tiltY) && Math.abs(value.tiltY) <= 90;
}

/** Associate orientation with the actual public event, not a mutable "latest"
 * value. Native pointer_move dispatch is queued until the next editor tick;
 * each coalesced sample therefore needs its own identity until consumption.
 * Weak keys release metadata together with the editor and queued events. */
export function recordDrawingPenOrientation(editor: Editor, info: TLPointerEventInfo, value: Partial<DrawingPenOrientation>): void {
  if (!info.isPen || !validDrawingPenOrientation(value)) { orientations.get(editor)?.delete(info); return; }
  let events = orientations.get(editor);
  if (!events) { events = new WeakMap(); orientations.set(editor, events); }
  events.set(info, Object.freeze({ tiltX: value.tiltX, tiltY: value.tiltY }));
}

export function readDrawingPenOrientation(editor: Editor, info: TLPointerEventInfo): Readonly<DrawingPenOrientation> | null {
  return info.isPen ? orientations.get(editor)?.get(info) ?? null : null;
}
