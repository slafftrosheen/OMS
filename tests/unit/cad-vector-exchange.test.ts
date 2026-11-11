import { describe, it } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import {
  createTLStore,
  defaultShapeUtils,
  PageRecordType,
  getIndices,
  Vec,
} from "@tldraw/tldraw";
import { CadBezierShapeUtil } from "../../src/lib/components/canvas/shapes/CadBezierShape";
import { prepareCadImport } from "../../src/lib/components/canvas/cad-import";
import { jsPDF } from "jspdf";
import {
  traceRaster,
  DEFAULT_TRACE_OPTIONS,
  traceSegments,
} from "../../src/lib/components/canvas/cad-trace";
import {
  curveBounds,
  nodeAt,
  cubicAt,
  cubicPoints,
} from "../../src/lib/components/canvas/cad-curves";
import {
  prepareVectorImport,
  VECTOR_DEFAULT_PAINT,
  validVectorPaint,
  type VectorPath,
} from "../../src/lib/components/canvas/cad-vector";
import {
  serializeVectorDocument,
  prepareVectorExport,
} from "../../src/lib/components/canvas/cad-vector-export";
import { pdfOperatorsToVectors } from "../../src/lib/components/canvas/cad-pdf";
import {
  convertVectorFile,
  vectorFileKind,
} from "../../src/lib/server/cad/convert-vector";
import {
  cornerContour,
  prepareCorners,
  regularPolygon,
} from "../../src/lib/components/canvas/cad-corners";
import { rationalSplineContour } from "../../src/lib/components/canvas/cad-nurbs";
import { applyCadPlan } from "../../src/lib/components/canvas/cad-plans";
import { DEFAULT_CAD_SETTINGS } from "../../src/lib/components/canvas/cad-settings";
import { buildCadDxf } from "../../src/lib/components/canvas/cad-dxf";
import { fixture } from "../helpers/cad-editor";

