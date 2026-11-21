import React from 'react';
import { Box, useEditor, useValue, type Editor, type TLShape } from '@tldraw/tldraw';
import { getCanvasDraftShape } from './canvas-document';
import { canvasLengthToUnit, DEFAULT_CAD_SETTINGS, readCadSettings } from './cad-settings';
import { cadFreehandPreview } from './cad-freehand-state';

function drawingShape(editor: Editor): TLShape | undefined {
  // A click-based tool may stay in the same state when creating its preview.
  // Observe page membership so the first preview starts this measurement.
  editor.getCurrentPageShapeIds();
  const draft = getCanvasDraftShape(editor);
  if (draft) return draft;
  const tool = editor.getCurrentToolId();
  if (tool === 'geo' && editor.isIn('select.resizing') ||
      tool === 'line' && editor.isIn('select.dragging_handle')) return editor.getOnlySelectedShape() ?? undefined;
}

function drawingMeasurement(editor: Editor) {
  const shape = drawingShape(editor);
  if (shape?.type === 'cad-dimension') return null;
  const penBounds = shape ? null : cadFreehandPreview(editor).get()?.geometry?.bounds;
  const bounds = shape ? editor.getShapePageBounds(shape) :
    penBounds ? new Box(penBounds.x, penBounds.y, penBounds.w, penBounds.h) : null;
  if (!bounds) return null;
  const settings = readCadSettings(editor) ?? DEFAULT_CAD_SETTINGS;
  const format = (size: number) => canvasLengthToUnit(size, settings).toFixed(settings.precision);
  const props = shape?.props as { radius?: number; w?: number; points?: Array<{ x: number; y: number }> } | undefined;
  let text = `${format(bounds.w)} × ${format(bounds.h)} ${settings.unit}`;
  if (shape?.type === 'cad-arc' && props?.radius) text = `R ${format(props.radius)} ${settings.unit}`;
  if (shape?.type === 'cad-ellipse' && props?.w) text = `Ø ${format(props.w)} ${settings.unit}`;
  if (shape?.type === 'cad-path' || shape?.type === 'line') {
    const points = shape.type === 'cad-path' ? props?.points :
      editor.getShapeHandles(shape)?.filter(handle => handle.type === 'vertex')
        .sort((a, b) => a.index.localeCompare(b.index));
    const a = points?.at(-2), b = points?.at(-1);
    if (a && b) text = `${format(Math.hypot(b.x - a.x, b.y - a.y))} ${settings.unit}`;
  }
  const view = editor.getViewportPageBounds(), scale = 1 / editor.getZoomLevel();
  const y = Math.min(view.maxY - 16 * scale, Math.max(view.minY + 16 * scale, bounds.maxY + 15 * scale));
  const x = Math.min(view.maxX - 70 * scale, Math.max(view.minX + 70 * scale, bounds.center.x));
  return { x, y, scale, text };
}

/** Live page-space annotations stay outside the shape store and export. */
export function CadDrawingMeasurements() {
  const editor = useEditor();
  const measurement = useValue('live drawing measurements', () => drawingMeasurement(editor), [editor]);
  if (!measurement) return null;
  const { x, y, text, scale } = measurement;
  return <svg aria-hidden="true" width={1} height={1} data-testid="cad-live-measurement"
    style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', zIndex: 1000002 }}>
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={12 * scale}
      className="rf-cv-label" fontFamily="var(--font-display, sans-serif)" fontWeight={650} fill="var(--rf-cv-dim, var(--ink-primary, #161b22))" stroke="var(--rf-cv-halo, var(--bg-1, white))"
      strokeWidth={5 * scale} strokeLinejoin="round" paintOrder="stroke">{text}</text>
  </svg>;
}
