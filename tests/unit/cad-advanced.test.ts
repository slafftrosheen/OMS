import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import DxfParser, { type ILwpolylineEntity } from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import {
  DEFAULT_CAD_SETTINGS as settings,
  cadMmPerPixel,
  cadPointToCanvas
} from '../../src/lib/components/canvas/cad-settings';
import {
  arcContour,
  contourSegments,
  cubicAt,
  cubicPoints,
  curveBounds,
  flattenContours,
  nodeAt,
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
  const ellipse = (x: number, y: number, width = 100, height = 100) =>
    arcContour(x, y, width, height, 0, Math.PI * 2, Math.PI / 2);
  const curvedSpans = (contours: CadContour[]) => contours.flatMap(contour => [...contourSegments(contour)]).filter(([a, b, c, d]) =>
    a.x !== b.x || a.y !== b.y || c.x !== d.x || c.y !== d.y
  );

  it('retains Bézier spans of disjoint rings and holes and exports real DXF splines', () => {
    const f = fixture(), outside = ellipse(0, 0), hole = ellipse(0, 0, 40, 40), separate = ellipse(310, -80, 45, 25);
    const a = shape(f, 'ring', [outside, hole]), b = shape(f, 'separate', [separate]);
    f.editor.setSelectedShapes([a, b]);
    const plan = prepareCadShaping(f.editor, settings, { ...opts, keepSources: false });
    assert.ok(plan.warnings.includes('curves-retained'));
    assert.equal(plan.contours.length, 3);
    assert.equal(curvedSpans(plan.contours).length, 12);
    assert.ok(plan.contours.every(contour => contour.nodes.every(node => node.mode === 'smooth')));
    near(area(plan.contours), area([outside]) - area([hole]) + area([separate]), 1e-6);
    assert.equal(applyCadPlan(f.editor, plan), true);
    const entities = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', settings).text)!.entities;
    assert.deepEqual(entities.map(entity => entity.type), ['SPLINE', 'SPLINE', 'SPLINE']);
    assert.ok(entities.every(entity => entity.layer === 'OMS_CLOSED'));
    const polylines = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', settings, { curves: 'polyline' }).text)!.entities;
    assert.deepEqual(polylines.map(entity => entity.type), ['LWPOLYLINE', 'LWPOLYLINE', 'LWPOLYLINE']);
  });

  it('retains complete spans away from cuts during Trim and Intersect and preserves their control points', () => {
    const f = fixture(), circle = ellipse(0, 0), circleId = shape(f, 'circle', [circle]);
    const leftId = shape(f, 'left', [rect(-125, -125, 175, 250)]);
    const rightId = shape(f, 'right', [rect(50, -125, 75, 250)]);
    const scaled = { ...settings, scale: 2, originX: 180, originY: -90 };
    f.editor.setSelectedShapes([circleId, leftId]);
    const intersection = prepareCadShaping(f.editor, scaled, { ...opts, operation: 'intersect' });
    f.editor.setSelectedShapes([circleId, rightId]);
    const trim = prepareCadShaping(f.editor, scaled, { ...opts, operation: 'trim', targetId: circleId });
    const expected = [...contourSegments(circle)].filter(([a, , , b]) => a.x < -50 || b.x < -50);
    for (const plan of [intersection, trim]) {
      assert.ok(plan.warnings.includes('curves-retained'));
      const actual = curvedSpans(plan.contours);
      assert.equal(actual.length, 2);
      for (const [a, b, c, d] of expected) {
        const found = actual.find(([start, , , end]) => Math.hypot(start.x - a.x, start.y - a.y) < .001 &&
          Math.hypot(end.x - d.x, end.y - d.y) < .001);
        const reversed = actual.find(([start, , , end]) => Math.hypot(start.x - d.x, start.y - d.y) < .001 &&
          Math.hypot(end.x - a.x, end.y - a.y) < .001);
        assert.ok(found || reversed);
        const [, first, second] = found ?? [...reversed!].reverse();
        near(first.x, b.x); near(first.y, b.y);
        near(second.x, c.x); near(second.y, c.y);
      }
      const bounds = curveBounds(plan.contours);
      near(bounds.x, -100, .001);
      near(bounds.x + bounds.w, 50, .001);
      assert.ok(plan.contours[0].nodes.length > 4);
    }
    near(area(intersection.contours), area(trim.contours), .2);
  });

  it('keeps tangent contacts and offsets polygonal where curve restoration is uncertain', () => {
    const f = fixture(), a = shape(f, 'first', [ellipse(0, 0)]), b = shape(f, 'second', [ellipse(200, 0)]);
    f.editor.setSelectedShapes([a, b]);
    const weld = prepareCadShaping(f.editor, settings, opts);
    const retained = curvedSpans(weld.contours);
    assert.ok(retained.length > 0 && retained.length < 8);
    for (const [start, , , end] of retained) for (const point of [start, end])
      assert.ok(Math.hypot(point.x - 100, point.y) > 1);
    f.editor.setSelectedShapes([a]);
    const offset = prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset' });
    assert.equal(curvedSpans(offset.contours).length, 0);
    assert.ok(!offset.warnings.includes('curves-retained'));
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
    const beforeConvert = structuredClone([...f.shapes.values()]);
    assert.equal(convertSelectionToCurves(f.editor, settings), true);
    assert.deepEqual([...f.shapes.values()], beforeConvert, 'already-converted group is a true no-op');
    assert.deepEqual(f.editor.getSelectedShapeIds(), ['shape:group']);
    assert.equal(f.editor.getShape(id).props.fillRule, 'nonzero');
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
  it('offsets open straight vectors by an exact signed distance in millimetres', () => {
    const f = fixture();
    const id = shape(f, 'segment', [{ closed: false, nodes: [{ x: 30, y: 100 }, { x: 90, y: 180 }].map(nodeAt) }]);
    f.editor.setSelectedShapes([id]);
    for (const offset of [12, -12]) {
      const plan = prepareCadShaping(f.editor, settings, { ...opts, operation: 'offset', offset });
      assert.equal(plan.contours[0].closed, false);
      const nodes = plan.contours[0].nodes;
      const change = offset / cadMmPerPixel(settings);
      near(nodes[0].x, 30 + .8 * change);
      near(nodes[0].y, 100 - .6 * change);
      near(nodes[1].x - nodes[0].x, 60);
      near(nodes[1].y - nodes[0].y, 80);
      assert.deepEqual(plan.removeIds, []);
    }
  });
  it('pairs opposite open curves and averages their positions and Bézier handles', () => {
    const f = fixture();
    const a = shape(f, 'left', [{ closed: false, nodes: [
      { ...nodeAt({ x: 0, y: 0 }), outX: 20, outY: -30 },
      { ...nodeAt({ x: 120, y: 0 }), inX: -20, inY: -30 }
    ] }]);
    const b = shape(f, 'right', [{ closed: false, nodes: [
      { ...nodeAt({ x: 120, y: 100 }), outX: -10, outY: -10 },
      { ...nodeAt({ x: 0, y: 100 }), inX: 10, inY: -10 }
    ] }]);
    f.editor.setSelectedShapes([a, b]);
    const plan = prepareCadShaping(f.editor, settings, { ...opts, operation: 'midline' });
    const nodes = [...plan.contours[0].nodes].sort((a, b) => a.x - b.x);
    near(nodes[0].y, 50);
    near(nodes[1].y, 50);
    assert.deepEqual([nodes[0].outX, nodes[0].outY, nodes[1].inX, nodes[1].inY], [15, -20, -15, -20]);
    assert.equal(applyCadPlan(f.editor, plan), true);
    assert.ok(f.editor.getShape(a) && f.editor.getShape(b));
    assert.equal(f.only().props.contours[0].closed, false);
  });
  it('joins exact offset segments around open polyline corners and catches collapsed cuts', () => {
    const f = fixture();
    const id = shape(f, 'elbow', [{ closed: false,
      nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }].map(nodeAt) }]);
    f.editor.setSelectedShapes([id]);
    const offset = (pixels: number, join: 'round' | 'miter' | 'square') => prepareCadShaping(f.editor, settings, {
      ...opts, operation: 'offset', offset: pixels * cadMmPerPixel(settings), join
    }).contours[0];
    const points = (contour: CadContour) => contour.nodes.map(node => [node.x, node.y]);
    assert.deepEqual(points(offset(10, 'miter')), [[0, -10], [110, -10], [110, 50]]);
    assert.deepEqual(points(offset(-10, 'round')), [[0, 10], [90, 10], [90, 50]]);
    const square = points(offset(10, 'square'));
    near(square[1][0], 100 + Math.tan(Math.PI / 8) * 10);
    near(square[2][1], -Math.tan(Math.PI / 8) * 10);
    const round = offset(10, 'round');
    const [a, b] = round.nodes.slice(1, 3);
    near(a.x, 100); near(a.y, -10); near(b.x, 110); near(b.y, 0);
    const mid = cubicAt(cubicPoints(a, b), .5);
    near(Math.hypot(mid.x - 100, mid.y), 10);
    assert.throws(() => offset(-60, 'miter'), /offset-collapse/);
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
    f.editor.updateShape({ id, mask: undefined, props: { contours: [{ closed: false, nodes: [
      { ...nodeAt({ x: 0, y: 0 }), outY: 20 }, nodeAt({ x: 20, y: 0 })
    ] }] } });
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
  it('converts clamped and nonclamped polynomial B-splines exactly and reports malformed records', () => {
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
    const unclamped = splineContour(
      [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }],
      [0, 1, 2, 3, 4, 5],
      2,
      false
    );
    assert.equal(unclamped.nodes.length, 2);
    near(unclamped.nodes[0].x, 5);
    near(unclamped.nodes[0].y, 5);
    near(unclamped.nodes[1].x, 15);
    near(unclamped.nodes[1].y, 5);
    const middle = cubicAt(cubicPoints(unclamped.nodes[0], unclamped.nodes[1]), 0.5);
    near(middle.x, 10);
    near(middle.y, 7.5);
    const f = fixture(),
      r = prepareCadImport(f.editor, settings, dxf('0\nSPLINE\n70\n4\n71\n2\n41\n0.5\n'), { keepCoordinates: true });
    assert.equal(r.omitted.length, 1);
  });
});


