import type { Editor } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';

export type CadUnit = 'mm' | 'cm' | 'm' | 'in';
export interface CadSettings {
  version: 1; unit: CadUnit; scale: number; precision: number;
  originX: number; originY: number; nudge: number;
}
export interface CadPoint { x: number; y: number }
export const CAD_META_KEY = 'omsCad';
export const CAD_MAX_COORDINATE = 1_000_000;
export const CAD_MAX_POINTS = 256;
export const DEFAULT_CAD_SETTINGS: CadSettings = {
  version: 1, unit: 'mm', scale: 1, precision: 2, originX: 0, originY: 0, nudge: 1
};

export function validateCadSettings(value: unknown): CadSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as CadSettings;
  if (s.version !== 1 || !['mm', 'cm', 'm', 'in'].includes(s.unit) ||
      !Number.isFinite(s.scale) || s.scale < 0.001 || s.scale > 10_000 ||
      !Number.isInteger(s.precision) || s.precision < 0 || s.precision > 6 ||
      ![s.originX, s.originY].every(n => Number.isFinite(n) && Math.abs(n) <= CAD_MAX_COORDINATE) ||
      !Number.isFinite(s.nudge) || s.nudge <= 0 || s.nudge > 10_000) return null;
  return { version: 1, unit: s.unit, scale: s.scale, precision: s.precision,
    originX: s.originX, originY: s.originY, nudge: s.nudge };
}
export function readCadSettings(editor: Editor): CadSettings | null {
  return validateCadSettings(editor.getCurrentPage().meta[CAD_META_KEY]);
}
export function writeCadSettings(editor: Editor, value: CadSettings): boolean {
  const settings = validateCadSettings(value);
  if (!settings || editor.getInstanceState().isReadonly) return false;
  const page = editor.getCurrentPage();
  if (JSON.stringify(settings) === JSON.stringify(readCadSettings(editor))) return true;
  return drawingTransaction(editor, () => { editor.updatePage({ id: page.id, meta: { ...page.meta, [CAD_META_KEY]: { ...settings } } }); });
}
export function unitMm(unit: CadUnit): number { return { mm: 1, cm: 10, m: 1000, in: 25.4 }[unit]; }
/** Document space uses 96 px/in; zoom and the physical screen DPI never enter this conversion. */
export function cadMmPerPixel(settings: CadSettings): number { return 25.4 / 96 * settings.scale; }
export function canvasLengthToUnit(px: number, settings: CadSettings): number { return px * cadMmPerPixel(settings) / unitMm(settings.unit); }
export function unitLengthToCanvas(value: number, settings: CadSettings): number { return value * unitMm(settings.unit) / cadMmPerPixel(settings); }
export function canvasPointToCad(point: CadPoint, settings: CadSettings): CadPoint {
  return { x: canvasLengthToUnit(point.x - settings.originX, settings), y: canvasLengthToUnit(settings.originY - point.y, settings) };
}
export function cadPointToCanvas(point: CadPoint, settings: CadSettings): CadPoint {
  return { x: settings.originX + unitLengthToCanvas(point.x, settings), y: settings.originY - unitLengthToCanvas(point.y, settings) };
}
export function validCadPoint(point: CadPoint): boolean {
  return !!point && [point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= CAD_MAX_COORDINATE);
}
export function validCadPoints(points: CadPoint[], closed: boolean): boolean {
  return Array.isArray(points) && points.length >= (closed ? 3 : 2) && points.length <= CAD_MAX_POINTS &&
    points.every(validCadPoint) && points.every((p, i) => !i || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-8) &&
    (!closed || Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y) > 1e-8);
}
