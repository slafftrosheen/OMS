import type { Editor } from "@tldraw/tldraw";
import type { CadSettings } from "./cad-settings";
import { cadRevision } from "./cad-plans";
import {
  prepareVectorExport,
  serializeVectorDocument,
  type VectorExportScope,
} from "./cad-vector-export";
import { encodePdfRaster } from "./cad-raster";
import {
  decodeOriginalDrawingRaster,
  readOriginalDrawingRaster,
  DRAWING_EXPORT_TOTAL_ASSET_BYTES,
  DRAWING_EXPORT_TOTAL_ASSET_PIXELS,
} from "./drawing-raster-original";

/** Resolve original pixels only when exporting. The saved drawing retains references. */
export async function prepareVectorExportWithAssets(
  editor: Editor,
  settings: CadSettings,
  scope: VectorExportScope,
  format: "pdf" | "eps",
  signal: AbortSignal,
) {
  if (signal.aborted) throw new Error("cancelled");
  const result = prepareVectorExport(editor, settings, scope, format, true);
  const check = () => {
    if (signal.aborted) throw new Error("cancelled");
    if (cadRevision(editor) !== result.revision) throw new Error("stale");
  };
  const cache = new Map<string, Awaited<ReturnType<typeof encodePdfRaster>>>();
  let pixels = 0, bytes = 0;
  for (const path of result.paths) {
    const raster = path.paint.raster;
    if (!raster?.external) continue;
    check();
    let data = cache.get(raster.png);
    if (!data) {
      pixels += raster.width * raster.height;
      if (pixels > DRAWING_EXPORT_TOTAL_ASSET_PIXELS) throw new Error("limit");
      const original = await readOriginalDrawingRaster(raster, signal, DRAWING_EXPORT_TOTAL_ASSET_BYTES - bytes, check);
      bytes += original.bytes;
      const bitmap = await decodeOriginalDrawingRaster(original.blob, raster, check);
      try {
        data = await encodePdfRaster({ width: bitmap.width, height: bitmap.height, bitmap }, { exportOnly: true });
      } finally {
        bitmap.close();
      }
      cache.set(raster.png, data);
    }
    if (data.width !== raster.width || data.height !== raster.height ||
        (format === "eps" && data.alpha)) throw new Error("asset-fetch");
    path.paint.raster = { ...data, matrix: raster.matrix, ...(raster.usage ? { usage: raster.usage } : {}),
      ...(raster.repeat ? { repeat: raster.repeat } : {}) };
  }
  check();
  return {
    ...result,
    text: result.paths.length ? serializeVectorDocument(result.paths, format, result.sheet) : "",
  };
}
