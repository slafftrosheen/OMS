import React, { useEffect, useRef } from 'react';
import { TldrawHandles, TldrawSelectionForeground, useEditor, useSelectionEvents, useValue, type TLHandlesProps, type TLSelectionForegroundProps, type TLSelectionHandle } from '@tldraw/tldraw';
import { curvePathData } from './cad-curves';
import { beginDrawingSkew, beginDrawingSkewRotation, DRAWING_SKEW_EDGES, drawingSkewGesture, drawingSkewHandlePoint, finishDrawingSkew, isDrawingSkewMode, type DrawingSkewEdge } from './drawing-pick-skew';
import { startDrawingSkewPointer } from './drawing-pick-skew-pointer';
import { readSkewSelection, skewPoint } from './drawing-skew';
import { requestDrawingUi } from './drawing-ui-requests';
import { usePickSkewText } from './pick-skew-copy';

/** Hide per-node/vertex controls while Pick's rotate/skew mode is active. */
export function DrawingPickHandles(props: TLHandlesProps) {
  const editor = useEditor(), active = useValue('Pick skew handles', () => isDrawingSkewMode(editor), [editor]);
  return active ? null : <TldrawHandles {...props} />;
}

function RotateHandle({ handle, x, y, zoom, turn, label }: {
  handle: TLSelectionHandle; x: number; y: number; zoom: number; turn: number; label: string;
}) {
  const editor = useEditor();
  const events = useSelectionEvents(handle);
  return <g {...events} onPointerDown={event => {
    // A lock or readonly update can arrive between render and pointerdown.
    // Native rotation of a group does not itself guard all locked descendants.
    if (readSkewSelection(editor).error || event.button === 0 && !beginDrawingSkewRotation(editor)) {
      event.preventDefault(); event.stopPropagation(); (event.nativeEvent as any).isKilled = true; return;
    }
    events.onPointerDown(event);
  }} className="drawing-pick-rotate-handle" data-drawing-rotate-corner={handle}
    transform={`translate(${x} ${y}) scale(${1 / zoom})`} aria-label={label}>
    <title>{label}</title><circle r={13} className="drawing-pick-handle-target" />
    <path d="M-5,4 A6,6 0 1,1 4,-5 M4,-5 L-1,-5 M4,-5 L4,0" transform={`rotate(${turn})`} />
  </g>;
}

