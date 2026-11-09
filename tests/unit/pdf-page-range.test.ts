import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { parsePdfPageRange } from '../../src/lib/pdf/page-range';
import { extractPdfText, PdfSourceError } from '../../src/lib/server/ai/pdf-text';
import { renderPdfPageSource, renderIntakePdf } from '../../src/lib/server/order/intake-pdf';
import { analyzeToolkitMedia, type AnalyzeMediaInput } from '../../src/lib/server/toolkit/analyze-media';

const signal = new AbortController().signal;
function document(pages: number, emptyPages: number[] = []) {
  const pdf = new jsPDF();
  for (let page = 1; page <= pages; page++) {
    if (page > 1) pdf.addPage();
    if (!emptyPages.includes(page)) pdf.text(pdf.splitTextToSize(`MARKER_${page}_ONLY. Production specification for page ${page}: white acrylic faces with aluminium back panels and warm white LEDs. Verify measurements and delivery details against the purchase order.`, 175), 10, 20);
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
const basic: AnalyzeMediaInput = { kind: 'pdf', filename: 'drawings.pdf', mime: 'application/pdf', bytes: document(3),
  system: 'Read the supplied material.', question: 'Summarize the drawing.', textModel: 'saved/text', visionModel: 'saved/vision',
  paidOcr: false, signal };

describe('bounded original PDF page selections', () => {
  it('rejects ambiguous/coerced ranges and mode-specific over-limit requests', () => {
    assert.equal(parsePdfPageRange(undefined), undefined);
    assert.deepEqual(parsePdfPageRange({ start: 41, end: 50 }, 10), { start: 41, end: 50 });
    for (const input of [null, [], {}, { start: 0, end: 1 }, { start: 2, end: 1 }, { start: 1.5, end: 2 },
      { start: '1', end: 2 }, { start: 1, end: NaN }, { start: 1, end: 41 },
      { start: 9999, end: 10001 }, { start: 1, end: 2, extra: true }]) assert.throws(() => parsePdfPageRange(input));
    assert.throws(() => parsePdfPageRange({ start: 1, end: 11 }, 10), /at most 10/);
  });
  it('extracts only the selected text pages from a PDF larger than the all-pages limit', async () => {
    const bytes = document(43);
    await assert.rejects(extractPdfText(bytes, signal), /at most 40/);
    const result = await extractPdfText(bytes, signal, { start: 41, end: 42 });
    assert.deepEqual(result.pages, { start: 41, end: 42, total: 43 });
    assert.equal(result.pageCount, 43); assert.equal(result.allPagesReadable, true);
    assert.match(result.text, /Source PDF page 41 of 43/); assert.match(result.text, /MARKER_42_ONLY/);
    assert.doesNotMatch(result.text, /MARKER_(1|40|43)_ONLY/);
  });
  it('only tests readability of the requested pages and rejects ranges outside the file', async () => {
    const bytes = document(3, [1]);
    assert.equal((await extractPdfText(bytes, signal)).allPagesReadable, false);
    assert.equal((await extractPdfText(bytes, signal, { start: 2, end: 3 })).allPagesReadable, true);
    await assert.rejects(extractPdfText(bytes, signal, { start: 3, end: 4 }), /outside this PDF/);
  });
  it('renders selected original pages from a larger pack without silently trimming the legacy order contract', async () => {
    const bytes = document(12);
    await assert.rejects(renderIntakePdf(bytes, signal), err => { assert.equal((err as any).status, 422); return true; });
    const result = await renderPdfPageSource(bytes, signal, { start: 11, end: 12 });
    assert.deepEqual(result.pages, { start: 11, end: 12, total: 12 });
    assert.equal(result.parts.length, 4);
    assert.deepEqual(result.parts[0], { type: 'text', text: 'Source PDF page 11 of 12' });
    assert.deepEqual(result.parts[2], { type: 'text', text: 'Source PDF page 12 of 12' });
    assert.match(String((result.parts[1].image_url as any).url), /^data:image\/png;base64,iVBOR/);
    await assert.rejects(renderPdfPageSource(bytes, signal, { start: 12, end: 13 }), err => {
      assert.equal((err as any).status, 422); assert.match((err as any).body.message, /outside this PDF/); return true;
    });
  });
  it('keeps page scope in provider instructions/results and sends no omitted text or original PDF', async () => {
    let messages: any; let options: any;
    const result = await analyzeToolkitMedia({ ...basic, pdfPages: { start: 2, end: 2 } }, {
      extractText: extractPdfText, renderPages: renderPdfPageSource,
      complete: async (sent, request) => { messages = sent; options = request;
        return { text: 'Summary of page 2.', model: request.model!, annotations: [], webSearchRequests: null }; }
    });
    assert.deepEqual(result.pages, { start: 2, end: 2, total: 3 });
    assert.equal(options.model, 'saved/text'); assert.equal(options.plugins, undefined);
    assert.match(messages[0].content, /pages 2–2 of 3/);
    assert.match(JSON.stringify(messages), /MARKER_2_ONLY/);
    assert.doesNotMatch(JSON.stringify(messages), /MARKER_(1|3)_ONLY|file_data/);
  });
  it('retains the same page selection when automatic mode switches a scan to images', async () => {
    const requested = { start: 11, end: 12 }; let rendered: unknown; let sent: any;
    const result = await analyzeToolkitMedia({ ...basic, pdfPages: requested }, {
      extractText: async (_bytes, _signal, range) => {
        assert.deepEqual(range, requested);
        return { text: '', pageCount: 12, pages: { ...requested, total: 12 }, allPagesReadable: false };
      },
      renderPages: async (_bytes, _signal, range) => { rendered = range; return {
        parts: [{ type: 'text', text: 'Source PDF page 11 of 12' }], pages: { ...requested, total: 12 }
      }; },
      complete: async (messages, request) => { sent = messages; return { text: 'Visual summary', model: request.model!, annotations: [], webSearchRequests: null }; }
    });
    assert.deepEqual(rendered, requested); assert.deepEqual(result.pages, { ...requested, total: 12 });
    assert.equal(result.engine, 'page-images'); assert.match(sent[0].content, /Only those pages were provided/);
  });
  it('never sends a whole file when range+paid OCR or invalid page bounds are requested', async () => {
    let calls = 0;
    const deps = { extractText: extractPdfText, renderPages: renderPdfPageSource,
      complete: async () => { calls++; return { text: '', model: '', annotations: [], webSearchRequests: null }; } };
    await assert.rejects(analyzeToolkitMedia({ ...basic, pdfPages: { start: 1, end: 1 }, paidOcr: true }, deps), /without paid OCR/);
    await assert.rejects(analyzeToolkitMedia({ ...basic, pdfPages: { start: 4, end: 4 } }, deps), PdfSourceError);
    await assert.rejects(analyzeToolkitMedia({ ...basic, kind: 'image', pdfPages: { start: 1, end: 1 } }, deps));
    assert.equal(calls, 0);
  });
});
