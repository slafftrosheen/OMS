import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { extractPdfText, PdfSourceError } from '../../src/lib/server/ai/pdf-text';
import { analyzeToolkitMedia, type AnalyzeMediaInput } from '../../src/lib/server/toolkit/analyze-media';
import { openRouterCompleteWithMetadata, OpenRouterHttpError, openRouterRequestBody } from '../../src/lib/server/ai/openrouter';

const source = 'Production drawing. Three aluminium panels, 900 x 600 mm. Use white acrylic faces and warm white LEDs. Delivery date is stated in the purchase order.';
const input: AnalyzeMediaInput = { kind: 'pdf', filename: 'drawing.pdf', mime: 'application/pdf',
  bytes: new TextEncoder().encode('%PDF-1.7 fixture'), system: 'Analyze source only', question: 'What is specified?',
  textModel: 'configured/text', visionModel: 'configured/vision', paidOcr: false,
  signal: new AbortController().signal };
const config = { apiKey: 'fixture-key', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'configured/text',
  visionModel: 'configured/vision', timeoutMs: 5000 };
function dependencies(readable = true) {
  const calls: any[] = [];
  const renders: Uint8Array[] = [];
  return { calls, renders,
    extractText: async () => ({ text: source, pageCount: 1, allPagesReadable: readable }),
    renderPages: async (bytes: Uint8Array) => { renders.push(bytes); return [
      { type: 'text', text: 'Source PDF page 1 of 1' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }
    ]; },
    complete: async (messages: any, options: any) => { calls.push({ messages, options }); return {
      text: 'Three panels.', model: options.model, annotations: [], webSearchRequests: null
    }; }
  };
}

describe('PDF analysis without an upstream file parser', () => {
  it('extracts real multi-page PDF text with page provenance off-thread', async () => {
    const pdf = new jsPDF(); pdf.text(pdf.splitTextToSize(source, 180), 10, 20); pdf.addPage(); pdf.text(pdf.splitTextToSize('Second page: ' + source, 180), 10, 20);
    const result = await extractPdfText(new Uint8Array(pdf.output('arraybuffer')), input.signal);
    assert.equal(result.pageCount, 2); assert.equal(result.allPagesReadable, true);
    assert.match(result.text, /Source PDF page 2 of 2/); assert.match(result.text, /900 x 600 mm/);
  });
  it('does not treat a page number or an empty second page as a readable scan', async () => {
    const pdf = new jsPDF(); pdf.text(pdf.splitTextToSize(source, 180), 10, 20); pdf.addPage(); pdf.text('2', 10, 20);
    assert.equal((await extractPdfText(new Uint8Array(pdf.output('arraybuffer')), input.signal)).allPagesReadable, false);
  });
  it('rejects malformed PDFs and canceled work before model invocation', async () => {
    await assert.rejects(extractPdfText(input.bytes, input.signal), PdfSourceError);
    const aborted = AbortSignal.abort();
    await assert.rejects(extractPdfText(input.bytes, aborted), { name: 'AbortError' });
  });
  it('sends extracted text to the chosen text model with no file-parser dependency', async () => {
    const deps = dependencies(); const result = await analyzeToolkitMedia(input, deps);
    assert.equal(result.engine, 'local-text'); assert.equal(result.evidence, source);
    assert.equal(result.evidenceType, 'locally-extracted-text'); assert.equal(result.analysisScope, 'text-only');
    assert.equal(deps.renders.length, 0); assert.equal(deps.calls[0].options.model, input.textModel);
    assert.equal(deps.calls[0].options.plugins, undefined);
    assert.match(JSON.stringify(deps.calls[0].messages), /not page images/);
    assert.doesNotMatch(JSON.stringify(deps.calls[0].messages), /file_data|image_url/);
  });
  it('renders scans and explicit visual requests for the configured vision model', async () => {
    for (const pdfMode of ['auto', 'visual'] as const) {
      const deps = dependencies(false); const result = await analyzeToolkitMedia({ ...input, pdfMode }, deps);
      assert.equal(result.engine, 'page-images'); assert.equal(result.evidence, '');
      assert.equal(result.evidenceType, 'model-interpretation'); assert.equal(deps.renders.length, 1);
      assert.equal(deps.calls[0].options.model, input.visionModel); assert.equal(deps.calls[0].options.plugins, undefined);
      assert.match(JSON.stringify(deps.calls[0].messages), /data:image\/png;base64/);
    }
  });
  it('rejects incomplete text-mode output instead of silently dropping scan pages', async () => {
    const deps = dependencies(false);
    await assert.rejects(analyzeToolkitMedia({ ...input, pdfMode: 'text' }, deps), /Automatic or Visual/);
    assert.equal(deps.calls.length, 0);
  });
  it('only uses paid OCR when explicitly requested by the authorized route', async () => {
    const deps = dependencies(); const result = await analyzeToolkitMedia({ ...input, paidOcr: true }, deps);
    assert.equal(result.engine, 'mistral-ocr'); assert.equal(deps.renders.length, 0);
    assert.deepEqual(deps.calls[0].options.plugins, [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }]);
  });
});

