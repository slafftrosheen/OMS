import React from 'react';
import { atom, useEditor, useValue, type Editor } from '@tldraw/tldraw';
import type { RepeatGridPlan } from './drawing-operations';

function createPreview() {
  return atom<RepeatGridPlan | null>('drawing repeat preview', null);
}

const previews = new WeakMap<Editor, ReturnType<typeof createPreview>>();

export function drawingRepeatPreview(editor: Editor) {
  let preview = previews.get(editor);
  if (!preview) {
    preview = createPreview();
    previews.set(editor, preview);
  }
  return preview;
}

/** The tldraw camera already transforms this layer from drawing to screen coordinates. */
export function DrawingRepeatOverlay() {
  const editor = useEditor();
  const plan = useValue('repeat grid overlay', () => drawingRepeatPreview(editor).get(), [editor]);
  if (!plan) return null;

  const { x, y, w, h } = plan.bounds;
  const sheet = plan.sheet;
  return <svg width={1} height={1} className="drawing-repeat-overlay" data-testid="drawing-repeat-overlay" aria-hidden="true">
    {sheet && sheet.margin > 0 && <rect className="drawing-repeat-overlay-margin"
      x={sheet.bounds.x + sheet.margin} y={sheet.bounds.y + sheet.margin}
      width={sheet.bounds.w - 2 * sheet.margin} height={sheet.bounds.h - 2 * sheet.margin} vectorEffect="non-scaling-stroke" />}
    {plan.offsets.map((offset, index) => <path key={index} className="drawing-repeat-overlay-copy"
      d={`M ${x + offset.x} ${y + offset.y} h ${w} v ${h} h ${-w} Z`} vectorEffect="non-scaling-stroke" />)}
  </svg>;
}
