import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { getDimensionEndpoints } from './cad-dimension-links';
import { CAD_MAX_COORDINATE, canvasLengthToUnit, readCadSettings, unitLengthToCanvas, type CadSettings } from './cad-settings';
import { drawingTransaction } from './drawing-commands';
import type { CadDimensionShape } from './shapes/CadShapes';
import { canWriteCadSnapSettings } from './cad-snap-settings';

export const CAD_DIMENSION_MARKERS = ['auto', 'arrow', 'tick', 'none'] as const;
/** Match the persisted decorationScale validator. Zoom and native resizing can
 * legitimately produce sizes outside the usual 10–1000% editing range. */
export const CAD_DIMENSION_MAX_ANNOTATION_SIZE = CAD_MAX_COORDINATE * 100;
export function validDimensionAnnotationSize(value: number): boolean {
  const scale = value / 100;
  return Number.isFinite(scale) && scale > 0 && scale <= CAD_MAX_COORDINATE;
}
export type CadDimensionMarker = typeof CAD_DIMENSION_MARKERS[number];
export interface CadDimensionOptions {
  offset: number;
  annotationSize: number;
  precision: number | null;
  showUnit: boolean;
  marker: CadDimensionMarker;
  angleReflex: boolean | null;
}

export function dimensionPrecision(shape: CadDimensionShape, settings: CadSettings | null): number {
  return shape.props.precision ?? settings?.precision ?? 2;
}

/** The display value and SVG annotation use the same physical conversion. */
export function dimensionMeasurementText(shape: CadDimensionShape, settings: CadSettings | null, length: number, radialKind: 'radius' | 'diameter' | null, angleSweep: number | null): string {
  const precision = dimensionPrecision(shape, settings);
  if (angleSweep !== null) return `${(Math.abs(angleSweep) * 180 / Math.PI).toFixed(precision)}°`;
  const prefix = radialKind === 'radius' ? 'R ' : radialKind === 'diameter' ? 'Ø ' : '';
  const value = settings ? canvasLengthToUnit(length, settings) : length;
  return prefix + value.toFixed(precision) + (shape.props.showUnit === false ? '' : ` ${settings?.unit ?? 'px'}`);
}

export function readDimensionOptions(shape: CadDimensionShape, settings: CadSettings | null, sweep: number | null): CadDimensionOptions {
  return {
    offset: settings ? canvasLengthToUnit(shape.props.offset, settings) : shape.props.offset,
    annotationSize: shape.props.decorationScale * 100,
    precision: shape.props.precision ?? null,
    showUnit: shape.props.showUnit !== false,
    marker: shape.props.marker ?? 'auto',
    angleReflex: sweep === null ? null : Math.abs(sweep) > Math.PI,
  };
}

export function dimensionSettingsRevision(editor: Editor, shape: CadDimensionShape): string {
  return JSON.stringify([editor.getCurrentPageId(), readCadSettings(editor), shape, getDimensionEndpoints(editor, shape)]);
}

export function validDimensionOptions(options: CadDimensionOptions, settings: CadSettings | null, angularRayLength?: number): boolean {
  const offset = settings ? unitLengthToCanvas(options.offset, settings) : options.offset;
  return Number.isFinite(offset) && Math.abs(offset) <= CAD_MAX_COORDINATE &&
    validDimensionAnnotationSize(options.annotationSize) &&
    (options.precision === null || Number.isInteger(options.precision) && options.precision >= 0 && options.precision <= 6) &&
    typeof options.showUnit === 'boolean' && CAD_DIMENSION_MARKERS.includes(options.marker) &&
    (options.angleReflex === null || typeof options.angleReflex === 'boolean') &&
    (angularRayLength === undefined || angularRayLength + offset >= 8 * options.annotationSize / 100 - 1e-8);
}

/** A queued form can only update its original, unchanged selected annotation. */
export function updateCadDimensionOptions(editor: Editor, id: TLShapeId, expectedRevision: string, options: CadDimensionOptions): boolean {
  const shape = editor.getOnlySelectedShape() as CadDimensionShape | undefined;
  if (!canWriteCadSnapSettings(editor) || !shape || shape.id !== id || shape.type !== 'cad-dimension' ||
      editor.isShapeOrAncestorLocked(shape) || editor.getAncestorPageId(shape) !== editor.getCurrentPageId() ||
      dimensionSettingsRevision(editor, shape) !== expectedRevision || getDimensionEndpoints(editor, shape).status === 'broken') return false;
  const settings = readCadSettings(editor);
  const points = getDimensionEndpoints(editor, shape);
  const angularRayLength = points.angleSweep === null ? undefined : Math.hypot(points.end.x - points.start.x, points.end.y - points.start.y);
  if (!validDimensionOptions(options, settings, angularRayLength)) return false;
  const props = {
    offset: settings ? unitLengthToCanvas(options.offset, settings) : options.offset,
    decorationScale: options.annotationSize / 100,
    precision: options.precision, showUnit: options.showUnit, marker: options.marker, angleReflex: options.angleReflex,
  };
  return drawingTransaction(editor, () => {
    editor.updateShape({ id: shape.id, type: shape.type, props });
    const updated = editor.getShape(shape.id) as CadDimensionShape | undefined;
    if (!updated || Object.entries(props).some(([key, value]) => updated.props[key] !== value))
      throw new Error('Dimension settings were refused');
    // Offset/label-size changes must not place annotation geometry outside the canvas envelope.
    const bounds = editor.getShapePageBounds(updated);
    if (!bounds || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(value => Number.isFinite(value) && Math.abs(value) <= CAD_MAX_COORDINATE))
      throw new Error('Dimension annotation exceeds drawing bounds');
  });
}
