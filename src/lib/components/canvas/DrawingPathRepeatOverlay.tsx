import React from 'react';
import { atom, useEditor, useValue, type Editor } from '@tldraw/tldraw';
import type { DrawingPathRepeatPlan } from './drawing-path-repeat';

const createPreview = () => atom<DrawingPathRepeatPlan | null>('drawing path repeat preview', null);
const previews = new WeakMap<Editor, ReturnType<typeof createPreview>>();

export function drawingPathRepeatPreview(editor: Editor) {
  let preview = previews.get(editor);
  if (!preview) {
    preview = createPreview();
    previews.set(editor, preview);
  }
  return preview;
}

export function DrawingPathRepeatOverlay() {
  const editor = useEditor();
  const plan = useValue('path repeat overlay', () => drawingPathRepeatPreview(editor).get(), [editor]);
  if (!plan) return null;
  return <svg width={1} height={1} className="drawing-repeat-overlay" data-testid="drawing-path-repeat-overlay" aria-hidden="true">
    <path className="drawing-repeat-overlay-margin" d={plan.guidePath} vectorEffect="non-scaling-stroke" />
    {plan.outlines.map((outline, index) => <polygon key={index} className="drawing-repeat-overlay-copy"
      points={outline.map(point => `${point.x},${point.y}`).join(' ')} vectorEffect="non-scaling-stroke" />)}
  </svg>;
}
