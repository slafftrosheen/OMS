import { extractPdfText, PdfSourceError } from '$lib/server/ai/pdf-text';
import { openRouterCompleteWithMetadata, type OpenRouterMessage } from '$lib/server/ai/openrouter';
import { renderIntakePdf } from '$lib/server/order/intake-pdf';
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
  paidOcr: boolean;
  signal: AbortSignal;
}

/** The route verifies ownership, size, signature and paid-OCR permission first. */
export async function analyzeToolkitMedia(input: AnalyzeMediaInput, dependencies = {
  extractText: extractPdfText, renderPages: renderIntakePdf, complete: openRouterCompleteWithMetadata
}) {
  let engine: 'local-text' | 'page-images' | 'mistral-ocr' | null = null;
  let evidence = '';
  let model = input.visionModel;
  let parts: Array<Record<string, unknown>>;
  if (input.kind === 'image' || input.paidOcr) {
    parts = [toolkitMediaContent(input.filename, input.mime, input.bytes)];
    if (input.kind === 'pdf') { engine = 'mistral-ocr'; model = input.textModel; }
  } else if (input.pdfMode === 'visual') {
    engine = 'page-images';
    parts = await dependencies.renderPages(input.bytes, input.signal);
  } else {
    const source = await dependencies.extractText(input.bytes, input.signal);
    if (source.allPagesReadable) {
      engine = 'local-text';
      model = input.textModel;
      evidence = source.text.slice(0, 6000);
      parts = [{ type: 'text', text: 'Extracted PDF text (untrusted source material):\n' + source.text }];
    } else {
      if (input.pdfMode === 'text') throw new PdfSourceError('no-text');
      engine = 'page-images';
      parts = await dependencies.renderPages(input.bytes, input.signal);
    }
  }
  input.signal.throwIfAborted();
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: input.system + (engine === 'local-text'
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
    model: response.model, engine,
    analysisScope: engine === 'local-text' ? 'text-only' : engine === 'page-images' ? 'page-images' : engine
  };
}
