import React from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { cadConstruction } from './cad-construction';

/** Page-space guides live outside the document: never saved or exported. */
export function CadConstructionOverlay() {
  const editor = useEditor();
  const state = useValue('CAD construction guides', () => ({ draft: cadConstruction(editor).get(), zoom: editor.getZoomLevel() }), [editor]);
  if (!state.draft) return null;
  const { points, pointer, valid } = state.draft, scale = 1 / state.zoom;
  const guides = pointer ? [...points, pointer] : points;
  return <svg aria-hidden="true" width={1} height={1} style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', zIndex: 1000001 }}>
    <polyline points={guides.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--color-selected, #4169e1)" strokeWidth={scale} strokeDasharray={`${4 * scale} ${4 * scale}`} />
    {points.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={4 * scale} fill="white" stroke="#4169e1" strokeWidth={1.5 * scale}/><text x={p.x + 8 * scale} y={p.y - 8 * scale} fontSize={12 * scale} fill="#4169e1">{i + 1}</text></g>)}
    {pointer && points.length === 2 && !valid && <path d={`M${pointer.x - 5 * scale},${pointer.y - 5 * scale}l${10 * scale},${10 * scale}m0,${-10 * scale}l${-10 * scale},${10 * scale}`} stroke="#dc2626" strokeWidth={2 * scale} />}
  </svg>;
}