describe('DXF polygon output for small cutting contours', () => {
  it('refines a tiny two-node hole that would collapse at the chosen polyline tolerance', () => {
    const f = fixture(), factor = cadMmPerPixel(settings);
    const p = (x: number, y: number) => nodeAt({ x: x / factor, y: y / factor });
    const hole = { closed: true, nodes: [
      { ...p(10, 10), inY: -.006 / factor, outY: .006 / factor },
      { ...p(10.008, 10), inY: .006 / factor, outY: -.006 / factor },
    ] };
    const panel = shape(f, 'panel', [rect(0, 0, 100 / factor, 100 / factor), hole]);
    f.editor.setSelectedShapes([panel]);
    const output = buildCadDxf(f.editor, 'selected', settings, { curves: 'polyline', toleranceMm: .01 });
    assert.equal(output.closedContours, 2);
    assert.deepEqual(output.omitted, []);
    near(output.widthMm, 100); near(output.heightMm, 100);
    const entities = new DxfParser().parseSync(output.text)!.entities as ILwpolylineEntity[];
    assert.ok(entities.every(entity => entity.type === 'LWPOLYLINE' && entity.shape));
    assert.ok(entities[1].vertices.length >= 3);
    assert.ok(Math.max(...entities[1].vertices.map(p => p.y)) - Math.min(...entities[1].vertices.map(p => p.y)) > .004);
    const spline = buildCadDxf(f.editor, 'selected', settings);
    assert.equal(new DxfParser().parseSync(spline.text)!.entities[1].type, 'SPLINE');
  });

  it('omits a compound with an invalid hole without losing other selected objects', () => {
    const f = fixture();
    const invalid = shape(f, 'invalid', [rect(0, 0, 100, 100), { closed: true, nodes: [
      { ...nodeAt({ x: 10, y: 10 }), outX: 12, inX: -12 },
      { ...nodeAt({ x: 20, y: 10 }), inX: -12, outX: 12 },
    ] }]);
    const valid = shape(f, 'valid', [rect(120, 0, 200, 200)]);
    f.editor.setSelectedShapes([invalid, valid]);
    const output = buildCadDxf(f.editor, 'selected', settings, { curves: 'polyline' });
    assert.equal(output.closedContours, 1);
    assert.equal(output.omitted.length, 1);
    assert.equal(output.omitted[0].id, invalid);
    assert.equal(output.omitted[0].reason, 'invalid');
    near(output.widthMm, 200 * cadMmPerPixel(settings));
  });

  it('preserves a small closed polyline at a large model coordinate', () => {
    const origin = 90_000_000;
    const output = serializeCadDxf([{ type: 'polyline', closed: true,
      points: rect(origin, origin, .05, .025).nodes }]);
    near(output.widthMm, .05);
    near(output.heightMm, .025);
    const entities = new DxfParser().parseSync(output.text)!.entities;
    assert.equal(entities[0].type, 'LWPOLYLINE');
  });
});
