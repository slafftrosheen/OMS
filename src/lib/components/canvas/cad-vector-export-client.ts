import type { Editor } from "@tldraw/tldraw";
import type { CadSettings } from "./cad-settings";
import { cadRevision } from "./cad-plans";
import {
  prepareVectorExport,
  serializeVectorDocument,
} from "./cad-vector-export";
import { encodePdfRaster } from "./cad-raster";
/** Resolve original pixels only when exporting; saved documents keep references. */
export async function prepareVectorExportWithAssets(
  editor: Editor,
  settings: CadSettings,
  scope: "selected" | "all",
  format: "pdf" | "eps",
  signal: AbortSignal,
) {
  const result = prepareVectorExport(editor, settings, scope, format, true),
    cache = new Map<string, Awaited<ReturnType<typeof encodePdfRaster>>>();
  let pixels = 0;
  for (const p of result.paths) {
    const r = p.paint.raster;
    if (!r?.external) continue;
    if (signal.aborted) throw new Error("cancelled");
    let data = cache.get(r.png);
    if (!data) {
      const response = await fetch(r.png, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
      }).catch(() => {
        throw new Error(signal.aborted ? "cancelled" : "asset-fetch");
      });
      if (
        !response.ok ||
        Number(response.headers.get("content-length")) > 25 * 1024 * 1024
      )
        throw new Error("asset-fetch");
      const blob = await response.blob().catch(() => {
        throw new Error("asset-fetch");
      });
      if (blob.size > 25 * 1024 * 1024 || blob.type !== "image/png")
        throw new Error("asset-fetch");
      const bitmap = await createImageBitmap(blob).catch(() => {
        throw new Error("asset-fetch");
      });
      try {
        if (bitmap.width !== r.width || bitmap.height !== r.height)
          throw new Error("asset-fetch");
        pixels += bitmap.width * bitmap.height;
        if (pixels > 64 * 1024 * 1024) throw new Error("limit");
        data = await encodePdfRaster(
          { width: bitmap.width, height: bitmap.height, bitmap },
          { exportOnly: true },
        );
        cache.set(r.png, data);
      } finally {
        bitmap.close();
      }
    }
    p.paint.raster = { ...data, matrix: r.matrix, ...(r.usage ? {usage:r.usage} : {}), ...(r.repeat ? {repeat:r.repeat} : {}) };
  }
  if (signal.aborted) throw new Error("cancelled");
  if (cadRevision(editor) !== result.revision) throw new Error("stale");
  return {
    ...result,
    text: result.paths.length
      ? serializeVectorDocument(result.paths, format)
      : "",
  };
}
