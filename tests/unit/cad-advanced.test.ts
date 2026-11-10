import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import {
  DEFAULT_CAD_SETTINGS as settings,
  cadMmPerPixel,
  cadPointToCanvas
} from '../../src/lib/components/canvas/cad-settings';
import {
  arcContour,
  cubicAt,
  cubicPoints,
  curveBounds,
  flattenContours,
  nodeAt,
  validContours,
  type CadContour
} from '../../src/lib/components/canvas/cad-curves';
import {
  getCadCurveSelection,
  splitCadCurveSegment,
  updateCadCurveNode,
  convertSelectionToCurves,
  shapeCadContours
} from '../../src/lib/components/canvas/cad-editing';
import { prepareCadShaping } from '../../src/lib/components/canvas/cad-shaping';
import { applyCadPlan, cadRevision } from '../../src/lib/components/canvas/cad-plans';
import { prepareCadText, readCadFont, glyphRunContours } from '../../src/lib/components/canvas/cad-text';
import { prepareCadImport, splineContour } from '../../src/lib/components/canvas/cad-import';
import { buildCadDxf, serializeCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { CadBezierTool } from '../../src/lib/components/canvas/CadBezierTool';
import { getCadSelectionPageBounds } from '../../src/lib/components/canvas/cad-bounds';
const near = (a: number, b: number, t = 1e-7) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const rect = (x: number, y: number, w: number, h: number): CadContour => ({
  closed: true,
  nodes: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ].map(nodeAt)
});
const shape = (f: ReturnType<typeof fixture>, id: string, contours: CadContour[], extra = {}) => {
  f.editor.createShape({ id: `shape:${id}`, type: 'cad-bezier', props: { contours }, ...extra });
  return `shape:${id}`;
};
const area = (contours: CadContour[]) =>
  Math.abs(
    flattenContours(contours, 0.0001).reduce(
      (total, ps) =>
        total +
        ps.reduce((a, p, i) => {
          const q = ps[(i + 1) % ps.length];
          return a + p.x * q.y - q.x * p.y;
        }, 0) /
          2,
      0
    )
  );
