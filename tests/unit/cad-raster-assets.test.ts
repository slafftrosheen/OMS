import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { encodePdfRaster } from "../../src/lib/components/canvas/cad-raster";
import { validAppearance } from "../../src/lib/components/canvas/cad-appearance";
import { VECTOR_DEFAULT_PAINT } from "../../src/lib/components/canvas/cad-paint";
import { prepareVectorImport } from "../../src/lib/components/canvas/cad-vector";
import { applyCadPlan } from "../../src/lib/components/canvas/cad-plans";
import { prepareVectorExportWithAssets } from "../../src/lib/components/canvas/cad-vector-export-client";
import { prepareCreationCanvas } from "../../src/lib/order/creation-canvas";
import { DEFAULT_CAD_SETTINGS } from "../../src/lib/components/canvas/cad-settings";
import { fixture } from "../helpers/cad-editor";
import { nodeAt } from "../../src/lib/components/canvas/cad-curves";
const { createCanvas, loadImage } = createRequire(resolve("package.json"))(
  "@napi-rs/canvas",
);
const id = "12345678-1234-4234-8234-123456789abc",
  url = `/api/files/${id}/download`;
const matrix: [number, number, number, number, number, number] = [
  200, 0, 0, 100, 0, 0,
];
const rect = {
  closed: true,
  nodes: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 0, y: 100 },
  ].map(nodeAt),
};
async function withCanvas(run: () => Promise<void>) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => createCanvas(1, 1) } as any;
  try {
    await run();
  } finally {
    globalThis.document = original;
  }
}
describe("full-resolution private raster assets", () => {
  it("stores a >750 KB / >1024 px original outside the snapshot and losslessly hydrates it on PDF export", async () =>
    withCanvas(async () => {
      const width = 2048,
        height = 1024,
        data = new Uint8Array(width * height * 3);
      let seed = 12345;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = seed >>> 24;
      }
      let stored: File | undefined;
      const r = await encodePdfRaster(
        { width, height, kind: 2, data },
        {
          store: async (file) => {
            stored = file;
            return { id, url };
          },
        },
      );
      assert.ok(stored!.size > 750 * 1024);
      assert.equal(r.width, width);
      assert.equal(r.height, height);
      assert.ok(JSON.stringify(r).length < 500);
      assert.equal(r.rgb, undefined);
      assert.equal(r.external, true);
      assert.equal(validAppearance({ raster: { ...r, matrix } }), true);
      const f = fixture(),
        plan = prepareVectorImport(
          f.editor,
          DEFAULT_CAD_SETTINGS,
          {
            width: 200,
            height: 100,
            warnings: [],
            paths: [
              {
                contours: [rect],
                fillRule: "nonzero",
                paint: {
                  ...VECTOR_DEFAULT_PAINT,
                  stroke: "none",
                  raster: { ...r, matrix },
                },
              },
            ],
          },
          200,
          { x: 0, y: 0 },
          "Original pixels",
        );
      applyCadPlan(f.editor, plan);
      const originalFetch = globalThis.fetch,
        originalBitmap = globalThis.createImageBitmap;
      globalThis.fetch = (async (input) => {
        assert.equal(String(input), url);
        return new Response(stored!, {
          headers: { "Content-Type": "image/png" },
        });
      }) as any;
      globalThis.createImageBitmap = (async (blob) => {
        const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
        image.close = () => {};
        return image;
      }) as any;
      try {
        const result = await prepareVectorExportWithAssets(
          f.editor,
          DEFAULT_CAD_SETTINGS,
          "all",
          "pdf",
          new AbortController().signal,
        );
        assert.ok(result.text.includes("/Width 2048 /Height 1024"));
        const raster = result.paths[0].paint.raster!;
        assert.deepEqual(
          inflateSync(Buffer.from(raster.rgb!, "base64")),
          Buffer.from(data),
        );
        assert.equal(f.only().meta.omsVectorPaint.raster.png, url);
        const eps = await prepareVectorExportWithAssets(
          f.editor,
          DEFAULT_CAD_SETTINGS,
          "all",
          "eps",
          new AbortController().signal,
        );
        assert.ok(eps.text.includes("/Width 2048 /Height 1024"));
        const cancelled = new AbortController();
        cancelled.abort();
        await assert.rejects(
          () =>
            prepareVectorExportWithAssets(
              f.editor,
              DEFAULT_CAD_SETTINGS,
              "all",
              "pdf",
              cancelled.signal,
            ),
          /cancelled/,
        );
        globalThis.fetch = (async () =>
          new Response("", { status: 404 })) as any;
        await assert.rejects(
          () =>
            prepareVectorExportWithAssets(
              f.editor,
              DEFAULT_CAD_SETTINGS,
              "all",
              "pdf",
              new AbortController().signal,
            ),
          /asset-fetch/,
        );
      } finally {
        globalThis.fetch = originalFetch;
        globalThis.createImageBitmap = originalBitmap;
      }
    }));
  it("surfaces storage failures rather than converting them into omitted-image warnings", async () =>
    withCanvas(async () => {
      await assert.rejects(
        () =>
          encodePdfRaster(
            { width: 1, height: 1, kind: 2, data: new Uint8Array([0, 0, 0]) },
            {
              store: async () => {
                throw new TypeError("network unavailable");
              },
            },
          ),
        /asset-upload/,
      );
    }));
  it("maps queued image references at new-order save, removes deleted images and blocks unuploaded blobs", () => {
    const snapshot = {
      document: {
        store: {
          a: {
            id: "shape:a",
            meta: {
              omsVectorPaint: {
                raster: {
                  external: true,
                  fileId: "queued",
                  png: "blob:https://oms.local/preview",
                },
              },
            },
          },
          b: {
            id: "shape:b",
            meta: {
              omsVectorPaint: {
                raster: {
                  external: true,
                  fileId: "removed",
                  png: "blob:https://oms.local/deleted",
                },
              },
            },
          },
        },
      },
      session: { pageStates: [{ selectedShapeIds: ["shape:a", "shape:b"] }] },
    };
    const saved = prepareCreationCanvas(
      snapshot,
      "local",
      "saved",
      { queued: id },
      new Set(["removed"]),
      "/oms",
    );
    assert.equal(
      saved.document.store.a.meta.omsVectorPaint.raster.png,
      "/oms" + url,
    );
    assert.equal(saved.document.store.a.meta.omsVectorPaint.raster.fileId, id);
    assert.equal(saved.document.store.b, undefined);
    assert.deepEqual(saved.session.pageStates[0].selectedShapeIds, ["shape:a"]);
    assert.equal(
      snapshot.document.store.a.meta.omsVectorPaint.raster.fileId,
      "queued",
    );
    assert.throws(
      () => prepareCreationCanvas(snapshot, "local", "saved", {}, new Set()),
      /not finished uploading/,
    );
  });
  it("rejects unrelated URLs, mismatched file IDs and excessive source dimensions", async () => {
    const raster = {
      width: 2000,
      height: 1000,
      external: true,
      fileId: id,
      hasAlpha: false,
      png: url,
      matrix,
    };
    assert.equal(validAppearance({ raster }), true);
    for (const png of [
      "https://evil.example/image.png",
      "/api/settings",
      "data:image/svg+xml,<svg/>",
      url + "?x=1",
    ])
      assert.equal(validAppearance({ raster: { ...raster, png } }), false);
    assert.equal(
      validAppearance({ raster: { ...raster, fileId: "another" } }),
      false,
    );
    await assert.rejects(
      () => encodePdfRaster({ width: 16385, height: 1 }),
      /limit/,
    );
    await assert.rejects(
      () => encodePdfRaster({ width: 8192, height: 8192 }),
      /limit/,
    );
  });
});
