import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { encodePdfRaster } from "./cad-raster";
import { pdfOperatorsToVectors } from "./cad-pdf";

export async function readVectorPdf(
  data: Uint8Array,
  pageNumber: number,
  signal: AbortSignal,
) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    stopAtErrors: true,
  });
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new Error("cancelled");
    const doc = await task.promise;
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > doc.numPages
    )
      throw new Error("page");
    const page = await doc.getPage(pageNumber),
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
        if (images.size >= 16) throw new Error("limit");
        const raw = op === pdfjs.OPS.paintInlineImageXObject ? a[0] : get(a[0]),
          raster = await encodePdfRaster(raw);
        const size = JSON.stringify(raster).length;
        if (budget + size > 750000) throw new Error("limit");
        budget += size;
        images.set(a[0], raster);
        if (raster.width !== raw.width || raster.height !== raw.height)
          imageWarnings.add("pdf-image-resolution");
      } catch {
        imageWarnings.add("pdf-images");
      }
    }
    const document = pdfOperatorsToVectors(list, pdfjs.OPS, viewport, {
      get,
      images,
    });
    document.warnings = [...new Set([...document.warnings, ...imageWarnings])];
    return {
      document,
      pages: doc.numPages,
      preview: canvas.toDataURL("image/png"),
      widthMm: (viewport.width * 25.4) / 72,
    };
  } finally {
    signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}
