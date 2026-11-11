import { nodeAt } from "./cad-curves";
import { VECTOR_DEFAULT_PAINT } from "./cad-paint";
import { encodePdfRaster } from "./cad-raster";
import { pdfOperatorsToVectors } from "./cad-pdf";

export type PdfImportOptions = {
  store?: (file: File) => Promise<{ id: string; url: string }>;
  mode?: "auto" | "editable" | "appearance";
  dpi?: number;
  name?: string;
};
/** Page processing is shared by the browser loader and native renderer regression tests. */
export async function readVectorPdfPage(
  page: any,
  OPS: any,
  pages: number,
  pageNumber: number,
  signal: AbortSignal,
  options: PdfImportOptions = {},
) {
  const pdfjs = { OPS },
    viewport = page.getViewport({ scale: 1 });
  const list = await page.getOperatorList();

  const preview = page.getViewport({
    scale: Math.min(1, 720 / Math.max(viewport.width, viewport.height)),
  });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(preview.width);
  canvas.height = Math.ceil(preview.height);
  await page.render({
    canvasContext: canvas.getContext("2d")!,
    viewport: preview,
  }).promise;
  const get = (id: string) => {
    try {
      return (id.startsWith("g_") ? page.commonObjs : page.objs).get(id);
    } catch {
      return undefined;
    }
  };
  const renderAppearance = async () => {
    const dpi = options.dpi ?? 300;
    if (![72, 150, 300, 600].includes(dpi)) throw new Error("limit");
    const full = page.getViewport({ scale: dpi / 72 }),
      w = Math.ceil(full.width),
      h = Math.ceil(full.height);
    if (w > 16384 || h > 16384 || w * h > 32 * 1024 * 1024)
      throw new Error("render-limit");
    const imageCanvas = window.document.createElement("canvas");
    imageCanvas.width = w;
    imageCanvas.height = h;
    await page.render({
      canvasContext: imageCanvas.getContext("2d")!,
      viewport: full,
      background: "rgba(0,0,0,0)",
    }).promise;
    if (signal.aborted) throw new Error("cancelled");
    const raster = await encodePdfRaster(
      { width: w, height: h, bitmap: imageCanvas },
      {
        store: options.store,
        name: `${options.name ?? "PDF"}-page-${pageNumber}.png`,
      },
    );
    return {
      document: {
        width: viewport.width,
        height: viewport.height,
        warnings: ["pdf-rendered-appearance"],
        paths: [
          {
            contours: [
              {
                closed: true,
                nodes: [
                  { x: 0, y: 0 },
                  { x: viewport.width, y: 0 },
                  { x: viewport.width, y: viewport.height },
                  { x: 0, y: viewport.height },
                ].map(nodeAt),
              },
            ],
            fillRule: "nonzero" as const,
            paint: {
              ...VECTOR_DEFAULT_PAINT,
              stroke: "none",
              raster: {
                ...raster,
                matrix: [viewport.width, 0, 0, viewport.height, 0, 0] as [
                  number,
                  number,
                  number,
                  number,
                  number,
                  number,
                ],
              },
            },
          },
        ],
      },
      pages: pages,
      preview: canvas.toDataURL("image/png"),
      widthMm: (viewport.width * 25.4) / 72,
    };
  };
  if (options.mode === "appearance") return await renderAppearance();
  if (options.mode === "auto") {
    let scan;
    try {
      scan = pdfOperatorsToVectors(list, pdfjs.OPS, viewport, { get });
    } catch (error) {
      if (
        (error as Error).message === "limit" ||
        (error as any).code === "limit"
      )
        return await renderAppearance();
      throw error;
    }
    if (scan.warnings.some((w) => ["pdf-effects", "pdf-text"].includes(w)))
      return await renderAppearance();
  }
  const images = new Map(),
    imageWarnings = new Set<string>();
  let budget = 0;
  for (let i = 0; i < list.fnArray.length; i++) {
    if (signal.aborted) throw new Error("cancelled");
    const op = list.fnArray[i],
      a = list.argsArray[i];
    if (
      ![
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageXObjectRepeat,
      ].includes(op) ||
      images.has(a[0])
    )
      continue;
    try {
      if (images.size >= 64) throw new Error("limit");
      const raw = op === pdfjs.OPS.paintInlineImageXObject ? a[0] : get(a[0]);
      const pixels = raw?.width * raw?.height;
      if (!Number.isFinite(pixels) || budget + pixels > 64 * 1024 * 1024)
        throw new Error("limit");
      const raster = await encodePdfRaster(raw, {
        store: options.store,
        name: `${options.name ?? "PDF"}-image-${images.size + 1}.png`,
      });
      budget += pixels;
      images.set(a[0], raster);
      if (raster.width !== raw.width || raster.height !== raw.height)
        imageWarnings.add("pdf-image-resolution");
    } catch (error) {
      if (
        signal.aborted ||
        ["asset-context", "asset-upload", "cancelled"].includes(
          (error as Error).message,
        )
      )
        throw error;
      imageWarnings.add("pdf-images");
    }
  }
  const document = pdfOperatorsToVectors(list, pdfjs.OPS, viewport, {
    get,
    images,
  });
  document.warnings = [...new Set([...document.warnings, ...imageWarnings])];
  if (
    options.mode === "auto" &&
    document.warnings.some((w) =>
      ["pdf-effects", "pdf-images", "pdf-text"].includes(w),
    )
  )
    return await renderAppearance();
  return {
    document,
    pages: pages,
    preview: canvas.toDataURL("image/png"),
    widthMm: (viewport.width * 25.4) / 72,
  };
}
