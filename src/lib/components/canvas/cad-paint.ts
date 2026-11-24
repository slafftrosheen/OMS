import {
  validAppearance,
  transformAppearance,
  type VectorAppearance,
} from "./cad-appearance";
import type { CadContour } from "./cad-curves";
/** Plain data only: never persist imported SVG, CSS, URLs or executable markup. */
export interface VectorPaint extends VectorAppearance {
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Device hairline. strokeWidth stays positive as the SVG/raster fallback;
   * zero width without this flag keeps its existing invisible meaning. */
  hairline?: boolean;
  fillOpacity: number;
  strokeOpacity: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  miterLimit: number;
  dash: number[];
  dashOffset: number;
}
export interface VectorPath {
  contours: CadContour[];
  fillRule: "evenodd" | "nonzero";
  paint: VectorPaint;
}
export interface VectorDocument {
  paths: VectorPath[];
  width: number;
  height: number;
  warnings: string[];
}
export const VECTOR_DEFAULT_PAINT: VectorPaint = {
  fill: "none",
  stroke: "#000000",
  strokeWidth: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
};
/** SVG has no portable printer hairline. Newly authored hairlines carry a
 * 0.01 mm fallback; PDF/EPS retain the device-hairline instruction instead. */
export const CAD_HAIRLINE_FALLBACK_MM = 0.01;
export function vectorDisplayStrokeWidth(paint: VectorPaint, zoom?: number): number {
  return paint.hairline && Number.isFinite(zoom) && zoom! > 0 ? 1 / zoom! : paint.strokeWidth;
}
export function validVectorPaint(value: unknown): value is VectorPaint {
  const p = value as VectorPaint;
  return (
    !!p &&
    validAppearance(p) &&
    [p.fill, p.stroke].every(
      (c) => typeof c === "string" && /^(none|#[0-9a-f]{6})$/i.test(c),
    ) &&
    Number.isFinite(p.strokeWidth) &&
    p.strokeWidth >= 0 &&
    p.strokeWidth <= 1e6 &&
    (p.hairline === undefined || typeof p.hairline === 'boolean') &&
    (!p.hairline || p.strokeWidth > 0) &&
    [p.fillOpacity, p.strokeOpacity].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    ) &&
    ["butt", "round", "square"].includes(p.lineCap) &&
    ["miter", "round", "bevel"].includes(p.lineJoin) &&
    Number.isFinite(p.miterLimit) &&
    p.miterLimit >= 1 &&
    p.miterLimit <= 1000 &&
    Number.isFinite(p.dashOffset) &&
    Math.abs(p.dashOffset) <= 1e6 &&
    Array.isArray(p.dash) &&
    p.dash.length <= 32 &&
    p.dash.every((n) => Number.isFinite(n) && n >= 0 && n <= 1e6) &&
    (!p.dash.length || p.dash.some((n) => n > 0))
  );
}
export function scalePaint(paint: VectorPaint, scale: number): VectorPaint {
  return {
    ...transformAppearance(paint, [scale, 0, 0, scale, 0, 0]),
    strokeWidth: paint.strokeWidth * scale,
    dash: paint.dash.map((n) => n * scale),
    dashOffset: paint.dashOffset * scale,
  };
}
