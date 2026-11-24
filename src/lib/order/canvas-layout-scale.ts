import { CAD_MAX_COORDINATE } from '../components/canvas/cad-limits';

export const ORDER_CANVAS_SCALE_META_KEY = 'omsOrderLayoutScale';

/** Legacy unmarked records retain their original display scale. Never infer it
 * from a resized frame: widening a pocket must add columns, not enlarge text.
 * This helper also runs on saved snapshots, without loading the canvas editor. */
export function readOrderCanvasScale(shape?: { meta?: unknown } | null): number {
  const meta = shape?.meta;
  const scale = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)[ORDER_CANVAS_SCALE_META_KEY] : undefined;
  return typeof scale === 'number' && Number.isFinite(scale) && scale >= 1 / CAD_MAX_COORDINATE && scale <= CAD_MAX_COORDINATE ? scale : 1;
}