const near = (a: number, b: number, t = 1e-5) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const square = (x = 0, y = 0, size = 72) => ({
  closed: true,
  nodes: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ].map(nodeAt),
});
const sample: VectorPath = {
  contours: [square(), square(18, 18, 36)],
  fillRule: "evenodd",
  paint: {
    ...VECTOR_DEFAULT_PAINT,
    fill: "#e32636",
    stroke: "#123456",
    strokeWidth: 2,
    dash: [3, 2],
  },
};
async function readPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise,
      page = await doc.getPage(1),
      viewport = page.getViewport({ scale: 1 }),
      list = await page.getOperatorList();
    return {
      result: pdfOperatorsToVectors(list, pdfjs.OPS, viewport),
      text: await page.getTextContent(),
      pages: doc.numPages,
      list,
    };
  } finally {
    await task.destroy();
  }
}
describe("raster tracing to persistent editable production curves", () => {
  it("retains a logo hole and exact quadratic handles, not a raster or polygon-only substitute", () => {
    const data = new Uint8ClampedArray(48 * 48 * 4).fill(255);
    for (let y = 4; y < 44; y++)
      for (let x = 4; x < 44; x++)
        if (!(x >= 15 && x < 33 && y >= 15 && y < 33))
          data.set([0, 0, 0, 255], (y * 48 + x) * 4);
    const doc = traceRaster(
      { width: 48, height: 48, data },
      DEFAULT_TRACE_OPTIONS,
    );
    assert.equal(doc.paths.length, 1);
    assert.equal(doc.paths[0].contours.length, 2);
    assert.equal(doc.paths[0].fillRule, "evenodd");
    assert.equal(doc.paths[0].paint.fill, "#000000");
    const f = fixture(),
      plan = prepareVectorImport(
        f.editor,
        DEFAULT_CAD_SETTINGS,
        doc,
        120,
        { x: 20, y: 40 },
        "Logo",
      );
    assert.equal(applyCadPlan(f.editor, plan), true);
    assert.ok(f.marks.length >= 1);
    assert.equal(f.only().type, "cad-bezier");
    assert.equal(f.only().meta.omsVectorPaint.fill, "#000000");
    const dxf = buildCadDxf(f.editor, "selected", DEFAULT_CAD_SETTINGS);
    assert.equal(dxf.closedContours, 2);
    assert.deepEqual(dxf.omitted, []);
    const curve = traceSegments([
      { type: "Q", x1: 0, y1: 0, x2: 50, y2: 100, x3: 100, y3: 0 },
      { type: "L", x1: 100, y1: 0, x2: 0, y2: 0 },
    ]);
    const midpoint = cubicAt(cubicPoints(curve.nodes[0], curve.nodes[1]), 0.5);
    near(midpoint.x, 50);
    near(midpoint.y, 50);
  });
  it("does not turn transparent pixels into dark foreground and rejects invalid / empty input", () => {
    const transparent = new Uint8ClampedArray(16 * 16 * 4);
    assert.throws(
      () =>
        traceRaster(
          { width: 16, height: 16, data: transparent },
          DEFAULT_TRACE_OPTIONS,
        ),
      /empty/,
    );
    assert.throws(
      () =>
        traceRaster(
          { width: 16, height: 16, data: transparent },
          { ...DEFAULT_TRACE_OPTIONS, colors: 200 },
        ),
      /geometry/,
    );
    assert.throws(
      () =>
        traceRaster(
          { width: 2000, height: 2000, data: transparent },
          DEFAULT_TRACE_OPTIONS,
        ),
      /limit/,
    );
    assert.equal(
      validVectorPaint({
        ...VECTOR_DEFAULT_PAINT,
        fill: "url(https://example.invalid/x)",
      }),
      false,
    );
  });
  it("refuses stale plans, read-only insertion and bound-source replacement without changing objects", () => {
    const f = fixture(),
      doc = { width: 72, height: 72, paths: [sample], warnings: [] };
    const plan = prepareVectorImport(
      f.editor,
      DEFAULT_CAD_SETTINGS,
      doc,
      25.4,
      { x: 0, y: 0 },
      "PDF",
    );
    f.state.isReadonly = true;
    assert.equal(applyCadPlan(f.editor, plan), false);
    f.state.isReadonly = false;
    f.editor.createShape({
      id: "shape:new",
      type: "cad-bezier",
      props: { contours: [square()] },
    });
    assert.equal(applyCadPlan(f.editor, plan), false);
    assert.equal(f.shapes.size, 1);
    const replace = prepareVectorImport(
      f.editor,
      DEFAULT_CAD_SETTINGS,
      doc,
      25.4,
      { x: 0, y: 0 },
      "PDF",
      ["shape:new"],
      ["shape:new"],
    );
    f.state.bindings.push({});
    assert.equal(applyCadPlan(f.editor, replace), false);
    assert.equal(f.shapes.size, 1);
  });
});
describe("PDF and EPS interchange through independent PDF.js and Ghostscript", () => {
  it("writes a valid PDF retaining cubic paths, holes, RGB, dashes and alpha", async () => {
    const text = serializeVectorDocument(
      [{ ...sample, paint: { ...sample.paint, fillOpacity: 0.5 } }],
      "pdf",
    );
    const { result } = await readPdf(new TextEncoder().encode(text));
    assert.deepEqual(result.warnings, []);
    assert.equal(result.paths.length, 1);
    assert.equal(result.paths[0].contours.length, 2);
    assert.equal(result.paths[0].fillRule, "evenodd");
    assert.equal(result.paths[0].paint.fill, "#e32636");
    assert.equal(result.paths[0].paint.stroke, "#123456");
    near(result.paths[0].paint.fillOpacity, 0.5);
    assert.deepEqual(result.paths[0].paint.dash, [3, 2]);
    near(curveBounds(result.paths[0].contours).w, 72);
  });
  it("imports EPS after local Ghostscript conversion, retaining dimensions and holes", async () => {
    const eps = serializeVectorDocument([sample], "eps");
    const bytes = new TextEncoder().encode(eps);
    assert.equal(vectorFileKind(bytes), "eps");
    const pdf = await convertVectorFile(bytes, 1);
    const { result } = await readPdf(new Uint8Array(pdf));
    assert.deepEqual(result.warnings, []);
    assert.ok(
      result.paths.some(
        (p) => p.fillRule === "evenodd" && p.contours.length === 2,
      ),
    );
    const b = curveBounds(result.paths.flatMap((p) => p.contours));
    near(b.w, 72, 0.01);
    near(b.h, 72, 0.01);
  });
  it("outlines actual PDF text instead of skipping text silently", async () => {
    const pdf = new jsPDF({ unit: "pt" });
    pdf.text("OMS B8", 30, 50);
    const source = new Uint8Array(pdf.output("arraybuffer"));
    const local = await readPdf(source.slice());
    assert.ok(local.result.warnings.includes("pdf-text"));
    const outlined = await readPdf(
      new Uint8Array(await convertVectorFile(source, 1)),
    );
    assert.ok(outlined.result.paths.length > 0);
    assert.ok(outlined.result.paths.some((p) => p.contours.length > 1));
    assert.ok(!outlined.result.warnings.includes("pdf-text"));
    assert.equal(outlined.text.items.length, 0);
  });
  it("selects one source page and rejects invalid files, pages and EPS transparency", async () => {
    const pdf = new jsPDF();
    pdf.rect(10, 10, 20, 20);
    pdf.addPage();
    pdf.rect(10, 10, 40, 10);
    const result = await readPdf(
      new Uint8Array(
        await convertVectorFile(new Uint8Array(pdf.output("arraybuffer")), 2),
      ),
    );
    assert.equal(result.pages, 1);
    near(
      curveBounds(result.result.paths.flatMap((p) => p.contours)).w,
      (40 * 72) / 25.4,
      0.01,
    );
    await assert.rejects(() =>
      convertVectorFile(new TextEncoder().encode("not a PDF file"), 1),
    );
    await assert.rejects(() =>
      convertVectorFile(
        new TextEncoder().encode(serializeVectorDocument([sample], "eps")),
        2,
      ),
    );
    assert.throws(
      () =>
        serializeVectorDocument(
          [{ ...sample, paint: { ...sample.paint, fillOpacity: 0.5 } }],
          "eps",
        ),
      /eps-opacity/,
    );
  });
  it("preserves full size through import at 1:10 and PDF re-export; reports unsupported objects", async () => {
    const f = fixture(),
      settings = { ...DEFAULT_CAD_SETTINGS, scale: 10 };
    const plan = prepareVectorImport(
      f.editor,
      settings,
      { paths: [sample], width: 72, height: 72, warnings: [] },
      25.4,
      { x: 100, y: 200 },
      "PDF",
    );
    assert.equal(applyCadPlan(f.editor, plan), true);
    f.editor.createShape({
      id: "shape:photo",
      type: "image",
      props: { w: 20, h: 20 },
    });
    const output = prepareVectorExport(f.editor, settings, "all", "pdf");
    assert.equal(output.omitted.length, 1);
    const { result } = await readPdf(new TextEncoder().encode(output.text));
    near(curveBounds(result.paths.flatMap((p) => p.contours)).w, 72);
    assert.equal(result.paths[0].paint.fill, "#e32636");
  });
  it("retains clipping and reports unavailable images and does not change graphics state outside save/restore", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"),
      O = pdfjs.OPS;
    const list = {
      fnArray: [
        O.save,
        O.constructPath,
        O.clip,
        O.endPath,
        O.constructPath,
        O.fill,
        O.restore,
        O.constructPath,
        O.fill,
        O.paintImageXObject,
      ],
      argsArray: [
        [],
        [[O.rectangle], [0, 0, 10, 10]],
        [],
        [],
        [[O.rectangle], [0, 0, 20, 20]],
        [],
        [],
        [[O.rectangle], [0, 0, 20, 20]],
        [],
        ["img", 10, 10],
      ],
    };
    const doc = pdfOperatorsToVectors(list, O, {
      width: 100,
      height: 100,
      transform: [1, 0, 0, 1, 0, 0],
    });
    assert.equal(doc.paths.length, 2);
    assert.equal(doc.paths[0].paint.clips?.length,1);
    assert.equal(doc.paths[1].paint.clips,undefined);
    assert.deepEqual(doc.warnings, ["pdf-images"]);
  });
});
describe("painted curves in the native editor store", () => {
  it("persists paint and cubic data and hit-tests fills without selecting holes", () => {
    const f = fixture(),
      plan = prepareVectorImport(
        f.editor,
        DEFAULT_CAD_SETTINGS,
        { paths: [sample], width: 72, height: 72, warnings: [] },
        25.4,
        { x: 0, y: 0 },
        "Colored logo",
      );
    assert.equal(applyCadPlan(f.editor, plan), true);
    const utils = [...defaultShapeUtils, CadBezierShapeUtil],
      store = createTLStore({ shapeUtils: utils });
    const shape = store.schema.types.shape.create({
      ...f.only(),
      index: getIndices(1)[0],
    });
    store.put([
      PageRecordType.create({
        id: PageRecordType.createId("one"),
        name: "QA",
        index: getIndices(1)[0],
      }),
      shape,
    ]);
    const restored = createTLStore({ shapeUtils: utils });
    restored.loadStoreSnapshot(
      JSON.parse(JSON.stringify(store.getStoreSnapshot("document"))),
    );
    assert.deepEqual(
      (restored.get(shape.id) as any).meta.omsVectorPaint,
      shape.meta.omsVectorPaint,
    );
    assert.deepEqual(
      (restored.get(shape.id) as any).props.contours,
      (shape as any).props.contours,
    );
    const geometry = f.utils["cad-bezier"].getGeometry(f.only());
    assert.equal(geometry.hitTestPoint(new Vec(8, 8), 0), true);
    assert.equal(geometry.hitTestPoint(new Vec(48, 48), 0), false);
    assert.equal(geometry.hitTestPoint(new Vec(-20, -20), 0), false);
  });
});
describe("corner editing and rational DXF spline geometry", () => {
  it("creates tangent fillets and chamfers while rejecting excessive or concave corners", () => {
    const result = cornerContour(square(0, 0, 100), 10, "fillet");
    assert.equal(result.nodes.length, 8);
    near(result.nodes[0].x, 0);
    near(result.nodes[0].y, 10);
    near(result.nodes[1].x, 10);
    near(result.nodes[1].y, 0);
    near(Math.abs(result.nodes[0].outY), 5.5228474983);
    assert.ok(
      cornerContour(square(), 5, "chamfer").nodes.every(
        (n) => !n.inX && !n.inY && !n.outX && !n.outY,
      ),
    );
    assert.throws(() => cornerContour(square(), 40, "fillet"));
    const f = fixture();
    f.editor.createShape({
      id: "shape:s",
      type: "cad-bezier",
      props: { contours: [square()] },
    });
    f.editor.setSelectedShapes(["shape:s"]);
    assert.equal(
      applyCadPlan(
        f.editor,
        prepareCorners(f.editor, DEFAULT_CAD_SETTINGS, 2, "fillet"),
      ),
      true,
    );
    assert.equal(f.shapes.size, 1);
  });
  it("generates precise regular polygons and adjustable star points", () => {
    const hex = regularPolygon(6, 100, 30),
      star = regularPolygon(7, 100, 0, 0.4);
    assert.equal(hex.nodes.length, 6);
    assert.equal(star.nodes.length, 14);
    hex.nodes.forEach((p) => near(Math.hypot(p.x, p.y), 50));
    star.nodes.forEach((p, i) => near(Math.hypot(p.x, p.y), i % 2 ? 20 : 50));
    assert.throws(() => regularPolygon(2, 10, 0));
  });
  it("approximates a rational quadratic quarter circle within the requested tolerance", () => {
    const curve = rationalSplineContour(
      [
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      [1, Math.SQRT1_2, 1],
      [0, 0, 0, 1, 1, 1],
      2,
      false,
      0.002,
    );
    assert.ok(curve.nodes.length > 20);
    for (let i = 1; i < curve.nodes.length; i++) {
      const a = curve.nodes[i - 1],
        b = curve.nodes[i];
      near(Math.hypot(a.x, a.y), 100, 1e-8);
      assert.ok(
        Math.abs(Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2) - 100) < 0.002,
      );
    }
    const pairs: Array<string | number> = [
      0,
      "SECTION",
      2,
      "HEADER",
      9,
      "$INSUNITS",
      70,
      4,
      0,
      "ENDSEC",
      0,
      "SECTION",
      2,
      "ENTITIES",
      0,
      "SPLINE",
      70,
      4,
      71,
      2,
      72,
      6,
      73,
      3,
    ];
    for (const k of [0, 0, 0, 1, 1, 1]) pairs.push(40, k);
    for (const w of [1, Math.SQRT1_2, 1]) pairs.push(41, w);
    for (const p of [
      [100, 0],
      [100, 100],
      [0, 100],
    ])
      pairs.push(10, p[0], 20, p[1]);
    pairs.push(0, "ENDSEC", 0, "EOF");
    const f = fixture(),
      plan = prepareCadImport(
        f.editor,
        DEFAULT_CAD_SETTINGS,
        pairs.join("\n"),
        { keepCoordinates: true },
      );
    assert.deepEqual(plan.omitted, []);
    assert.ok(plan.warnings.includes("import-curves-approximated"));
    assert.equal(applyCadPlan(f.editor, plan), true);
    assert.equal(
      buildCadDxf(f.editor, "selected", DEFAULT_CAD_SETTINGS).openContours,
      1,
    );
    assert.throws(() =>
      rationalSplineContour(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        [1, -1],
        [0, 0, 1, 1],
        1,
        false,
        0.001,
      ),
    );
  });
});
