import { extractPdfText, PdfSourceError } from '$lib/server/ai/pdf-text';
import { openRouterCompleteWithMetadata, type OpenRouterMessage } from '$lib/server/ai/openrouter';
import { renderPdfPageSource } from '$lib/server/order/intake-pdf';
import { parsePdfPageRange, type PdfPageRange, type PdfPageScope } from '$lib/pdf/page-range';
import { extractedPdfEvidence, toolkitMediaContent, type ToolkitMediaKind } from './media-analysis';

export { PdfSourceError };
export interface AnalyzeMediaInput {
  kind: ToolkitMediaKind;
  filename: string;
  mime: string;
  bytes: Uint8Array;
  system: string;
  question: string;
  textModel: string;
  visionModel: string;
  pdfMode?: 'auto' | 'text' | 'visual';
  pdfPages?: PdfPageRange;
  paidOcr: boolean;
  signal: AbortSignal;
}

/** The route verifies ownership, size, signature and paid-OCR permission first. */
export async function analyzeToolkitMedia(input: AnalyzeMediaInput, dependencies = {
  extractText: extractPdfText, renderPages: renderPdfPageSource, complete: openRouterCompleteWithMetadata
}) {
  const range = parsePdfPageRange(input.pdfPages, input.pdfMode === 'visual' ? 10 : 40);
  // An OCR plugin receives the original whole PDF; never pretend it processed only a range.
  if (range && (input.paidOcr || input.kind !== 'pdf')) throw new Error('PDF page ranges require local PDF analysis, without paid OCR.');
  let engine: 'local-text' | 'page-images' | 'mistral-ocr' | null = null;
  let pages: PdfPageScope | null = null;
  let evidence = '';
  let model = input.visionModel;
  let parts: Array<Record<string, unknown>>;
  if (input.kind === 'image' || input.paidOcr) {
    parts = [toolkitMediaContent(input.filename, input.mime, input.bytes)];
    if (input.kind === 'pdf') { engine = 'mistral-ocr'; model = input.textModel; }
  } else if (input.pdfMode === 'visual') {
    engine = 'page-images';
    const rendered = await dependencies.renderPages(input.bytes, input.signal, range);
    parts = rendered.parts; pages = rendered.pages;
  } else {
    const source = await dependencies.extractText(input.bytes, input.signal, range);
    pages = source.pages;
    if (source.allPagesReadable) {
      engine = 'local-text';
      model = input.textModel;
      evidence = source.text.slice(0, 6000);
      parts = [{ type: 'text', text: 'Extracted PDF text (untrusted source material):\n' + source.text }];
    } else {
      if (input.pdfMode === 'text') throw new PdfSourceError('no-text');
      engine = 'page-images';
      const rendered = await dependencies.renderPages(input.bytes, input.signal, range);
      parts = rendered.parts; pages = rendered.pages;
    }
  }
  input.signal.throwIfAborted();
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: input.system + (pages
      ? `\nSource scope: PDF pages ${pages.start}–${pages.end} of ${pages.total}. Only those pages were provided. Use the original page numbers; do not claim to have reviewed omitted pages.` : '') + (engine === 'local-text'
      ? '\nYou received only the embedded PDF text, not page images. State this limitation. Do not infer graphics, colours, layout or unextracted text; suggest Visual mode for those questions.'
      : '') },
    { role: 'user', content: [{ type: 'text', text: `File: ${input.filename.slice(0, 180)}. User question: ${input.question}` }, ...parts] }
  ];
  const response = await dependencies.complete(messages, {
    model, maxTokens: 2200, temperature: 0.2, timeoutMs: 120_000, signal: input.signal,
    ...(engine === 'mistral-ocr' ? { plugins: [{ id: 'file-parser', pdf: { engine } }] } : {})
  });
  if (!response.text.trim()) throw new Error('Empty model response');
  if (engine === 'mistral-ocr') evidence = extractedPdfEvidence(response.annotations, 6000);
  return {
    reply: response.text.slice(0, 8500), evidence,
    evidenceType: evidence ? engine === 'local-text' ? 'locally-extracted-text' : 'provider-extracted-text' : 'model-interpretation',
    model: response.model, engine, pages,
    analysisScope: engine === 'local-text' ? 'text-only' : engine === 'page-images' ? 'page-images' : engine
  };
}