const opts = { operation: 'weld' as const, toleranceMm: 0.01, offset: 1, join: 'miter' as const, keepSources: true };
const dxf = (body: string, unit = 4, blocks = '') =>
  `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${unit}\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n${blocks}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
const fontBytes = () => {
  const b = readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe('CAD Bézier geometry and native editing', () => {
  it('splits exact cubics without changing shape, handles extrema and backward loops', () => {
    const f = fixture(),
      c = {
        closed: false,
        nodes: [
          { ...nodeAt({ x: 0, y: 0 }), outX: 100, outY: -100 },
          { ...nodeAt({ x: 100, y: 0 }), inX: -100, inY: -100 }
        ]
      };
    const id = shape(f, 'curve', [c]);
    f.editor.setSelectedShapes([id]);
    const b = curveBounds([c]);
    near(b.h, 75);
    near(b.y, -75);
    assert.equal(splitCadCurveSegment(f.editor, 0, 0), true);
    const n = f.only().props.contours[0].nodes;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100,
        a = cubicAt(cubicPoints(c.nodes[0], c.nodes[1]), t),
        b = cubicAt(t <= 0.5 ? cubicPoints(n[0], n[1]) : cubicPoints(n[1], n[2]), t <= 0.5 ? t * 2 : (t - 0.5) * 2);
      near(a.x, b.x);
      near(a.y, b.y);
    }
    const loop = {
      closed: false,
      nodes: [
        { ...nodeAt({ x: 0, y: 0 }), outX: 100, outY: 0 },
        { ...nodeAt({ x: 1, y: 0 }), inX: -100, inY: 0 }
      ]
    };
    assert.ok(flattenContours([loop], 0.01)[0].length > 5);
  });
  it('edits world units under rotated parents and guards locks', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:parent', type: 'group', x: 200, y: 30, rotation: 0.6, props: {} });
    const id = shape(f, 'c', [rect(0, 0, 100, 50)], { parentId: 'shape:parent', x: 10, y: 20, rotation: 0.3 });
    f.editor.setSelectedShapes([id]);
    const units = { ...settings, unit: 'cm' as const, scale: 10, originX: 5, originY: 8 },
      node = {
        ...getCadCurveSelection(f.editor, units)!.contours[0].nodes[0],
        x: 23,
        y: 17,
        inX: -2,
        inY: 0,
        outX: 2,
        outY: 0,
        mode: 'symmetric' as const
      };
    assert.equal(updateCadCurveNode(f.editor, units, 0, 0, node), true);
    const saved = getCadCurveSelection(f.editor, units)!.contours[0].nodes[0];
    for (const key of ['x', 'y', 'inX', 'inY', 'outX', 'outY'] as const) near(saved[key], node[key]);
    f.editor.updateShape({ id: 'shape:parent', isLocked: true });
    assert.equal(updateCadCurveNode(f.editor, units, 0, 0, { ...node, x: 5 }), false);
  });
  it('mirrors asymmetric compound curves through native resize under rotated groups', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:g', type: 'group', x: 55, y: 41, rotation: 0.37, props: {} });
    const id = shape(
      f,
      'c',
      [
        {
          closed: false,
          nodes: [
            { ...nodeAt({ x: 0, y: 0 }), outX: 40, outY: -90 },
            { ...nodeAt({ x: 120, y: 30 }), inX: -30, inY: 70 }
          ]
        }
      ],
      { parentId: 'shape:g', rotation: 0.51 }
    );
    f.editor.setSelectedShapes([id]);
    const before = shapeCadContours(f.editor, f.only()),
      bounds = f.editor.getShapePageBounds(f.only());
    f.editor.flipShapes([id], 'horizontal');
    const after = shapeCadContours(f.editor, f.only());
    before[0].nodes.forEach((n, i) => {
      near(after[0].nodes[i].x, 2 * bounds.center.x - n.x);
      near(after[0].nodes[i].y, n.y);
      near(after[0].nodes[i].outX, -n.outX);
      near(after[0].nodes[i].outY, n.outY);
    });
  });
  it('draws symmetric handles, finishes a curve and cancels a gesture atomically', () => {
    const f = fixture(),
      tool = new CadBezierTool(f.editor);
    assert.equal(tool.id, 'cad-bezier');
    tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 10, y: 20 };
    tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.currentPagePoint = { x: 30, y: 40 };
    tool.onPointerMove();
    tool.onPointerUp();
    f.editor.inputs.currentPagePoint = { x: 100, y: 20 };
    tool.onPointerDown({ button: 0 } as any);
    tool.onPointerUp();
    tool.onKeyDown({ key: 'Enter' } as any);
    near(f.only().props.contours[0].nodes[0].outX, 20);
    near(f.only().props.contours[0].nodes[0].inY, -20);
    const count = f.shapes.size;
    tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 200, y: 200 };
    tool.onPointerDown({ button: 0 } as any);
    tool.onCancel();
    assert.equal(f.shapes.size, count);
  });
});
describe('CAD region shaping', () => {
  it('welds overlap without XOR, trims explicit targets, intersects and preserves source geometry until apply', () => {
    const f = fixture(),
      a = shape(f, 'a', [rect(0, 0, 100, 100)]),
      b = shape(f, 'b', [rect(50, 0, 100, 100)]);
    f.editor.setSelectedShapes([a, b]);
    const before = cadRevision(f.editor);
    near(area(prepareCadShaping(f.editor, settings, opts).contours), 15000, 0.1);
    near(area(prepareCadShaping(f.editor, settings, { ...opts, operation: 'trim', targetId: a }).contours), 5000, 0.1);
    near(area(prepareCadShaping(f.editor, settings, { ...opts, operation: 'intersect' }).contours), 5000, 0.1);
    assert.equal(cadRevision(f.editor), before);
    const plan = prepareCadShaping(f.editor, settings, { ...opts, keepSources: false });
    assert.equal(applyCadPlan(f.editor, plan), true);
    assert.equal(f.shapes.size, 1);
    f.editor.bailToMark(f.marks[0].id);
    assert.equal(f.shapes.size, 2);
  });
  it('preserves overlapping glyph regions with non-zero winding during offset', () => {
    const f = fixture(),
      id = shape(f, 'glyphs', [rect(0, 0, 100, 100), rect(50, 0, 100, 100)]);
    f.editor.updateShape({ id, props: { fillRule: 'nonzero' } });
    f.editor.setSelectedShapes([id]);
    const plan = prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset', offset: 0.01 });
    assert.equal(plan.contours.length, 1);
    assert.ok(area(plan.contours) > 15000);
    f.editor.createShape({ id: 'shape:group', type: 'group', props: {} });
    f.editor.updateShape({ id, parentId: 'shape:group' });
    f.editor.setSelectedShapes(['shape:group']);
    assert.equal(convertSelectionToCurves(f.editor, settings), true);
    assert.equal(f.only().props.fillRule, 'nonzero');
    const after = prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset', offset: 0.01 });
    assert.equal(after.contours.length, 1);
    near(area(after.contours), area(plan.contours));
  });
  it('retains holes and performs physical positive and negative offsets', () => {
    const f = fixture(),
      id = shape(f, 'letter', [rect(0, 0, 100, 100), rect(30, 30, 40, 40)]);
    f.editor.setSelectedShapes([id]);
    const plus = prepareCadShaping(f.editor, settings, {
      ...opts,
      operation: 'offset',
      offset: cadMmPerPixel(settings) * 5
    });
    assert.equal(plus.contours.length, 2);
    near(area(plus.contours), 11200, 0.2);
    const minus = prepareCadShaping(f.editor, settings, {
      ...opts,
      operation: 'offset',
      offset: -cadMmPerPixel(settings) * 5
    });
    near(area(minus.contours), 5600, 0.2);
    assert.throws(() => prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset', offset: -100 }), /empty/);
  });
  it('refuses open contours, clipped geometry, protected and bound destructive operations, and stale plans', () => {
    const f = fixture(),
      id = shape(f, 'a', [rect(0, 0, 100, 100)]);
    f.editor.setSelectedShapes([id]);
    let plan = prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset' });
    f.editor.updateShape({ id, x: 1 });
    assert.equal(applyCadPlan(f.editor, plan), false);
    plan = prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset', keepSources: false });
    f.state.bindings = [{}];
    assert.equal(applyCadPlan(f.editor, plan), false);
    f.state.bindings = [];
    f.state.isReadonly = true;
    assert.throws(() => prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset' }), /readonly/);
    f.state.isReadonly = false;
    f.editor.updateShape({ id, mask: [] });
    assert.throws(() => prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset' }), /unsupported/);
    f.editor.updateShape({ id, mask: undefined, props: { contours: [{ ...rect(0, 0, 20, 20), closed: false }] } });
    assert.throws(() => prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset' }), /open/);
    f.editor.createShape({ id: 'shape:form', type: 'order-details', props: {} });
    f.editor.setSelectedShapes(['shape:form']);
    assert.equal(convertSelectionToCurves(f.editor, settings), false);
  });
});
describe('Font outlines use real glyphs', () => {
  it('preserves glyph holes and Latvian/Cyrillic outlines, kerning, and exact requested height', async () => {
    const font = await readCadFont(fontBytes());
    assert.ok(glyphRunContours(font, 'O').length >= 2);
    assert.ok(glyphRunContours(font, 'Āķī Привет').length > 5);
    assert.ok(curveBounds(glyphRunContours(font, 'AV')).w < curveBounds(glyphRunContours(font, 'A V')).w);
    const f = fixture(),
      plan = await prepareCadText(f.editor, settings, {
        text: 'BŪVE',
        font: 'custom',
        fontData: fontBytes(),
        height: 40,
        x: 20,
        y: 10,
        keepSource: true
      });
    near(plan.heightMm, 40);
    assert.equal(applyCadPlan(f.editor, plan), true);
    assert.equal(f.only().type, 'cad-bezier');
    const b = curveBounds(plan.contours),
      origin = cadPointToCanvas({ x: 20, y: 10 }, settings);
    near(b.x, origin.x);
    near(b.y + b.h, origin.y);
    const exported = buildCadDxf(f.editor, 'selected', settings),
      parsed = new DxfParser().parseSync(exported.text)!;
    assert.ok(parsed.entities.some((e) => e.type === 'SPLINE'));
    assert.equal(exported.closedContours, plan.contours.length);
    const imported = prepareCadImport(f.editor, settings, exported.text, { keepCoordinates: true });
    assert.equal(imported.omitted.length, 0);
    near(imported.heightMm, 40);
    assert.equal(imported.contours.length, plan.contours.length);
  });
  it('rejects an async text preview after document changes and preserves selected text until apply', async () => {
    const f = fixture(),
      originalFetch = globalThis.fetch;
    f.editor.createShape({
      id: 'shape:text',
      type: 'text',
      x: 100,
      y: 60,
      rotation: 0.4,
      props: { text: 'ABC', font: 'sans', size: 'm', scale: 2, w: 150, textAlign: 'start', color: 'black' }
    });
    f.editor.setSelectedShapes(['shape:text']);
    f.editor.textMeasure = { measureTextSpans: () => [{ text: 'ABC', box: { x: 0, y: 0, w: 50, h: 24 } }] };
    let release!: () => void;
    globalThis.fetch = async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return new Response(fontBytes());
    };
    try {
      const pending = prepareCadText(f.editor, settings, {
        sourceId: 'shape:text',
        text: '',
        font: 'sans',
        height: 20,
        x: 0,
        y: 0,
        keepSource: false
      });
      f.editor.updateShape({ id: 'shape:text', x: 101 });
      release();
      await assert.rejects(() => pending, /stale/);
      assert.equal(f.shapes.size, 1);
      const plan = await prepareCadText(f.editor, settings, {
        sourceId: 'shape:text',
        text: '',
        font: 'sans',
        height: 20,
        x: 0,
        y: 0,
        keepSource: false
      });
      assert.ok(plan.warnings.includes('text-layout-review'));
      assert.equal(f.shapes.size, 1);
      assert.equal(applyCadPlan(f.editor, plan), true);
      assert.equal(f.shapes.has('shape:text'), false);
      assert.equal(f.shapes.size, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it('rejects unsupported glyphs and malformed fonts without replacing sources', async () => {
    const f = fixture(),
      font = await readCadFont(fontBytes());
    assert.throws(() => glyphRunContours(font, '\u{10FFFF}'), /missing-glyph/);
    await assert.rejects(() => readCadFont(new Uint8Array([1, 2, 3]).buffer), /font/);
    await assert.rejects(
      () =>
        prepareCadText(f.editor, settings, {
          text: 'A',
          font: 'custom',
          fontData: fontBytes(),
          height: 0,
          x: 0,
          y: 0,
          keepSource: true
        }),
      /geometry/
    );
    assert.equal(f.shapes.size, 0);
  });
});
describe('CAD DXF interchange', () => {
  it('exports exact cubic SPLINE controls and optional bounded polylines', () => {
    const f = fixture(),
      c = {
        closed: false,
        nodes: [
          { ...nodeAt({ x: 0, y: 0 }), outX: 40, outY: -60 },
          { ...nodeAt({ x: 100, y: 0 }), inX: -40, inY: -60 }
        ]
      };
    const id = shape(f, 'c', [c]);
    f.editor.setSelectedShapes([id]);
    const exact = buildCadDxf(f.editor, 'selected', settings),
      e = new DxfParser().parseSync(exact.text)!.entities[0] as any;
    assert.equal(e.type, 'SPLINE');
    assert.equal(e.controlPoints.length, 4);
    near(e.controlPoints[1].x, 40 * cadMmPerPixel(settings));
    near(e.controlPoints[1].y, 60 * cadMmPerPixel(settings));
    const poly = buildCadDxf(f.editor, 'selected', settings, { curves: 'polyline', toleranceMm: 0.01 });
    const p = new DxfParser().parseSync(poly.text)!.entities[0] as any;
    assert.equal(p.type, 'LWPOLYLINE');
    assert.ok(p.vertices.length > 10);
    const plan = prepareCadImport(f.editor, settings, exact.text, { keepCoordinates: true });
    assert.equal(plan.omitted.length, 0);
    plan.contours[0].nodes.forEach((n, i) => {
      near(n.x, c.nodes[i].x);
      near(n.outX, c.nodes[i].outX);
      near(n.outY, c.nodes[i].outY);
    });
  });
  it('imports physical units with explicit unitless review, and supports relocating without resizing', () => {
    const f = fixture(),
      source = dxf('0\nLINE\n10\n10\n20\n20\n11\n110\n21\n70\n', 0);
    const unknown = prepareCadImport(f.editor, settings, source, { keepCoordinates: true });
    assert.equal(unknown.requiresUnit, true);
    assert.equal(applyCadPlan(f.editor, unknown), false);
    const plan = prepareCadImport(f.editor, settings, source, { unit: 'cm', keepCoordinates: false });
    near(plan.widthMm, 1000);
    near(plan.heightMm, 500);
    near(curveBounds(plan.contours).x, settings.originX);
    near(curveBounds(plan.contours).y + curveBounds(plan.contours).h, settings.originY);
    assert.equal(applyCadPlan(f.editor, plan), true);
    const output = buildCadDxf(f.editor, 'selected', settings);
    near(output.widthMm, 1000);
    near(output.heightMm, 500);
  });
  it('keeps native circles, rotated ellipses and mirrored block arcs analytic', () => {
    const f = fixture(),
      raw = serializeCadDxf([
        { type: 'circle', center: { x: 30, y: 40 }, radius: 10 },
        { type: 'ellipse', center: { x: 80, y: 30 }, major: { x: 20, y: 10 }, ratio: 0.4 },
        { type: 'arc', center: { x: 0, y: 0 }, radius: 15, start: 30, end: 200 }
      ]);
    const plan = prepareCadImport(f.editor, settings, raw.text, { keepCoordinates: true });
    assert.equal(plan.omitted.length, 0);
    assert.deepEqual(
      plan.shapes!.map((s) => s.type),
      ['cad-ellipse', 'cad-ellipse', 'cad-arc']
    );
    assert.equal(applyCadPlan(f.editor, plan), true);
    const output = buildCadDxf(f.editor, 'selected', settings);
    near(output.widthMm, raw.widthMm);
    near(output.heightMm, raw.heightMm);
    near(plan.widthMm, raw.widthMm);
    near(plan.heightMm, raw.heightMm);
    const blocks = '0\nBLOCK\n2\nA\n10\n0\n20\n0\n0\nARC\n10\n0\n20\n0\n40\n10\n50\n0\n51\n90\n0\nENDBLK\n';
    const mirrored = prepareCadImport(
      f.editor,
      settings,
      dxf('0\nINSERT\n2\nA\n10\n100\n20\n50\n41\n-2\n42\n2\n', 4, blocks),
      { keepCoordinates: true }
    );
    assert.equal(mirrored.omitted.length, 0);
    near(mirrored.shapes![0].props.startAngle as number, 90);
    near(mirrored.shapes![0].props.endAngle as number, 180);
  });
  it('imports bulges, old POLYLINE and reports unsupported, non-planar and malformed entities', () => {
    const f = fixture(),
      source = dxf(
        '0\nLWPOLYLINE\n90\n2\n70\n1\n10\n-10\n20\n0\n42\n1\n10\n10\n20\n0\n42\n1\n0\nTEXT\n1\nLetter\n0\nLINE\n10\n0\n20\n0\n30\n8\n11\n20\n21\n20\n'
      );
    const plan = prepareCadImport(f.editor, settings, source, { keepCoordinates: true });
    assert.deepEqual(
      plan.omitted.map((o) => o.type),
      ['TEXT', 'LINE']
    );
    assert.ok(plan.warnings.includes('import-curves-approximated'));
    near(plan.widthMm, 20, 0.002);
    near(plan.heightMm, 20, 0.002);
    assert.ok(plan.contours[0].closed);
    const wide = prepareCadImport(
      f.editor,
      settings,
      dxf('0\nLWPOLYLINE\n90\n2\n10\n0\n20\n0\n40\n0\n10\n10\n20\n0\n40\n3\n'),
      { keepCoordinates: true }
    );
    assert.equal(wide.contours.length, 0);
    assert.equal(wide.omitted[0].reason, 'unsupported');
    const old = prepareCadImport(
      f.editor,
      settings,
      dxf('0\nPOLYLINE\n70\n0\n0\nVERTEX\n10\n0\n20\n0\n0\nVERTEX\n10\n5\n20\n10\n0\nSEQEND\n'),
      { keepCoordinates: true }
    );
    assert.equal(old.omitted.length, 0);
    near(old.widthMm, 5);
    assert.throws(
      () => prepareCadImport(f.editor, settings, 'AutoCAD Binary DXF\0', { keepCoordinates: true }),
      /format/
    );
    const unsupported = prepareCadImport(f.editor, settings, dxf('0\nHATCH\n2\nSOLID\n'), { keepCoordinates: true });
    assert.equal(unsupported.contours.length, 0);
    assert.equal(applyCadPlan(f.editor, unsupported), false);
  });
  it('converts nonuniform clamped quadratic B-splines exactly and rejects rational/periodic input', () => {
    const c = splineContour(
      [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: 20 },
        { x: 30, y: 0 }
      ],
      [0, 0, 0, 1, 2, 2, 2],
      2,
      false
    );
    assert.equal(c.nodes.length, 3);
    near(c.nodes[1].x, 15);
    near(c.nodes[1].y, 20);
    const cubic = splineContour(
      [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: -10 },
        { x: 30, y: 20 },
        { x: 40, y: 0 }
      ],
      [0, 0, 0, 0, 1, 2, 2, 2, 2],
      3,
      false
    );
    near(cubic.nodes[1].x, 20);
    near(cubic.nodes[1].y, 5);
    const left = cubicAt(cubicPoints(c.nodes[0], c.nodes[1]), 0.5);
    near(left.x, 8.75);
    near(left.y, 15);
    assert.throws(
      () =>
        splineContour(
          [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 20, y: 0 }
          ],
          [0, 1, 2, 3, 4, 5],
          2,
          false
        ),
      /unsupported/
    );
    const f = fixture(),
      r = prepareCadImport(f.editor, settings, dxf('0\nSPLINE\n70\n4\n71\n2\n41\n0.5\n'), { keepCoordinates: true });
    assert.equal(r.omitted.length, 1);
  });
});
