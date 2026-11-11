import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { CanvasPdfFonts, CanvasPdfCMaps } from "./cad-pdf-resources";
import { readVectorPdfPage, type PdfImportOptions } from "./cad-pdf-page";

export async function readVectorPdf(
  data: Uint8Array,
  pageNumber: number,
  signal: AbortSignal,
  options: PdfImportOptions = {},
) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({
    data,
    StandardFontDataFactory: CanvasPdfFonts,
    CMapReaderFactory: CanvasPdfCMaps,
    useWorkerFetch: false,
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
    return await readVectorPdfPage(
      await doc.getPage(pageNumber),
      pdfjs.OPS,
      doc.numPages,
      pageNumber,
      signal,
      options,
    );
  } finally {
    signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}
