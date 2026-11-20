import React, { useEffect } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { readCadSettings, canvasPointToCad, unitLengthToCanvas } from './cad-settings';
import { readDrawingRotationPivot, setDrawingRotationPivot } from './drawing-rotation-pivot';
import { cancelDrawingRotationPointer, drawingRotationNotice, drawingRotationPreview, startDrawingPivotPointer } from './drawing-pick-rotation';
import { useRotationPivotText } from './rotation-pivot-copy';

const guard = (event: React.KeyboardEvent<SVGGElement>) => {
  if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))
    (event.nativeEvent as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
};

export function DrawingRotationPivot({ interactive }: { interactive: boolean }) {
  const editor = useEditor(), t = useRotationPivotText();
  useEffect(() => () => cancelDrawingRotationPointer(editor), [editor]);
  const value = useValue('Pick rotation center control', () => ({ pivot: readDrawingRotationPivot(editor),
    preview: drawingRotationPreview(editor).get(), zoom: editor.getZoomLevel(), settings: readCadSettings(editor) }), [editor]);
  if (!value.pivot) return null;
  const point = value.preview?.kind === 'pivot' && !value.preview.error ? value.preview.point : value.pivot.point;
  const displayed = value.settings ? canvasPointToCad(point, value.settings) : point;
  const precision = value.settings?.precision ?? 2;
  const title = `${t('center')}: ${Number(displayed.x.toFixed(precision))}, ${Number(displayed.y.toFixed(precision))} ${value.settings?.unit ?? 'px'}. ${t('help')}`;
  const reset = () => {
    if (setDrawingRotationPivot(editor, null)) drawingRotationNotice(editor).set('reset');
  };
  const key = (event: React.KeyboardEvent<SVGGElement>) => {
    guard(event);
    if (!interactive || event.altKey || event.nativeEvent.isComposing) return;
    if (['Home', 'Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); reset(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editor.focus(); return; }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault(); event.stopPropagation();
    const step = (value.settings ? unitLengthToCanvas(value.settings.nudge, value.settings) : 1) * (event.shiftKey ? 10 : event.ctrlKey || event.metaKey ? .1 : 1);
    if (setDrawingRotationPivot(editor, { x: point.x + step * direction[0], y: point.y + step * direction[1] })) drawingRotationNotice(editor).set('moved');
  };
  return <g className={`drawing-rotation-pivot${value.pivot.custom ? ' is-custom' : ''}${interactive ? '' : ' is-inactive'}`}
    data-drawing-rotation-pivot="true" data-testid="drawing-rotation-pivot" data-custom={value.pivot.custom}
    data-page-x={point.x} data-page-y={point.y} role="button" tabIndex={interactive ? 0 : -1} aria-label={title}
    transform={`translate(${point.x} ${point.y}) scale(${1 / value.zoom})`}
    onPointerDown={event => {
      if (interactive && startDrawingPivotPointer(editor, event.nativeEvent, event.currentTarget)) {
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
      }
    }} onKeyDownCapture={key} onKeyUpCapture={guard}
    onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); if (interactive) reset(); }}>
    <title>{title}</title><circle r={14} className="drawing-pick-handle-target" />
    <circle r={5} className="drawing-rotation-pivot-ring" /><path d="M-9,0H9M0,-9V9" className="drawing-rotation-pivot-cross" />
  </g>;
}
