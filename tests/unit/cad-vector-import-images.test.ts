import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createVectorImportImages } from '../../src/lib/components/canvas/cad-vector-import-images';
import type { CanvasStoredImage } from '../../src/lib/components/canvas/cad-asset-store';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT, type VectorDocument } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { prepareVectorImport } from '../../src/lib/components/canvas/cad-vector';
import { setOrderBridge } from '../../src/lib/components/canvas/state-bridge';
import { fixture } from '../helpers/cad-editor';

const boardId = '11111111-1111-4111-8111-111111111111';
const idA = '22222222-2222-4222-8222-222222222222';
const idB = '33333333-3333-4333-8333-333333333333';
const signal = () => new AbortController().signal;
const image = (name: string) => new File(['original'], name, { type: 'image/png' });
const reference = (id: string) => ({ id, url: `/api/files/${id}/download` });

async function withLocalUrls(run: (revoked: string[]) => Promise<void>) {
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, revoked: string[] = [];
  URL.createObjectURL = () => `blob:http://localhost:3000/${crypto.randomUUID()}`;
  URL.revokeObjectURL = url => { revoked.push(url); };
  try { await run(revoked); }
  finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
}

function preview(editor: ReturnType<typeof fixture>['editor'], sources: CanvasStoredImage[]) {
  const document: VectorDocument = {
    width: 100, height: 50, warnings: [],
    paths: sources.map((source, index) => {
      const x = index * 10;
      return {
        contours: [{ closed: true, nodes: [{x, y:0}, {x:x+10, y:0}, {x:x+10, y:10}, {x, y:10}].map(nodeAt) }],
        fillRule: 'nonzero',
        paint: { ...VECTOR_DEFAULT_PAINT, stroke: 'none', raster: {
          png: source.url, fileId: source.id, external: true, hasAlpha: false, width: 10, height: 10, matrix: [10,0,0,10,x,0],
        } },
      };
    }),
  };
  return prepareVectorImport(editor, DEFAULT_CAD_SETTINGS, document, 100, { x:0, y:0 }, 'Imported');
}

