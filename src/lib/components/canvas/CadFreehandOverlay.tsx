import React from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { CAD_FREEHAND_CLOSE_DISTANCE } from './CadFreehandTool';
import { cadFreehandHover, cadFreehandPreview } from './cad-freehand-state';
import { canvasStrokeWidth } from './cad-paint';
import { curvePathData } from './cad-curves';
import { cadFreehandOptions } from './cad-freehand';
import { readCadFreehandEndpoints } from './cad-freehand-continuation';

/** Page-space preview shares final geometry, while closure guides stay outside
 * the document, the saved drawing and every export format. */
export function CadFreehandOverlay() {
  const editor = useEditor();
  const { preview, zoom, endpoints, hover } = useValue('Freehand canvas preview', () => {
    const options = cadFreehandOptions(editor).get();
    return { preview: cadFreehandPreview(editor).get(), zoom: editor.getZoomLevel(), hover: cadFreehandHover(editor).get(),
      endpoints: editor.getCurrentToolId() === 'cad-freehand' && options.mode === 'curve' && options.continueCurve
        ? readCadFreehandEndpoints(editor) : [] };
  }, [editor]);
  if (!preview && !endpoints.length) return null;
  const geometry = preview?.geometry, start = preview?.samples[0], scale = 1 / zoom;
  const closeTarget = preview?.continuation?.oppositePoint ?? start;
  const active = preview?.continuation ?? hover;
  return <svg aria-hidden="true" data-testid={preview ? 'cad-freehand-preview' : 'cad-freehand-endpoints'} data-mode={preview?.mode}
    data-sample-count={preview?.sampleCount} data-close-candidate={preview?.closeCandidate}
    data-continuation={preview?.continuation?.shapeId}
    width={1} height={1} style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', zIndex: 1000001 }}>
    {endpoints.map(endpoint => {
      const isActive = active?.shapeId === endpoint.shapeId && active.contourIndex === endpoint.contourIndex && active.end === endpoint.end;
      return <g key={`${endpoint.shapeId}:${endpoint.contourIndex}:${endpoint.end}`} data-testid="cad-freehand-endpoint"
        data-shape-id={endpoint.shapeId} data-contour-index={endpoint.contourIndex} data-end={endpoint.end} data-active={isActive}>
        {isActive && <circle data-testid="cad-freehand-endpoint-hover" cx={endpoint.point.x} cy={endpoint.point.y}
          r={CAD_FREEHAND_CLOSE_DISTANCE * scale} fill="var(--color-selected, #4169e1)" fillOpacity={.15} />}
        <circle cx={endpoint.point.x} cy={endpoint.point.y} r={3.5 * scale}
          fill={isActive ? 'var(--color-selected, #4169e1)' : 'var(--color-background, white)'}
          stroke="var(--color-selected, #4169e1)" strokeWidth={1.5 * scale} />
      </g>;
    })}
    {geometry && !preview?.continuation && <path data-testid="cad-freehand-result" d={curvePathData(geometry.contours)}
      fill={geometry.paint.fill} fillRule={geometry.fillRule} fillOpacity={geometry.paint.fillOpacity}
      style={{ strokeWidth: canvasStrokeWidth(geometry.paint) }}
      stroke={geometry.paint.stroke} strokeWidth={geometry.paint.strokeWidth} strokeOpacity={geometry.paint.strokeOpacity}
      strokeLinecap={geometry.paint.lineCap} strokeLinejoin={geometry.paint.lineJoin} strokeMiterlimit={geometry.paint.miterLimit}
      strokeDasharray={geometry.paint.dash.length ? geometry.paint.dash.join(' ') : undefined}
      strokeDashoffset={geometry.paint.dashOffset} opacity={preview?.opacity} />}
    {closeTarget && preview?.autoClose && <circle data-testid="cad-freehand-close-target" cx={closeTarget.x} cy={closeTarget.y}
      r={CAD_FREEHAND_CLOSE_DISTANCE * scale} fill={preview.closeCandidate ? 'var(--color-selected, #4169e1)' : 'var(--color-background, white)'}
      fillOpacity={preview.closeCandidate ? .2 : .7} stroke="var(--color-selected, #4169e1)" strokeWidth={scale}
      strokeDasharray={preview.closeCandidate ? undefined : `${3 * scale} ${3 * scale}`} />}
    {start && !geometry && !preview?.continuation && <circle cx={start.x} cy={start.y} r={2 * scale} fill="var(--color-selected, #4169e1)" />}
  </svg>;
}
