import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
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
    const document = pdfOperatorsToVectors(list, pdfjs.OPS, viewport);
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
