import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { createRequire } from "node:module";
const { createCanvas, loadImage } = createRequire(resolve("package.json"))(
  "@napi-rs/canvas",
) as typeof import("@napi-rs/canvas");
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createTLStore,
  defaultShapeUtils,
  PageRecordType,
  getIndices,
  Vec,
} from "@tldraw/tldraw";
import { CadBezierShapeUtil } from "../../src/lib/components/canvas/shapes/CadBezierShape";
import { VectorArtwork } from "../../src/lib/components/canvas/VectorArtwork";
import {
  nodeAt,
  mapContours,
} from "../../src/lib/components/canvas/cad-curves";
import {
  VECTOR_DEFAULT_PAINT,
  validVectorPaint,
  type VectorPath,
} from "../../src/lib/components/canvas/cad-paint";
import {
  serializeVectorDocument,
  prepareVectorExport,
} from "../../src/lib/components/canvas/cad-vector-export";
import { convertVectorFile } from "../../src/lib/server/cad/convert-vector";
import { encodePdfRaster } from "../../src/lib/components/canvas/cad-raster";
import { pdfOperatorsToVectors } from "../../src/lib/components/canvas/cad-pdf";
import { prepareVectorImport } from "../../src/lib/components/canvas/cad-vector";
import { applyCadPlan } from "../../src/lib/components/canvas/cad-plans";
import { DEFAULT_CAD_SETTINGS } from "../../src/lib/components/canvas/cad-settings";
import { fixture } from "../helpers/cad-editor";
const rect = (x = 0, y = 0, w = 100, h = w) => ({
  closed: true,
  nodes: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ].map(nodeAt),
});
const gradient: VectorPath = {
  contours: [rect()],
  fillRule: "evenodd",
  paint: {
    ...VECTOR_DEFAULT_PAINT,
    stroke: "none",
    gradient: {
      type: "linear",
      matrix: [1, 0, 0, 1, 0, 0],
      start: [0, 0],
      end: [100, 0],
      r0: 0,
      r1: 0,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 0.5, color: "#00ff00" },
        { offset: 1, color: "#0000ff" },
      ],
    },
    clips: [{ contours: [rect(), rect(35, 35, 30)], fillRule: "evenodd" }],
  },
};
const opaqueImage = () => {
  const canvas = createCanvas(2, 2),
    ctx = canvas.getContext("2d"),
    d = ctx.createImageData(2, 2);
  d.data.set([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
  ]);
  ctx.putImageData(d, 0, 0);
  return {
    width: 2,
    height: 2,
    png: canvas.toDataURL("image/png"),
    rgb: deflateSync(
      new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]),
    ).toString("base64"),
    matrix: [100, 0, 0, 100, 0, 0] as [
      number,
      number,
      number,
      number,
      number,
      number,
    ],
  };
};
async function pixels(text: string, format: "pdf" | "eps") {
  const dir = mkdtempSync(join(tmpdir(), "oms-artwork-"));
  try {
    writeFileSync(join(dir, "in." + format), text);
    execFileSync(
      "gs",
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-dQUIET",
        "-dEPSCrop",
        "-sDEVICE=png16m",
        "-r72",
        "-sOutputFile=" + join(dir, "out.png"),
        join(dir, "in." + format),
      ],
      { timeout: 10000 },
    );
    const image = await loadImage(readFileSync(join(dir, "out.png"))),
      canvas = createCanvas(image.width, image.height),
      ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
async function read(text: string | Uint8Array, withImages = false) {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdf.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  const task = pdf.getDocument({
    data: typeof text === "string" ? new TextEncoder().encode(text) : text,
    isEvalSupported: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise,
      page = await doc.getPage(1),
      list = await page.getOperatorList();
    const store = (id: string) =>
      id.startsWith("g_") ? page.commonObjs : page.objs;
    for (let i = 0; i < list.fnArray.length; i++)
      if (list.fnArray[i] === pdf.OPS.dependency)
        await Promise.all(
          list.argsArray[i]
            .flat()
            .map(
              (id: string) =>
                new Promise((resolve) => store(id).get(id, resolve)),
            ),
        );
    const images = new Map();
    if (withImages)
      for (let i = 0; i < list.fnArray.length; i++)
        if (
          [pdf.OPS.paintImageXObject, pdf.OPS.paintInlineImageXObject].includes(
            list.fnArray[i],
          )
        ) {
          const id = list.argsArray[i][0];
          images.set(
            id,
            await encodePdfRaster(
              list.fnArray[i] === pdf.OPS.paintInlineImageXObject
                ? id
                : store(id).get(id),
            ),
          );
        }
    return pdfOperatorsToVectors(
      list,
      pdf.OPS,
      page.getViewport({ scale: 1 }),
      {
        images,
        get: (id) => {
          try {
            return store(id).get(id);
          } catch {
            return undefined;
          }
        },
      },
    );
  } finally {
    await task.destroy();
  }
}
describe("clipped artwork, gradients and embedded raster exchange", () => {
  it("preserves independently authored EPS artwork through real Ghostscript conversion and editable PDF import", async () => {
    const previous = globalThis.document;
    (globalThis as any).document = { createElement: () => createCanvas(1, 1) };
    try {
      const source = readFileSync(
        "tests/fixtures/cad-external/artwork.eps",
        "utf8",
      );
      const pdf = await convertVectorFile(new TextEncoder().encode(source), 1);
      const doc = await read(new Uint8Array(pdf), true);
      assert.deepEqual(doc.warnings, []);
      assert.ok(doc.paths.some((p) => p.paint.raster));
      assert.ok(doc.paths.some((p) => p.paint.gradient));
      assert.ok(doc.paths.some((p) => p.paint.clips?.length));
      const before = await pixels(source, "eps"),
        after = await pixels(serializeVectorDocument(doc.paths, "pdf"), "pdf");
      for (const [x, y] of [
        [10, 30],
        [80, 30],
        [50, 50],
        [10, 80],
        [20, 90],
      ])
        for (let c = 0; c < 3; c++)
          assert.ok(
            Math.abs(before(x, y)[c] - after(x, y)[c]) < 5,
            `${x},${y}: ${before(x, y)} vs ${after(x, y)}`,
          );
    } finally {
      (globalThis as any).document = previous;
    }
  });

  it("renders an even-odd clipping hole and stitched linear gradient identically in PDF and EPS", async () => {
    for (const format of ["pdf", "eps"] as const) {
      const pixel = await pixels(
        serializeVectorDocument([gradient], format),
        format,
      );
      assert.deepEqual(pixel(50, 50), [255, 255, 255]);
      const left = pixel(5, 20),
        middle = pixel(50, 20),
        right = pixel(95, 20);
      assert.ok(left[0] > 210 && left[2] < 5);
      assert.ok(middle[1] > 240);
      assert.ok(right[2] > 210 && right[0] < 5);
    }
    const doc = await read(serializeVectorDocument([gradient], "pdf"));
    assert.deepEqual(doc.warnings, []);
    assert.equal(doc.paths.length, 1);
    assert.equal(doc.paths[0].paint.gradient?.type, "linear");
    assert.ok(doc.paths[0].paint.clips?.length);
  });
  it("writes and reimports a transformed radial gradient without flattening its editable boundary", async () => {
    const path = structuredClone(gradient);
    path.paint.clips = undefined;
    path.paint.gradient = {
      type: "radial",
      matrix: [1, 0, 0, 0.5, 0, 25],
      start: [50, 50],
      end: [50, 50],
      r0: 0,
      r1: 50,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#0000ff" },
      ],
    };
    const pixel = await pixels(serializeVectorDocument([path], "pdf"), "pdf");
    assert.ok(pixel(50, 50)[0] > 240);
    assert.ok(pixel(50, 10)[2] > 240);
    const imported = await read(serializeVectorDocument([path], "pdf"));
    assert.equal(imported.paths[0].paint.gradient?.type, "radial");
    assert.equal(imported.warnings.length, 0);
  });
  it("embeds compressed RGB images with correct orientation in PDF and EPS and a PDF alpha mask", async () => {
    const path: VectorPath = {
      contours: [rect()],
      fillRule: "nonzero",
      paint: { ...VECTOR_DEFAULT_PAINT, stroke: "none", raster: opaqueImage() },
    };
    for (const format of ["pdf", "eps"] as const) {
      const pixel = await pixels(
        serializeVectorDocument([path], format),
        format,
      );
      assert.deepEqual(pixel(10, 10), [255, 0, 0]);
      assert.deepEqual(pixel(10, 90), [0, 0, 255]);
    }
    path.paint.raster!.alpha = deflateSync(
      new Uint8Array([0, 255, 255, 255]),
    ).toString("base64");
    const pixel = await pixels(serializeVectorDocument([path], "pdf"), "pdf");
    assert.deepEqual(pixel(10, 10), [255, 255, 255]);
    assert.throws(() => serializeVectorDocument([path], "eps"), /eps-opacity/);
  });
  it("decodes a real PDF image resource through the browser codec and saves lossless RGB channels", async () => {
    const previous = globalThis.document;
    (globalThis as any).document = {
      createElement: (name: string) => {
        assert.equal(name, "canvas");
        return createCanvas(1, 1);
      },
    };
    try {
      const path: VectorPath = {
        contours: [rect()],
        fillRule: "nonzero",
        paint: {
          ...VECTOR_DEFAULT_PAINT,
          stroke: "none",
          raster: opaqueImage(),
        },
      };
      const doc = await read(serializeVectorDocument([path], "pdf"), true);
      assert.equal(doc.paths.length, 1);
      assert.deepEqual(doc.warnings, []);
      assert.equal(doc.paths[0].paint.raster?.width, 2);
      const pixel = await pixels(
        serializeVectorDocument(doc.paths, "pdf"),
        "pdf",
      );
      assert.deepEqual(pixel(10, 10), [255, 0, 0]);
      assert.deepEqual(pixel(10, 90), [0, 0, 255]);
    } finally {
      (globalThis as any).document = previous;
    }
  });
  it("imports image resources with affine placement and the active clip, never silently raster-tracing them", async () => {
    const { OPS: O } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const raw = opaqueImage();
    const doc = pdfOperatorsToVectors(
      {
        fnArray: [
          O.constructPath,
          O.eoClip,
          O.endPath,
          O.transform,
          O.paintImageXObject,
        ],
        argsArray: [
          [
            [O.rectangle, O.rectangle],
            [0, 0, 100, 100, 30, 30, 40, 40],
          ],
          [],
          [],
          [100, 0, 0, -100, 0, 100],
          ["image", 2, 2],
        ],
      },
      O,
      { width: 100, height: 100, transform: [1, 0, 0, 1, 0, 0] },
      { get: () => null, images: new Map([["image", raw]]) },
    );
    assert.equal(doc.paths.length, 1);
    assert.deepEqual(doc.paths[0].paint.raster?.matrix, [100, 0, 0, 100, 0, 0]);
    assert.equal(doc.paths[0].paint.clips?.[0].fillRule, "evenodd");
    assert.deepEqual(doc.warnings, []);
  });
  it("persists clips, gradients and images in native store and transforms appearance with moved/rotated geometry", async () => {
    const f = fixture(),
      plan = prepareVectorImport(
        f.editor,
        DEFAULT_CAD_SETTINGS,
        { paths: [gradient], width: 100, height: 100, warnings: [] },
        (100 * 25.4) / 72,
        { x: 30, y: 20 },
        "PDF",
      );
    assert.equal(applyCadPlan(f.editor, plan), true);
    const shape = f.only();
    f.editor.updateShape({
      id: shape.id,
      type: shape.type,
      x: 40,
      y: 10,
      rotation: 0.3,
    });
    const output = prepareVectorExport(
      f.editor,
      DEFAULT_CAD_SETTINGS,
      "all",
      "pdf",
    );
    assert.equal(output.omitted.length, 0);
    const readback = await read(output.text);
    assert.equal(readback.paths[0].paint.gradient?.type, "linear");
    const util = new CadBezierShapeUtil(f.editor),
      geometry = util.getGeometry(shape);
    const local = shape.props.contours[0].nodes[0];
    assert.equal(
      geometry.hitTestPoint(
        new Vec(local.x + (50 * 96) / 72, local.y + (50 * 96) / 72),
        0,
        true,
      ),
      false,
    );
    const store = createTLStore({
        shapeUtils: [...defaultShapeUtils, CadBezierShapeUtil],
      }),
      page = PageRecordType.create({
        id: PageRecordType.createId("test"),
        name: "Test",
        index: getIndices(1)[0],
      });
    store.put([
      page,
      {
        ...shape,
        parentId: page.id,
        index: getIndices(1)[0],
        typeName: "shape",
      },
    ]);
    const restored = createTLStore({
      shapeUtils: [...defaultShapeUtils, CadBezierShapeUtil],
    });
    restored.loadSnapshot(store.getSnapshot());
    assert.deepEqual(
      (restored.get(shape.id) as any).meta.omsVectorPaint,
      shape.meta.omsVectorPaint,
    );
    const svg = renderToStaticMarkup(
      React.createElement(
        "svg",
        {},
        React.createElement(VectorArtwork, {
          id: "example",
          contours: gradient.contours,
          fillRule: gradient.fillRule,
          paint: gradient.paint,
        }),
      ),
    );
    assert.ok(
      svg.includes("linearGradient") &&
        svg.includes("clipPath") &&
        !svg.includes("<script"),
    );
  });
  it("renders the shared canvas SVG with the same gradient and clipping as exported PDF", async () => {
    const svg = renderToStaticMarkup(
      React.createElement(
        "svg",
        { xmlns: "http://www.w3.org/2000/svg", width: 100, height: 100 },
        React.createElement(VectorArtwork, {
          id: "svg-test",
          contours: gradient.contours,
          fillRule: gradient.fillRule,
          paint: gradient.paint,
        }),
      ),
    );
    const image = await loadImage(Buffer.from(svg)),
      canvas = createCanvas(100, 100),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 100, 100);
    ctx.drawImage(image, 0, 0);
    const p = await pixels(serializeVectorDocument([gradient], "pdf"), "pdf");
    for (const [x, y] of [
      [5, 20],
      [50, 20],
      [95, 20],
      [50, 50],
    ]) {
      const actual = ctx.getImageData(x, y, 1, 1).data;
      for (let c = 0; c < 3; c++)
        assert.ok(Math.abs(actual[c] - p(x, y)[c]) < 6);
    }
  });
  it("rejects unsafe paint payloads and refuses an import before exceeding the shared document save limit", () => {
    assert.equal(
      validVectorPaint({
        ...gradient.paint,
        gradient: {
          ...gradient.paint.gradient,
          stops: [
            { offset: 0, color: "url(https://evil)" },
            { offset: 1, color: "#ffffff" },
          ],
        },
      }),
      false,
    );
    assert.equal(
      validVectorPaint({
        ...VECTOR_DEFAULT_PAINT,
        raster: { ...opaqueImage(), png: "data:image/svg+xml,<svg/>" },
      }),
      false,
    );
    const f = fixture();
    (f.editor as any).store = {
      getStoreSnapshot: () => ({ large: "x".repeat(1_900_000) }),
    };
    assert.throws(
      () =>
        prepareVectorImport(
          f.editor,
          DEFAULT_CAD_SETTINGS,
          { paths: [gradient], width: 100, height: 100, warnings: [] },
          100,
          { x: 0, y: 0 },
          "PDF",
        ),
      /save-limit/,
    );
    assert.equal(f.editor.getCurrentPageShapeIds().size, 0);
  });
});
