import React, { useEffect } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { getSelectedCadNode, getSelectedCadNodes, installCadNodeSelection, isCadNodeEditing } from './cad-node-selection';
import { installCadNodeMarquee } from './cad-node-marquee';
import { drawingMarquee } from './drawing-marquee';
import { curvePathData, mapContours } from './cad-curves';
import type { CadBezierShape } from './shapes/CadBezierShape';

/** Page-space UI never enters artwork or exports. */
export function CadNodeSelectionOverlay() {
  const editor=useEditor();
  useEffect(() => {
    const stopSelection = installCadNodeSelection(editor), stopMarquee = installCadNodeMarquee(editor);
    return () => { stopMarquee(); stopSelection(); };
  }, [editor]);
  const marquee = useValue('Drawing selection rectangle', () => drawingMarquee(editor).get(), [editor]);
  const zoom = useValue('Drawing selection zoom', () => marquee ? editor.getZoomLevel() : 1, [editor, !!marquee]);
  const state=useValue('CAD active node guides',()=>{
    const active=getSelectedCadNode(editor);
    if(!active||!isCadNodeEditing(editor))return null;
    const shape=editor.getShape(active.shapeId as CadBezierShape['id']) as CadBezierShape;
    const contour=shape.props.contours[active.contourIndex],node=contour.nodes[active.nodeIndex];
    const next=contour.closed||active.nodeIndex<contour.nodes.length-1?contour.nodes[(active.nodeIndex+1)%contour.nodes.length]:undefined;
    const matrix=editor.getShapePageTransform(shape),selected=getSelectedCadNodes(editor);
    const handles = new Set(editor.getShapeHandles(shape)?.map(handle => handle.id));
    return {...active,point:matrix.applyToPoint(node),zoom:editor.getZoomLevel(), selectedCount: selected.length,
      nodes:selected.filter(n => handles.has(`${n.contourIndex}:${n.nodeIndex}:node`))
        .map(n=>({...n,point:matrix.applyToPoint(shape.props.contours[n.contourIndex].nodes[n.nodeIndex])})),
      path:next?curvePathData(mapContours([{closed:false,nodes:[node,next]}],p=>matrix.applyToPoint(p))):''};
  },[editor]);
  if (!state && !marquee) return null;
  const scale = 1 / (state?.zoom ?? zoom);
  const marqueeColor = marquee?.mode === 'crossing' ? 'var(--rf-cv-crossing, #23855c)' : 'var(--color-selected, #4169e1)';
  return <svg aria-hidden="true" data-testid={state ? 'cad-selected-node' : undefined} data-contour={state && state.contourIndex + 1} data-node={state && state.nodeIndex + 1} data-selected-count={state?.selectedCount}
    width={1} height={1} style={{position:'absolute',overflow:'visible',pointerEvents:'none',zIndex:1000001}}>
    {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
      data-testid="cad-node-marquee" data-mode={marquee.mode} fill={marqueeColor} fillOpacity={.12} stroke={marqueeColor} strokeWidth={scale}
      strokeDasharray={marquee.mode === 'crossing' ? `${5 * scale} ${3 * scale}` : undefined} />}
    {state && <>
      <path d={state.path} fill="none" stroke="var(--color-selected, #4169e1)" opacity={0.45} strokeWidth={3*scale}/>
      {state.nodes.map(n=><circle key={n.contourIndex+':'+n.nodeIndex} cx={n.point.x} cy={n.point.y} r={7*scale} fill="none" stroke="var(--color-selected, #4169e1)" strokeWidth={2*scale}/>)}
      <text x={state.point.x+11*scale} y={state.point.y-11*scale} fontSize={12*scale} fill="var(--color-selected, #4169e1)" stroke="var(--rf-cv-halo, white)" strokeWidth={3*scale} paintOrder="stroke" className="rf-cv-label">{state.contourIndex+1}:{state.nodeIndex+1}</text>
    </>}
  </svg>;
}