export function DrawingPickSelectionForeground(props: TLSelectionForegroundProps) {
  const editor = useEditor(), t = usePickSkewText();
  const cancelPointer = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPointer.current?.(), [editor]);
  const value = useValue('Pick skew foreground', () => {
    const active = isDrawingSkewMode(editor), selection = active ? readSkewSelection(editor) : null;
    return { active, bounds: selection?.bounds, gesture: drawingSkewGesture(editor).get(), zoom: editor.getZoomLevel(),
      interactive: editor.isIn('select.idle') && !editor.getIsMenuOpen() && !editor.getInstanceState().isReadonly };
  }, [editor]);
  if (!value.active || !value.bounds) return <TldrawSelectionForeground {...props} />;
  const { bounds, gesture, zoom, interactive } = value, plan = gesture?.plan;
  const openNumeric = () => { cancelPointer.current?.(); requestDrawingUi(editor, { kind: 'panel', action: 'transform' }); };
  const key = (event: React.KeyboardEvent<SVGGElement>, edge: DrawingSkewEdge) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const horizontal = edge === 'top' || edge === 'bottom';
    const direction = horizontal ? event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      : event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!direction && !['Enter', ' ', 'Escape'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); (event.nativeEvent as any).isKilled = true;
    if (event.key === 'Enter' || event.key === ' ') { openNumeric(); return; }
    if (!direction) { cancelPointer.current?.(); return; }
    const start = drawingSkewHandlePoint(bounds, edge), point = { ...start };
    const delta = (horizontal ? bounds.h : bounds.w) * Math.tan((event.shiftKey ? 15 : 1) * Math.PI / 180) * direction;
    if (horizontal) point.x += delta; else point.y += delta;
    if (beginDrawingSkew(editor, edge, start)) finishDrawingSkew(editor, point);
  };
  const cornerGap = 10 / zoom;
  return <svg className="tl-overlays__item tl-selection__fg drawing-pick-skew" data-testid="drawing-pick-skew" aria-label={t('mode')}>
    <rect className="drawing-pick-skew-bounds" x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} strokeWidth={1 / zoom} />
    {plan && <g className="drawing-pick-skew-preview" data-testid="drawing-pick-skew-preview" strokeWidth={1.5 / zoom}>
      <path className="drawing-pick-skew-source" d={curvePathData(plan.items.flatMap(item => item.source))} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
      <path className="drawing-pick-skew-result" d={curvePathData(plan.items.flatMap(item => item.result))} />
      <path className="drawing-pick-skew-anchor" d={`M${plan.anchor.x - 6 / zoom},${plan.anchor.y}h${12 / zoom}M${plan.anchor.x},${plan.anchor.y - 6 / zoom}v${12 / zoom}`} />
    </g>}
    {gesture && <text className="drawing-pick-skew-angle" x={bounds.x + bounds.w / 2} y={bounds.y - 25 / zoom}
      textAnchor="middle" fontSize={12 / zoom} strokeWidth={3 / zoom} data-testid="drawing-pick-skew-angle">
      {Number(gesture.angle.toFixed(2))}°{gesture.limited ? ` · ${t('limit')}` : ''}
    </text>}
    {interactive && DRAWING_SKEW_EDGES.filter(edge => (edge === 'top' || edge === 'bottom' ? bounds.h : bounds.w) > 1e-8).map(edge => {
      const source = drawingSkewHandlePoint(bounds, edge), point = plan ? skewPoint(source, plan.anchor, plan.options.axis, plan.options.angle) : source;
      return <g key={edge} className={`drawing-pick-skew-handle drawing-pick-skew-handle--${edge}`}
        data-drawing-skew-edge={edge} data-testid={`drawing-skew-handle-${edge}`} role="button" tabIndex={gesture ? -1 : 0}
        aria-label={t(edge)} aria-description={t('help')} transform={`translate(${point.x} ${point.y}) scale(${1 / zoom})`}
        onPointerDown={event => {
          if (event.button === 0) { event.preventDefault(); event.stopPropagation(); (event.nativeEvent as any).isKilled = true; }
          const cleanup = startDrawingSkewPointer(editor, edge, event.nativeEvent);
          if (cleanup) cancelPointer.current = cleanup;
        }} onKeyDownCapture={event => key(event, edge)} onKeyUpCapture={event => {
          if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
            event.stopPropagation(); (event.nativeEvent as any).isKilled = true;
          }
        }} onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); openNumeric(); }}>
        <title>{`${t(edge)}. ${t('help')}`}</title><circle className="drawing-pick-handle-target" r={14} />
        <path d="M-8,0 H8 M-8,0 L-4,-4 M-8,0 L-4,4 M8,0 L4,-4 M8,0 L4,4"
          transform={edge === 'left' || edge === 'right' ? 'rotate(90)' : undefined} />
      </g>;
    })}
    {interactive && !gesture && <>
      <RotateHandle handle="top_left_rotate" x={bounds.x - cornerGap} y={bounds.y - cornerGap} zoom={zoom} turn={0} label={t('rotate')} />
      <RotateHandle handle="top_right_rotate" x={bounds.x + bounds.w + cornerGap} y={bounds.y - cornerGap} zoom={zoom} turn={90} label={t('rotate')} />
      <RotateHandle handle="bottom_right_rotate" x={bounds.x + bounds.w + cornerGap} y={bounds.y + bounds.h + cornerGap} zoom={zoom} turn={180} label={t('rotate')} />
      <RotateHandle handle="bottom_left_rotate" x={bounds.x - cornerGap} y={bounds.y + bounds.h + cornerGap} zoom={zoom} turn={270} label={t('rotate')} />
    </>}
  </svg>;
}
