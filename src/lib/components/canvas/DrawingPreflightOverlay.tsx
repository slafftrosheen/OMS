import React from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { readPreflightHighlight } from './drawing-preflight';

/** Page-space marker. It lives above the drawing and outside the shape store. */
export function DrawingPreflightOverlay() {
  const editor = useEditor();
  const highlight = useValue('drawing preflight overlay', () => readPreflightHighlight(editor), [editor]);
  const zoom = useValue('drawing preflight overlay zoom', () => editor.getZoomLevel(), [editor]);
  if (!highlight) return null;
  const { from, to } = highlight;
  const segment = { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  const accent = 'var(--rf-cv-snap, #dc2626)', sheet = 'var(--rf-cv-sheet, white)';
  return <svg width={1} height={1} aria-hidden="true" data-testid="drawing-preflight-highlight"
    style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1000001 }}>
    <line {...segment} stroke={sheet} strokeWidth={8 / zoom} strokeLinecap="round" />
    <line {...segment} stroke={accent} strokeWidth={4 / zoom} strokeLinecap="round" />
    {[from, to].map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={4 / zoom}
      fill={sheet} stroke={accent} strokeWidth={2 / zoom} />)}
  </svg>;
}
