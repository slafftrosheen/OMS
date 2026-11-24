import { DEFAULT_CAD_SETTINGS, cadMmPerPixel, type CadSettings } from '../../cad-settings';
export { ORDER_CANVAS_SCALE_META_KEY, readOrderCanvasScale } from '../../../../order/canvas-layout-scale';

/** Invariant HTML layout sizes. These are design pixels, not document millimetres. */
export const FORM_WIDTHS: Record<string, number> = { 'profile-7st': 1800, 'order-details': 880, 'order-address': 880 };
export const FORM_HEIGHTS: Record<string, number> = { 'profile-7st': 900, 'order-details': 460, 'order-address': 460 };
export const DEFAULT_DRAFT_FORM_WIDTH_MM = 6000;

/** One physical scale for the template, its forms, production pockets and file cards. */
export function defaultOrderCanvasScale(settings: CadSettings | null = null): number {
  return DEFAULT_DRAFT_FORM_WIDTH_MM / (FORM_WIDTHS['profile-7st'] * cadMmPerPixel(settings ?? DEFAULT_CAD_SETTINGS));
}

export function defaultCanvasFormSize(type: string, settings: CadSettings | null = null): { w: number; h: number } | null {
  if (!FORM_WIDTHS[type] || !FORM_HEIGHTS[type]) return null;
  const scale = defaultOrderCanvasScale(settings);
  return { w: FORM_WIDTHS[type] * scale, h: FORM_HEIGHTS[type] * scale };
}

/** A calibrated page's 100% is the physical template size. A legacy pixel
 * board keeps its existing percentage convention until units are enabled. */
export function canvasFormScalePercent(type: string, width: number, settings: CadSettings | null): number | null {
  const baseline = settings ? defaultCanvasFormSize(type, settings)?.w : FORM_WIDTHS[type];
  return baseline && Number.isFinite(width) && width > 0 ? width / baseline * 100 : null;
}
