import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { parsePdfPageRange, type PdfPageRange, type PdfPageScope } from '$lib/pdf/page-range';

export interface PdfTextSource {
  text: string;
  pageCount: number;
  pages: PdfPageScope;
  /** True only when every selected page has a usable text layer. Never treats a scan as text. */
  allPagesReadable: boolean;
}

export class PdfSourceError extends Error {
  constructor(reason: 'unreadable' | 'no-text' | 'range' | 'limit' = 'unreadable') {
    super(reason === 'no-text'
      ? 'Some PDF pages have no usable text layer. Choose Automatic or Visual mode to read scanned pages and drawings.'
      : reason === 'range' ? 'The selected page range is outside this PDF. Check its page count and choose an existing range.'
      : reason === 'limit' ? 'Text analysis supports at most 40 pages at a time. Choose a page range to analyze a larger PDF.'
      : 'Could not read the PDF within the analysis limits (40 pages, 60,000 characters). Use an unlocked PDF or split a larger document.');
    this.name = 'PdfSourceError';
  }
}

// Parsing untrusted PDFs off-thread makes the time and memory limits enforceable.
// No temporary files, cloud parser, OCR fee, or private storage URLs are involved.
async function extractInWorker() {
  const { parentPort, workerData } = await import('node:worker_threads');
  const { getDocument } = await import(workerData.pdfModule);
  const task = getDocument({ data: new Uint8Array(workerData.bytes), isEvalSupported: false,
    useSystemFonts: false, stopAtErrors: true, verbosity: 0,
    cMapUrl: workerData.root + '/cmaps/', cMapPacked: true,
    standardFontDataUrl: workerData.root + '/standard_fonts/' });
  try {
    const pdf = await task.promise;
    const start = workerData.range?.start ?? 1;
    const end = workerData.range?.end ?? pdf.numPages;
    if (end > pdf.numPages) throw new Error('PDF_PAGE_RANGE');
    if (end - start + 1 > 40) throw new Error('PDF_PAGE_LIMIT');
    const pages: string[] = [];
    let allPagesReadable = true;
    let length = 0;
    for (let number = start; number <= end; number++) {
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const text = content.items.map((item: { str?: string; hasEOL?: boolean }) =>
          typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        // A page number or a short header does not make a scanned page readable.
        if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 80) allPagesReadable = false;
        length += text.length;
        if (length > 60_000) throw new Error('Text limit');
        pages.push(`Source PDF page ${number} of ${pdf.numPages}\n${text || '(No embedded text on this page)'}`);
      } finally { page.cleanup(); }
    }
    parentPort!.postMessage({ text: pages.join('\n\n'), pageCount: pdf.numPages,
      pages: { start, end, total: pdf.numPages }, allPagesReadable });
  } finally { await task.destroy(); }
}

export async function extractPdfText(bytes: Uint8Array, signal: AbortSignal, requestedPages?: PdfPageRange): Promise<PdfTextSource> {
  signal.throwIfAborted();
  const range = parsePdfPageRange(requestedPages);
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('pdfjs-dist/package.json', { paths: [process.cwd()] }));
  const worker = new Worker(`(${extractInWorker.toString()})()`, { eval: true,
    workerData: { bytes, root, range, pdfModule: pathToFileURL(join(root, 'legacy/build/pdf.mjs')).href },
    resourceLimits: { maxOldGenerationSizeMb: 256 } });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (failure?: unknown, source?: PdfTextSource) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      void worker.terminate();
      if (failure) reject(failure); else resolve(source!);
    };
    const abort = () => finish(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new PdfSourceError()), 20_000);
    worker.once('message', source => finish(undefined, source));
    worker.once('error', error => finish(new PdfSourceError(error instanceof Error && error.message === 'PDF_PAGE_RANGE'
      ? 'range' : error instanceof Error && error.message === 'PDF_PAGE_LIMIT' ? 'limit' : 'unreadable')));
    worker.once('exit', () => { if (!settled) finish(new PdfSourceError()); });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
