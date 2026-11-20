import React from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { CAD_FREEHAND_CLOSE_DISTANCE, cadFreehandPreview } from './CadFreehandTool';
import { curvePathData } from './cad-curves';

/** Page-space preview shares final geometry, while closure guides stay outside
 * the document, the saved drawing and every export format. */
export function CadFreehandOverlay() {
  const editor = useEditor();
  const { preview, zoom } = useValue('Freehand canvas preview', () => ({
    preview: cadFreehandPreview(editor).get(), zoom: editor.getZoomLevel(),
  }), [editor]);
  if (!preview) return null;
  const { geometry } = preview, start = preview.samples[0], scale = 1 / zoom;
  return <svg aria-hidden="true" data-testid="cad-freehand-preview" data-mode={preview.mode}
    data-sample-count={preview.sampleCount} data-close-candidate={preview.closeCandidate}
    width={1} height={1} style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', zIndex: 1000001 }}>
    {geometry && <path data-testid="cad-freehand-result" d={curvePathData(geometry.contours)}
      fill={geometry.paint.fill} fillRule={geometry.fillRule} fillOpacity={geometry.paint.fillOpacity}
      stroke={geometry.paint.stroke} strokeWidth={geometry.paint.strokeWidth} strokeOpacity={geometry.paint.strokeOpacity}
      strokeLinecap={geometry.paint.lineCap} strokeLinejoin={geometry.paint.lineJoin} strokeMiterlimit={geometry.paint.miterLimit}
      strokeDasharray={geometry.paint.dash.length ? geometry.paint.dash.join(' ') : undefined}
      strokeDashoffset={geometry.paint.dashOffset} opacity={preview.opacity} />}
    {start && preview.autoClose && <circle data-testid="cad-freehand-close-target" cx={start.x} cy={start.y}
      r={CAD_FREEHAND_CLOSE_DISTANCE * scale} fill={preview.closeCandidate ? 'var(--color-selected, #4169e1)' : 'var(--color-background, white)'}
      fillOpacity={preview.closeCandidate ? .2 : .7} stroke="var(--color-selected, #4169e1)" strokeWidth={scale}
      strokeDasharray={preview.closeCandidate ? undefined : `${3 * scale} ${3 * scale}`} />}
    {start && !geometry && <circle cx={start.x} cy={start.y} r={2 * scale} fill="var(--color-selected, #4169e1)" />}
  </svg>;
}
