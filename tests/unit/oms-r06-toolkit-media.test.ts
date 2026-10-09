import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { signatureMatches, isUuid, MAX_TOOLKIT_ASSET_BYTES } from '../../src/lib/server/toolkit/assets';
import { isSupportedToolkitAsset } from '../../src/lib/components/canvas/toolkit-media-import';

const source = (p: string) => readFileSync(p, 'utf8');
const migration = source('supabase/migrations/20261009000005_toolkit_shared_canvases_private_conversations.sql');

describe('OMS-R06 visual file import security', () => {
  it('accepts known MIME signatures and rejects extensions masquerading as media', () => {
    expect(signatureMatches('application/pdf', new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(signatureMatches('application/pdf', new TextEncoder().encode('<html>evil'))).toBe(false);
    expect(signatureMatches('image/png', new Uint8Array([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(signatureMatches('image/jpeg', new Uint8Array([255,216,255,224]))).toBe(true);
    expect(signatureMatches('image/gif', new TextEncoder().encode('GIF89a'))).toBe(true);
    expect(signatureMatches('image/webp', new TextEncoder().encode('RIFF1234WEBP'))).toBe(true);
    expect(signatureMatches('image/webp', new TextEncoder().encode('RIFF0000HTML'))).toBe(false);
    expect(signatureMatches('image/svg+xml', new TextEncoder().encode('<svg/>'))).toBe(false);
  });
  it('limits importable media and UUID references', () => {
    expect(MAX_TOOLKIT_ASSET_BYTES).toBe(25 * 1024 * 1024);
    expect(isUuid('152f8b54-b90a-438a-8427-71a96299b7b3')).toBe(true);
    expect(isUuid('../private')).toBe(false);
    expect(isSupportedToolkitAsset({ type: 'application/pdf', name: 'proof.pdf' } as File)).toBe(true);
    expect(isSupportedToolkitAsset({ type: '', name: 'texture.webp' } as File)).toBe(true);
    expect(isSupportedToolkitAsset({ type: 'image/svg+xml', name: 'injection.svg' } as File)).toBe(false);
  });
  it('declares a private bucket and manager-only object / metadata policies', () => {
    expect(migration).toContain("VALUES ('toolkit-assets', 'toolkit-assets', false");
    expect(migration).toContain('public.toolkit_assets');
    expect(migration).toContain('toolkit_asset_storage_select');
    expect(migration).toContain('toolkit_asset_storage_insert');
    expect(migration).toContain("bucket_id = 'toolkit-assets' AND public.is_admin()");
    expect(migration).toContain('toolkit_assets_read');
    expect(migration).toContain('toolkit_assets_write');
  });
  it('does not make asset links publicly accessible', () => {
    const upload = source('src/routes/api/toolkit/assets/[board]/+server.ts');
    const download = source('src/routes/api/toolkit/assets/[board]/[asset]/+server.ts');
    expect(upload).toContain('requireToolkitManager(locals.user)');
    expect(upload).toContain('signatureMatches');
    expect(upload).toContain("from('toolkit_assets').insert");
    expect(download).toContain('requireToolkitManager(locals.user)');
    expect(download).toContain(".eq('canvas_id', params.board)");
    expect(download).toContain("'Cache-Control': 'private, max-age=120'");
    expect(download).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(upload).not.toContain('getPublicUrl(');
    expect(download).not.toContain('getPublicUrl(');
  });
  it('imports persistent media as a resizable canvas document, not a base64 snapshot', () => {
    const importer = source('src/lib/components/canvas/toolkit-media-import.ts');
    expect(importer).toContain('/api/toolkit/assets/');
    expect(importer).toContain("type: 'document'");
    expect(importer).toContain("kind: pdf ? 'pdf' : 'image'");
    expect(importer).not.toContain('FileReader');
    const wrapper = source('src/lib/components/canvas/TldrawWrapper.svelte');
    const app = source('src/lib/components/canvas/CanvasApp.tsx');
    expect(wrapper).toContain('toolkitBoardId');
    expect(app).toContain('onToolkitFilesDrop');
    expect(app).toContain("container.addEventListener('drop', onDrop, true)");
  });
  it('handles image fit, opacity and multipage PDF visualizations', () => {
    const documentShape = source('src/lib/components/canvas/shapes/DocumentShape.tsx');
    expect(documentShape).toContain('PdfPreview');
    expect(documentShape).toContain("fit: 'contain'");
    expect(documentShape).toContain('pdfPage: 1');
    expect(documentShape).toContain('onPageChange');
    const pdf = source('src/lib/components/canvas/shapes/PdfPreview.tsx');
    expect(pdf).toContain("await import('pdfjs-dist')");
    expect(pdf).toContain('workerSrc');
    expect(pdf).toContain('Previous PDF page');
    expect(pdf).toContain('Next PDF page');
    expect(pdf).toContain('renderTask?.cancel?.()');
  });
  it('exposes material surface studies and core drawing modes without altering order canvas', () => {
    const app = source('src/lib/components/canvas/CanvasApp.tsx');
    expect(app).toContain('MaterialSwatchShapeUtil');
    expect(app).toContain('OrderDetailsShapeUtil');
    expect(app).toContain("CanvasModeContext.Provider value={toolkitBoardId ? 'toolkit' : 'order'}");
    expect(source('src/lib/components/canvas/shapes/ChatShape.tsx')).toContain('toolkitMode');
    expect(source('src/lib/components/canvas/shapes/ChatShape.tsx')).toContain('This legacy chat node is archived');
    const canvas = source('src/routes/toolkit/canvas/+page.svelte');
    for (const action of ["'draw'","'highlight'","'geo'","'text'","'eraser'"]) {
      expect(canvas).toContain(action);
    }
    expect(canvas).toContain('Material studies');
    expect(canvas).toContain('brushed-metal');
    expect(canvas).toContain('createPhotoMaterial');
    const swatch = source('src/lib/components/canvas/shapes/MaterialSwatchShape.tsx');
    expect(swatch).toContain('Visual reference · not a certified finish');
  });
});
