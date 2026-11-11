import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixture } from "../helpers/cad-editor";
import { decodeDxf } from "../../src/lib/components/canvas/cad-dxf-decode";
import { prepareCadImport } from "../../src/lib/components/canvas/cad-import";
import { readCadFont } from "../../src/lib/components/canvas/cad-text";
import {
  dxfPlainText,
  dxfTextContours,
} from "../../src/lib/components/canvas/cad-dxf-text";
import { curveBounds } from "../../src/lib/components/canvas/cad-curves";
import {
  DEFAULT_CAD_SETTINGS,
  cadMmPerPixel,
} from "../../src/lib/components/canvas/cad-settings";
const settings = { ...DEFAULT_CAD_SETTINGS, originX: 0, originY: 0 },
  factor = cadMmPerPixel(settings);
const near = (a: number, b: number, t = 1e-6) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const font = () => {
  const b = readFileSync("static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2");
  return readCadFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const read = (name: string) =>
  readFileSync(`tests/fixtures/cad-external/${name}`);
describe("DXF binary, text and explicit 3D projection", () => {
  for (const version of ["R12", "R2010"])
    it(`decodes independent ${version} binary entities and legacy/Unicode text`, async () => {
      const bytes = Buffer.from(
        read(`binary-${version}.base64`).toString(),
        "base64",
      );
      const p = prepareCadImport(fixture().editor, settings, decodeDxf(bytes), {
        unit: "mm",
        font: await font(),
        keepCoordinates: true,
      });
      assert.deepEqual(p.omitted, []);
      assert.equal(p.shapes!.length, 3);
      assert.equal(p.shapes!.at(-1)!.meta!.omsSourceText, "H Ø ± °");
      near(p.contours[0].nodes[1].x * factor, 31);
      near(-p.contours[0].nodes[1].y * factor, 42);
      assert.throws(() => decodeDxf(bytes.subarray(0, bytes.length - 2)));
    });
  it("retains text spaces, normalizes CAD escapes and rejects unhandled formatting", () => {
    assert.equal(
      dxfPlainText("  A \\U+0100 %%d %%p %%c  ").text,
      "  A Ā ° ± Ø  ",
    );
    assert.equal(dxfPlainText("{\\H2x;A}\\P\\S1#2;", true).text, "A\n1/2");
    assert.equal(dxfPlainText("{\\H2x;A}", true).formatting, true);
    assert.throws(() => dxfPlainText("A\\Xbad", true));
  });
  it("outlines actual text/MTEXT/attribute values without duplicating attribute definitions", async () => {
    const p = prepareCadImport(
      fixture().editor,
      settings,
      decodeDxf(read("text-layout.dxf")),
      { font: await font(), keepCoordinates: true },
    );
    assert.deepEqual(p.omitted, []);
    assert.equal(p.shapes!.length, 7);
    assert.deepEqual(
      p
        .shapes!.filter((s) => s.meta?.omsSourceText)
        .map((s) => s.meta!.omsSourceText),
      ["H", "H", "HH", "HH", "Ābols\nТест °", "OMS"],
    );
    assert.ok(p.warnings.includes("import-font-substitution"));
    const b = curveBounds(p.shapes![0].props.contours as any);
    near(b.h * factor, 10);
    near(-(b.y + b.h) * factor, 20);
    assert.equal(p.shapes![0].props.fillRule, "nonzero");
    assert.equal(p.shapes![0].meta!.omsVectorPaint.stroke, "none");
    const top = curveBounds(p.shapes![1].props.contours as any);
    near(-top.y * factor, 50);
    const fit = curveBounds(p.shapes![2].props.contours as any);
    near(fit.h * factor, 10);
    assert.ok(fit.w * factor > 70);
    const aligned = curveBounds(p.shapes![3].props.contours as any);
    assert.ok(aligned.h * factor > 70);
    assert.ok(aligned.w * factor > 10);
  });
  it("reports missing glyphs instead of substituting invisible text", async () => {
    const f = await font();
    assert.throws(
      () =>
        dxfTextContours(
          {
            type: "TEXT",
            pairs: [
              [1, "\u{10ffff}"],
              [40, "10"],
            ],
          },
          f,
        ),
      /missing-glyph/,
    );
  });
  for (const projection of ["xy", "xz", "yz"] as const)
    it(`projects external 3D polylines/faces and nested XYZ blocks into ${projection}`, () => {
      const p = prepareCadImport(
        fixture().editor,
        settings,
        decodeDxf(read("projection-3d.dxf")),
        { projection, keepCoordinates: true },
      );
      assert.deepEqual(p.omitted, []);
      assert.ok(p.warnings.includes("import-3d-projection"));
      const axes =
        projection === "xy" ? [0, 1] : projection === "xz" ? [0, 2] : [1, 2];
      const expected = JSON.parse(
        read("projection-samples.json").toString(),
      )[0];
      const nested = p.shapes!.find((s) => s.meta?.omsObjectName === "RED")!;
      assert.ok(nested);
      const nodes = (nested.props.contours as any)[0].nodes;
      expected.forEach((q: number[], i: number) => {
        near(nodes[i].x * factor, q[axes[0]]);
        near(-nodes[i].y * factor, q[axes[1]]);
      });
      assert.equal(nested.meta!.omsVectorPaint.stroke, "#cc2200");
      const first = p.contours[0].nodes;
      near(first[0].x * factor, [1, 2, 3][axes[0]]);
      near(-first[1].y * factor, [10, 20, 30][axes[1]]);
      assert.equal(
        p.shapes!.filter((s) => s.type === "cad-bezier").length >= 11,
        true,
      );
    });
  it("keeps strict 2D mode conservative and never invents ACIS solid geometry", () => {
    const p = prepareCadImport(
      fixture().editor,
      settings,
      decodeDxf(read("projection-3d.dxf")),
      { keepCoordinates: true },
    );
    assert.ok(p.omitted.length >= 5);
    const solid =
      "0\nSECTION\n2\nENTITIES\n0\n3DSOLID\n1\nopaque ACIS\n0\nENDSEC\n0\nEOF\n";
    const s = prepareCadImport(fixture().editor, settings, solid, {
      unit: "mm",
      projection: "xy",
      keepCoordinates: true,
    });
    assert.deepEqual(
      s.omitted.map((o) => o.type),
      ["3DSOLID"],
    );
    assert.equal(s.blocked, true);
  });
});
