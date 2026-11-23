import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {pdfOperatorsToVectors} from "../../src/lib/components/canvas/cad-pdf";
import { readVectorPdfPage } from "../../src/lib/components/canvas/cad-pdf-page";
import { createVectorImportImages } from "../../src/lib/components/canvas/cad-vector-import-images";
import { prepareVectorImport } from "../../src/lib/components/canvas/cad-vector";
import { DEFAULT_CAD_SETTINGS } from "../../src/lib/components/canvas/cad-settings";
import { setOrderBridge } from "../../src/lib/components/canvas/state-bridge";
import { fixture } from "../helpers/cad-editor";
const native = createRequire(resolve("package.json"))("@napi-rs/canvas"),
  { createCanvas, loadImage } = native;
class CanvasFactory {
  create(w: number, h: number) {
    const canvas = createCanvas(w, h);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(target: any, w: number, h: number) {
    target.canvas.width = w;
    target.canvas.height = h;
  }
  destroy(target: any) {
    target.canvas.width = 0;
    target.canvas.height = 0;
    target.canvas = null;
    target.context = null;
  }
}
async function withPage(run: (page: any, OPS: any) => Promise<void>) {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    DOMMatrix: globalThis.DOMMatrix,
    Path2D: globalThis.Path2D,
    ImageData: globalThis.ImageData,
  };
  Object.assign(globalThis, {
    document: { createElement: () => createCanvas(1, 1) },
    window: {
      document: { createElement: () => createCanvas(1, 1) },
      requestAnimationFrame: (f: any) => setTimeout(f, 0),
      cancelAnimationFrame: (id: any) => clearTimeout(id),
    },
    DOMMatrix: native.DOMMatrix,
    Path2D: native.Path2D,
    ImageData: native.ImageData,
  });
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdf.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  const task = pdf.getDocument({
    data: new Uint8Array(
      readFileSync("tests/fixtures/cad-external/advanced-effects.pdf"),
    ),
    CanvasFactory,
    isEvalSupported: false,
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl:
      resolve("node_modules/pdfjs-dist/standard_fonts") + "/",
  });
  try {
    const doc = await task.promise;
    await run(await doc.getPage(1), pdf.OPS);
  } finally {
    await task.destroy();
    Object.assign(globalThis, previous);
  }
}
describe("PDF effects appearance import", () => {
  it('normalizes shrinking radial gradients and reports crossing focal circles',()=>{
    const ir=['RadialAxial','radial',null,[[0,'#ff0000'],[1,'#0000ff']],[50,50],[50,50],40,10];
    const read=()=>pdfOperatorsToVectors({fnArray:[1],argsArray:[['gradient']]},{shadingFill:1},{width:100,height:100,transform:[1,0,0,-1,0,100]},{get:()=>ir});
    const doc=read();assert.deepEqual(doc.warnings,[]);const g=doc.paths[0].paint.gradient!;
    assert.equal(g.r0,10);assert.equal(g.r1,40);assert.deepEqual(g.stops,[{offset:0,color:'#0000ff'},{offset:1,color:'#ff0000'}]);
    ir[4]=[0,0];assert.ok(read().warnings.includes('pdf-effects'));
  });
  it("preserves actual pattern, group and blend pixels at selected DPI with explicit bitmap disclosure", async () =>
    withPage(async (page, OPS) => {
      let file: File | undefined;
      const result = await readVectorPdfPage(
        page,
        OPS,
        1,
        1,
        new AbortController().signal,
        {
          mode: "auto",
          dpi: 300,
          store: async (f) => {
            file = f;
            return {
              id: "12345678-1234-4234-8234-123456789abc",
              url: "/api/files/12345678-1234-4234-8234-123456789abc/download",
            };
          },
        },
      );
      assert.deepEqual(result.document.warnings, ["pdf-rendered-appearance"]);
      assert.equal(result.document.paths.length, 1);
      assert.equal(result.document.paths[0].paint.raster!.width, 600);
      assert.equal(result.document.paths[0].paint.raster!.height, 600);
      assert.equal(result.widthMm, 50.8);
      const actual = await loadImage(Buffer.from(await file!.arrayBuffer())),
        canvas = createCanvas(600, 600),
        ctx = canvas.getContext("2d");
      ctx.drawImage(actual, 0, 0);
      let ink = 0;
      for (let y = 150; y < 195; y++)
        for (let x = 50; x < 150; x++) {
          const p = ctx.getImageData(x, y, 1, 1).data;
          if (p[0] < 40 && p[1] < 40 && p[2] < 40) ink++;
        }
      assert.ok(
        ink > 100,
        "standard Helvetica glyphs must render without system fonts",
      );
      const dir = mkdtempSync(join(tmpdir(), "oms-pdf-effects-"));
      try {
        execFileSync(
          "gs",
          [
            "-dSAFER",
            "-dBATCH",
            "-dNOPAUSE",
            "-dQUIET",
            "-sDEVICE=png16m",
            "-r300",
            "-sOutputFile=" + join(dir, "reference.png"),
            resolve("tests/fixtures/cad-external/advanced-effects.pdf"),
          ],
          { timeout: 10000 },
        );
        const reference = await loadImage(
            readFileSync(join(dir, "reference.png")),
          ),
          c = createCanvas(600, 600),
          rctx = c.getContext("2d");
        rctx.drawImage(reference, 0, 0);
        // Interior pixels compare across independent renderers, away from antialiasing edges.
        for (const [x, y] of [
          [40, 40],
          [70, 40],
          [100, 300],
          [440, 450],
          [440, 250],
          [570, 570],
        ]) {
          const a = ctx.getImageData(x, y, 1, 1).data,
            b = rctx.getImageData(x, y, 1, 1).data;
          for (let i = 0; i < 4; i++)
            assert.ok(Math.abs(a[i] - b[i]) <= 3, `${x},${y}: ${a} != ${b}`);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }));
  it("keeps supported paths editable on request and discloses remaining effects", async () =>
    withPage(async (page, OPS) => {
      const r = await readVectorPdfPage(
        page,
        OPS,
        1,
        1,
        new AbortController().signal,
        { mode: "editable" },
      );
      assert.ok(r.document.warnings.includes("pdf-effects"));
      assert.ok(r.document.paths.length > 0);
      assert.ok(r.document.paths.every((p) => !p.paint.raster));
    }));
  it("rejects oversized requested rendering rather than silently lowering resolution", async () =>
    withPage(async (page, OPS) => {
      const huge = {
        ...page,
        getViewport: ({ scale }: any) => ({
          width: 10000 * scale,
          height: 10000 * scale,
        }),
        getOperatorList: () => page.getOperatorList(),
        render: (args: any) =>
          page.render({ ...args, viewport: page.getViewport({ scale: 0.01 }) }),
      };
      await assert.rejects(
        () =>
          readVectorPdfPage(huge, OPS, 1, 1, new AbortController().signal, {
            mode: "appearance",
            dpi: 600,
          }),
        /render-limit/,
      );
    }));
  it("cancels a running appearance render before encoding or storing the page", async () =>
    withPage(async (page, OPS) => {
      const controller = new AbortController();
      let startFull!: () => void, cancelled = 0, renders = 0;
      const fullStarted = new Promise<void>(resolve => { startFull = resolve; });
      const interruptible = {
        getViewport: (...args: any[]) => page.getViewport(...args),
        getOperatorList: () => page.getOperatorList(),
        render: (args: any) => {
          if (++renders === 1) return page.render(args);
          let rejectRender!: (error: Error) => void;
          const promise = new Promise<void>((_, reject) => { rejectRender = reject; });
          startFull();
          return { promise, cancel: () => { cancelled++; rejectRender(new Error("Rendering cancelled")); } };
        },
      };
      const pending = readVectorPdfPage(interruptible, OPS, 1, 1, controller.signal, {
        mode: 'appearance', store: async () => assert.fail('cancelled render must not store an image'),
      });
      await fullStarted;
      controller.abort();
      await assert.rejects(pending, /^Error: cancelled$/);
      assert.equal(cancelled, 1);
    }));
  it("renders a real PDF page locally and stores its PNG only when the review is applied", async () =>
    withPage(async (page, OPS) => {
      const original = URL.createObjectURL, revoke = URL.revokeObjectURL;
      const url = 'blob:http://localhost:3000/preview';
      URL.createObjectURL = () => url;
      URL.revokeObjectURL = () => {};
      const { editor, only } = fixture(), files: File[] = [];
      const id = '12345678-1234-4234-8234-123456789abc';
      const persisted = `/api/files/${id}/download`;
      setOrderBridge(editor, { orderId: id, onStoreCanvasFile: async file => {
        files.push(file);
        return { id, url: persisted };
      } });
      const images = createVectorImportImages(editor), signal = new AbortController().signal;
      try {
        const result = await readVectorPdfPage(page, OPS, 1, 1, signal, { mode: 'appearance', dpi: 150, store: images.stage });
        const plan = prepareVectorImport(editor, DEFAULT_CAD_SETTINGS, result.document, result.widthMm, { x:0, y:0 }, 'PDF');
        images.retain(plan);
        assert.equal(plan.shapes?.[0].meta?.omsVectorPaint.raster.png, url);
        assert.deepEqual(files, []);
        assert.equal(await images.apply(plan, signal), true);
        assert.equal(files.length, 1);
        assert.equal(files[0].type, 'image/png');
        assert.equal(only().meta.omsVectorPaint.raster.png, persisted);
        assert.equal(only().meta.omsVectorPaint.raster.width, 300);
      } finally { images.dispose(); URL.createObjectURL = original; URL.revokeObjectURL = revoke; }
    }));
});
