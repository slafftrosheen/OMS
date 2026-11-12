import React, { useEffect } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { getSelectedCadNode, installCadNodeSelection, isCadNodeEditing } from './cad-node-selection';
import { curvePathData, mapContours } from './cad-curves';
import type { CadBezierShape } from './shapes/CadBezierShape';

/** Selection guides are page-space UI; they cannot enter artwork or exports. */
export function CadNodeSelectionOverlay() {
  const editor = useEditor();
  useEffect(() => installCadNodeSelection(editor), [editor]);
  const state = useValue('CAD active node guide', () => {
    const selected = getSelectedCadNode(editor);
    if (!selected || !isCadNodeEditing(editor)) return null;
    const shape = editor.getShape(selected.shapeId as CadBezierShape['id']) as CadBezierShape;
    const contour = shape.props.contours[selected.contourIndex], node = contour.nodes[selected.nodeIndex];
    const next = contour.closed || selected.nodeIndex < contour.nodes.length - 1
      ? contour.nodes[(selected.nodeIndex + 1) % contour.nodes.length] : undefined;
    const matrix = editor.getShapePageTransform(shape);
    return { ...selected, point: matrix.applyToPoint(node), zoom: editor.getZoomLevel(),
      path: next ? curvePathData(mapContours([{ closed: false, nodes: [node, next] }], p => matrix.applyToPoint(p))) : '' };
  }, [editor]);
  if (!state) return null;
  const { point, zoom } = state, scale = 1 / zoom;
  return <svg aria-hidden="true" data-testid="cad-selected-node" data-contour={state.contourIndex + 1} data-node={state.nodeIndex + 1}
    width={1} height={1} style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', zIndex: 1000001 }}>
    <path d={state.path} fill="none" stroke="var(--color-selected, #4169e1)" opacity={0.45} strokeWidth={3 * scale} />
    <circle cx={point.x} cy={point.y} r={7 * scale} fill="none" stroke="var(--color-selected, #4169e1)" strokeWidth={2 * scale} />
    <text x={point.x + 11 * scale} y={point.y - 11 * scale} fontSize={12 * scale} fill="var(--color-selected, #4169e1)"
      stroke="white" strokeWidth={3 * scale} paintOrder="stroke">{state.contourIndex + 1}:{state.nodeIndex + 1}</text>
  </svg>;
}