describe('review-only artwork images', () => {
  it('retains only used images and stores a repeated original once when applying', async () => withLocalUrls(async revoked => {
    const f = fixture(), uploads: string[] = [], oldFetch = globalThis.fetch;
    setOrderBridge(f.editor, { toolkitBoardId: boardId });
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `/api/toolkit/assets/${boardId}`);
      uploads.push(((init?.body as FormData).get('file') as File).name);
      return Response.json({ id: idA });
    };
    try {
      const images = createVectorImportImages(f.editor);
      const used = await images.stage(image('kept.png')), unused = await images.stage(image('unused.png'));
      const plan = preview(f.editor, [used, used]);
      images.retain(plan);
      assert.deepEqual(revoked, [unused.url]);
      assert.deepEqual(uploads, []);
      assert.equal(f.shapes.size, 0);
      assert.equal(await images.apply(plan, signal()), true);
      const rasters = [...f.shapes.values()].map(shape => shape.meta.omsVectorPaint.raster);
      assert.deepEqual(uploads, ['kept.png']);
      assert.deepEqual(rasters.map(raster => [raster.fileId, raster.png]), Array(2).fill([idA, `/api/toolkit/assets/${boardId}/${idA}`]));
      assert.ok(Math.abs(rasters[1].matrix[4] - rasters[0].matrix[4] - 10 * 96 / 25.4) < 1e-8);
      assert.equal(plan.shapes?.[0].meta?.omsVectorPaint.raster.png, used.url, 'the plan remains a local preview');
      images.dispose();
      assert.deepEqual(revoked, [unused.url, used.url]);
    } finally { globalThis.fetch = oldFetch; }
  }));

  it('releases a discarded preview and never writes its original to storage', async () => withLocalUrls(async revoked => {
    const f = fixture();
    setOrderBridge(f.editor, { orderId: idA, onStoreCanvasFile: async () => assert.fail('discard must not store the image') });
    const images = createVectorImportImages(f.editor), original = await images.stage(image('cancelled.png'));
    const plan = preview(f.editor, [original]);
    images.dispose();
    images.dispose();
    assert.deepEqual(revoked, [original.url]);
    await assert.rejects(images.apply(plan, signal()), /cancelled/);
    assert.equal(f.shapes.size, 0);
  }));

  it('keeps the canvas unchanged on a partial upload failure and retries only the missing original', async () => withLocalUrls(async () => {
    const f = fixture(), uploads: string[] = [];
    const queued = (id: string) => ({ id, url: `blob:http://localhost:3000/queued-${id}` });
    let fail = true;
    setOrderBridge(f.editor, { orderId: boardId, onStoreCanvasFile: async file => {
      uploads.push(file.name);
      if (file.name === 'second.png' && fail) throw new Error('asset-upload');
      return queued(file.name === 'first.png' ? idA : idB);
    } });
    const images = createVectorImportImages(f.editor);
    const plan = preview(f.editor, [await images.stage(image('first.png')), await images.stage(image('second.png'))]);
    await assert.rejects(images.apply(plan, signal()), /asset-upload/);
    assert.equal(f.shapes.size, 0);
    fail = false;
    assert.equal(await images.apply(plan, signal()), true);
    assert.deepEqual(uploads, ['first.png', 'second.png', 'second.png']);
    assert.deepEqual([...f.shapes.values()].map(s => s.meta.omsVectorPaint.raster.png), [queued(idA).url, queued(idB).url]);
    images.dispose();
  }));

  it('fences an in-flight Apply against cancellation and a concurrent retry', async () => withLocalUrls(async () => {
    const f = fixture(), controller = new AbortController();
    let finish!: (stored: CanvasStoredImage) => void, uploads = 0;
    const pending = new Promise<CanvasStoredImage>(resolve => { finish = resolve; });
    setOrderBridge(f.editor, { orderId: boardId, onStoreCanvasFile: async () => { uploads++; return pending; } });
    const images = createVectorImportImages(f.editor);
    const plan = preview(f.editor, [await images.stage(image('art.png'))]);
    const applying = images.apply(plan, controller.signal);
    controller.abort();
    await assert.rejects(images.apply(plan, signal()), /busy/);
    finish(reference(idA));
    await assert.rejects(applying, /cancelled/);
    assert.equal(f.shapes.size, 0);
    assert.equal(await images.apply(plan, signal()), true);
    assert.equal(uploads, 1);
    images.dispose();
  }));

  it('rejects a stale drawing or changed storage destination before uploading', async () => withLocalUrls(async () => {
    const f = fixture();
    const write = async () => assert.fail('a stale review must not upload');
    setOrderBridge(f.editor, { orderId: idA, onStoreCanvasFile: write });
    const images = createVectorImportImages(f.editor), source = await images.stage(image('art.png'));
    const plan = preview(f.editor, [source]);
    f.state.isReadonly = true;
    await assert.rejects(images.apply(plan, signal()), /readonly/);
    f.state.isReadonly = false;
    setOrderBridge(f.editor, { orderId: idB, onStoreCanvasFile: write });
    await assert.rejects(images.apply(plan, signal()), /stale/);
    setOrderBridge(f.editor, { orderId: idA, onStoreCanvasFile: write });
    f.editor.updatePage({ meta: { changed: true } });
    await assert.rejects(images.apply(plan, signal()), /stale/);
    assert.equal(f.shapes.size, 0);
    images.dispose();
  }));

  it('does not write shapes or start another upload if the drawing changes during Apply', async () => withLocalUrls(async () => {
    const f = fixture(), uploaded: string[] = [];
    setOrderBridge(f.editor, { orderId: boardId, onStoreCanvasFile: async file => {
      uploaded.push(file.name);
      f.editor.updatePage({ meta: { changed: true } });
      return reference(idA);
    } });
    const images = createVectorImportImages(f.editor);
    const plan = preview(f.editor, [await images.stage(image('first.png')), await images.stage(image('second.png'))]);
    await assert.rejects(images.apply(plan, signal()), /stale/);
    assert.deepEqual(uploaded, ['first.png']);
    assert.equal(f.shapes.size, 0);
    images.dispose();
  }));
});
