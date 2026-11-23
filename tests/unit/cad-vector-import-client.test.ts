import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'vitest';
import { readVectorDrawingFile } from '../../src/lib/components/canvas/cad-vector-import-client';

const pdf = '%PDF-1.7\nfixture';
const eps = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 40 20\n';
const cdr = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x43, 0x44, 0x52, 0x43]);
const signal = () => new AbortController().signal;

describe('drawing file preparation for vector review', () => {
  it('reads the requested PDF page locally and rejects mismatched drawing content before upload', async () => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => assert.fail('local drawing intake must not upload');
    try {
      const result = await readVectorDrawingFile(new File([pdf], 'layout.PDF', { type: 'image/svg+xml' }), 3, false, signal());
      assert.equal(result.kind, 'pdf');
      assert.ok('bytes' in result);
      assert.equal(result.sourcePage, 3);
      assert.equal(result.selectedPage, 3);
      assert.equal(new TextDecoder().decode(result.bytes), pdf);
      await assert.rejects(readVectorDrawingFile(new File([eps], 'layout.pdf'), 1, true, signal()), /format/);
      await assert.rejects(readVectorDrawingFile(new File([pdf], 'layout.pdf'), 0, false, signal()), /page/);
    } finally { globalThis.fetch = oldFetch; }
  });

  it('sends EPS, CDR and PDF outlining to the converter and reviews its single output page', async () => {
    const oldFetch = globalThis.fetch;
    try {
      const cases = [
        { file: new File([eps], 'art', { type: 'image/x-eps' }), page: 10, convertedPage: 1, kind: 'eps', outline: false },
        { file: new File([cdr], 'art.CDR'), page: 2, convertedPage: 2, kind: 'cdr', outline: false },
        { file: new File([pdf], 'art.pdf'), page: 3, convertedPage: 3, kind: 'pdf', outline: true },
      ];
      for (const { file, page, convertedPage, kind, outline } of cases) {
        let called = 0;
        const requestSignal = signal();
        globalThis.fetch = async (url, init) => {
          called++;
          assert.equal(url, `/api/canvas/convert-vector?page=${convertedPage}`);
          assert.equal(init?.method, 'POST');
          assert.equal(init?.signal, requestSignal);
          assert.deepEqual(new Uint8Array(await (init?.body as Blob).arrayBuffer()), new Uint8Array(await file.arrayBuffer()));
          return new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } });
        };
        const result = await readVectorDrawingFile(file, page, outline, requestSignal);
        assert.equal(called, 1);
        assert.ok('bytes' in result);
        assert.equal(result.kind, kind);
        assert.equal(result.sourcePage, convertedPage);
        assert.equal(result.selectedPage, 1);
      }
    } finally { globalThis.fetch = oldFetch; }
  });

  it('keeps conversion permission, invalid response and cancellation errors actionable', async () => {
    const oldFetch = globalThis.fetch;
    const file = new File([eps], 'art.eps');
    try {
      globalThis.fetch = async () => new Response('{}', { status: 403 });
      await assert.rejects(readVectorDrawingFile(file, 1, false, signal()), /vector-access/);
      globalThis.fetch = async () => new Response('<html>Proxy fallback</html>');
      await assert.rejects(readVectorDrawingFile(file, 1, false, signal()), /conversion/);
      globalThis.fetch = async () => assert.fail('cancelled conversion must not upload');
      await assert.rejects(readVectorDrawingFile(file, 1, false, AbortSignal.abort()), /cancelled/);
    } finally { globalThis.fetch = oldFetch; }
  });

  it('imports UTF-16 SVGs locally at the authored scale', async () => {
    const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
    const dom = new JSDOM(), previous = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser');
    Object.defineProperty(globalThis, 'DOMParser', { value: dom.window.DOMParser, configurable: true });
    try {
      const text = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect width="20" height="10"/></svg>';
      const bytes = Uint8Array.from(Buffer.from('\uFEFF' + text, 'utf16le'));
      const result = await readVectorDrawingFile(new File([bytes], 'art.svg'), NaN, true, signal());
      assert.equal(result.kind, 'svg');
      assert.ok('document' in result);
      assert.ok(Math.abs(result.widthMm - 100) < 1e-9);
      assert.equal(result.document.paths.length, 1);
      await assert.rejects(readVectorDrawingFile(new File([Uint8Array.of(0xff)], 'bad.svg'), 1, false, signal()), /svg-format/);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'DOMParser', previous);
      else Reflect.deleteProperty(globalThis, 'DOMParser');
      dom.window.close();
    }
  });
});