describe('bounded OpenRouter completion recovery', () => {
  it('retries a transient 503 once using the same model and request', async () => {
    const calls: any[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return calls.length === 1 ? new Response('private provider body', { status: 503, headers: { 'Retry-After': '1' } })
        : Response.json({ model: 'configured/text', choices: [{ message: { content: 'Recovered' } }] });
    };
    const result = await openRouterCompleteWithMetadata([{ role: 'user', content: 'Hello' }], {}, config, fetcher);
    assert.equal(result.text, 'Recovered'); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  });
  it('surfaces long provider cooldowns, quota and auth failures without another call or private details', async () => {
    for (const status of [401, 402, 403, 429, 503]) {
      let count = 0;
      const fetcher: typeof fetch = async () => { count++; return new Response('SECRET', { status, headers: { 'Retry-After': '120' } }); };
      await assert.rejects(openRouterCompleteWithMetadata([{ role: 'user', content: 'Hello' }], {}, config, fetcher), err => {
        assert.ok(err instanceof OpenRouterHttpError); assert.equal(err.statusCode, status);
        assert.equal(err.retryAfterSeconds, 120); assert.doesNotMatch(err.message, /SECRET/); return true;
      });
      assert.equal(count, 1);
    }
  });
  it('cancels during backoff without resending the request', async () => {
    const controller = new AbortController(); let count = 0;
    const fetcher: typeof fetch = async () => { count++; setTimeout(() => controller.abort(), 25); return new Response('', { status: 503 }); };
    await assert.rejects(openRouterCompleteWithMetadata([{ role: 'user', content: 'Hello' }], { signal: controller.signal }, config, fetcher), { name: 'AbortError' });
    assert.equal(count, 1);
  });
  it('stops after the second transient failure and preserves the final retry delay', async () => {
    let count = 0;
    const fetcher: typeof fetch = async () => {
      count++;
      return new Response('PRIVATE', { status: 503, headers: { 'Retry-After': count === 1 ? '1' : '30' } });
    };
    await assert.rejects(openRouterCompleteWithMetadata([{ role: 'user', content: 'Hello' }], {}, config, fetcher), err => {
      assert.ok(err instanceof OpenRouterHttpError); assert.equal(err.statusCode, 503);
      assert.equal(err.retryAfterSeconds, 30); return true;
    });
    assert.equal(count, 2);
  });
  it('does not mistake HTTP 200 error envelopes for successful empty answers', async () => {
    const fetcher: typeof fetch = async () => Response.json({ error: { code: 429, message: 'PRIVATE' } });
    await assert.rejects(openRouterCompleteWithMetadata([{ role: 'user', content: 'Hello' }], {}, config, fetcher), err => {
      assert.ok(err instanceof OpenRouterHttpError); assert.equal(err.statusCode, 429); assert.doesNotMatch(err.message, /PRIVATE/); return true;
    });
  });
  it('routes text-only content arrays to the text model', () => {
    assert.equal(openRouterRequestBody({ messages: [{ role: 'user', content: [{ type: 'text', text: source }] }] }, config).model, 'configured/text');
  });
});
