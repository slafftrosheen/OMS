import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/cad-editor';
import { CAD_HAIRLINE_FALLBACK_MM, VECTOR_DEFAULT_PAINT, validVectorPaint, canvasStrokeWidth, scalePaint } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel, unitLengthToCanvas } from '../../src/lib/components/canvas/cad-settings';
import { newCadOutlinePaint, newCadOutlineMeta, tryNewCadOutlineMeta, prepareOutlineDefaultsPlan, applyOutlineDefaultsPlan, useNativeCadOutlineColor } from '../../src/lib/components/canvas/drawing-outline-defaults';
import { prepareOutlinePlan, applyOutlinePlan, outlinePatchFromInput } from '../../src/lib/components/canvas/drawing-outline';
import { vectorPaint } from '../../src/lib/components/canvas/cad-vector';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { cadPaintHasStroke } from '../../src/lib/components/canvas/cad-shape-appearance';
import { serializeVectorDocument } from '../../src/lib/components/canvas/cad-vector-export';
import { pdfOperatorsToVectors } from '../../src/lib/components/canvas/cad-pdf';
import { createCadGeometry } from '../../src/lib/components/canvas/cad-geometry';
import { registerCanvasDraft } from '../../src/lib/components/canvas/canvas-document';
import { expandOutlineContours } from '../../src/lib/components/canvas/drawing-outline-object';
import { summarizeDrawingSelection } from '../../src/lib/components/canvas/drawing-status';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const contour = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 100, y: 20 }].map(nodeAt) };

describe('hairline outline defaults and production output', () => {
  it('uses an explicit visible hairline only for new artwork, without changing old or imported defaults', () => {
    const f = fixture();
    const legacy = vectorPaint({}, 'black'), before = JSON.stringify(f.editor.getCurrentPage());
    assert.equal(legacy.hairline, undefined); assert.equal(legacy.strokeWidth, 1);
    const fresh = newCadOutlinePaint(f.editor);
    assert.equal(fresh.hairline, true); assert.ok(fresh.strokeWidth > 0);
    near(fresh.strokeWidth * cadMmPerPixel(DEFAULT_CAD_SETTINGS), CAD_HAIRLINE_FALLBACK_MM);
    assert.equal(JSON.stringify(f.editor.getCurrentPage()), before); assert.equal(f.marks.length, 0);
    assert.equal(cadPaintHasStroke(fresh), true);
    assert.equal(cadPaintHasStroke({ ...legacy, strokeWidth: 0 }), false);
    assert.equal(validVectorPaint({ ...fresh, strokeWidth: 0 }), false);
    assert.equal(validVectorPaint({ ...fresh, hairline: 'true' }), false);
  });

  it('only applies the live width floor to painted outlines', () => {
    for (const hidden of [{ stroke: 'none' }, { strokeWidth: 0 }, { strokeOpacity: 0 }]) {
      assert.equal(canvasStrokeWidth({ ...VECTOR_DEFAULT_PAINT, ...hidden }), undefined);
    }
  });

  it('persists only explicit overrides in mm and applies physical widths/dashes at any document scale', () => {
    const f = fixture();
    const settings = { ...DEFAULT_CAD_SETTINGS, unit: 'in' as const, scale: 10 };
    const plan = prepareOutlineDefaultsPlan(f.editor, { strokeWidth: .01, lineCap: 'square', dash: [.04, .02], dashOffset: -.005 }, settings);
    assert.equal(applyOutlineDefaultsPlan(f.editor, plan), true);
    const saved = f.editor.getCurrentPage().meta.omsOutlineDefaults;
    near(saved.outline.strokeWidth, .254); assert.equal(saved.outline.stroke, undefined);
    assert.equal(saved.outline.fill, undefined); assert.equal(saved.outline.hairline, false);
    for (const scale of [.1, 1, 10]) {
      const s = { ...settings, scale }, paint = newCadOutlinePaint(f.editor, s);
      near(paint.strokeWidth * cadMmPerPixel(s), .254);
      near(paint.dash[0] * cadMmPerPixel(s), 1.016);
      near(paint.dashOffset * cadMmPerPixel(s), -.127);
    }
    assert.equal(f.shapes.size, 0); assert.equal(f.marks.length, 2);
    f.editor.bailToMark(f.marks[0].id); assert.equal(f.editor.getCurrentPage().meta.omsOutlineDefaults, undefined);
  });

  it('honours later native palette colour and preserves unrelated custom outline defaults', () => {
    const f = fixture();
    assert.equal(applyOutlineDefaultsPlan(f.editor, prepareOutlineDefaultsPlan(f.editor, { lineJoin: 'bevel', strokeWidth: .2 }, DEFAULT_CAD_SETTINGS)), true);
    f.editor.getStyleForNextShape = () => 'red'; const red = newCadOutlinePaint(f.editor).stroke;
    assert.notEqual(red, '#000000');
    assert.equal(applyOutlineDefaultsPlan(f.editor, prepareOutlineDefaultsPlan(f.editor, { stroke: '#123456' }, DEFAULT_CAD_SETTINGS)), true);
    assert.equal(newCadOutlinePaint(f.editor).stroke, '#123456');
    assert.equal(useNativeCadOutlineColor(f.editor), true);
    assert.equal(newCadOutlinePaint(f.editor).stroke, red);
    assert.equal(newCadOutlinePaint(f.editor).lineJoin, 'bevel');
    near(newCadOutlinePaint(f.editor).strokeWidth, unitLengthToCanvas(.2, DEFAULT_CAD_SETTINGS));
  });
  it('refuses defaults outside the stored paint range after an extreme calibration change', () => {
    const f = fixture(), large = { ...DEFAULT_CAD_SETTINGS, scale: 10000 };
    assert.equal(applyOutlineDefaultsPlan(f.editor, prepareOutlineDefaultsPlan(f.editor, { strokeWidth: 100000 }, large)), true);
    const small = { ...DEFAULT_CAD_SETTINGS, scale: .001 }, before = structuredClone(f.editor.getCurrentPage());
    assert.equal(tryNewCadOutlineMeta(f.editor, small), null);
    assert.throws(() => newCadOutlineMeta(f.editor, small), /limit/);
    assert.deepEqual(f.editor.getCurrentPage(), before); assert.equal(f.shapes.size, 0);
  });

  it('creates exact geometry with saved defaults and preserves its paint after a new default is chosen', () => {
    const f = fixture();
    assert.equal(createCadGeometry(f.editor, { kind: 'rectangle', x: 0, y: 0, width: 20, height: 10 }, DEFAULT_CAD_SETTINGS), true);
    const old = structuredClone(f.only()); assert.equal(old.meta.omsVectorPaint.hairline, true);
    assert.equal(applyOutlineDefaultsPlan(f.editor, prepareOutlineDefaultsPlan(f.editor, { strokeWidth: .7, stroke: '#ff0000' }, DEFAULT_CAD_SETTINGS)), true);
    assert.deepEqual(f.editor.getShape(old.id), old);
    assert.equal(createCadGeometry(f.editor, { kind: 'ellipse', x: 30, y: 0, width: 20, height: 10 }, DEFAULT_CAD_SETTINGS), true);
    assert.equal(f.only().meta.omsVectorPaint.hairline, false);
    near(f.only().meta.omsVectorPaint.strokeWidth, unitLengthToCanvas(.7, DEFAULT_CAD_SETTINGS));
    assert.equal(f.only().meta.omsVectorPaint.stroke, '#ff0000');
  });
  it('summarizes a hairline semantically instead of showing its SVG fallback as the printing width', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:hairline', type: 'cad-path', meta: newCadOutlineMeta(f.editor) });
    const hairline = f.editor.getShape('shape:hairline');
    const summary = summarizeDrawingSelection([hairline], {});
    assert.equal(summary.outlineHairline, true); assert.equal(summary.outlineWidth, null);
    f.editor.createShape({ id: 'shape:numeric', type: 'cad-path', meta: { omsVectorPaint: { ...hairline.meta.omsVectorPaint, hairline: false } } });
    const mixed = summarizeDrawingSelection([hairline, f.editor.getShape('shape:numeric')], {});
    assert.equal(mixed.outlineHairline, undefined); assert.equal(mixed.outlineWidth, null);
  });

  it('sets a real hairline on a zero-width source and clears it when a numeric width is applied', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:line', type: 'cad-path', meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, strokeWidth: 0 } } });
    f.editor.setSelectedShapes(['shape:line']);
    assert.equal(applyOutlinePlan(f.editor, prepareOutlinePlan(f.editor, { hairline: true }, DEFAULT_CAD_SETTINGS)), true);
    assert.equal(f.only().meta.omsVectorPaint.hairline, true); assert.ok(f.only().meta.omsVectorPaint.strokeWidth > 0);
    assert.equal(applyOutlinePlan(f.editor, prepareOutlinePlan(f.editor, { strokeWidth: .35 }, DEFAULT_CAD_SETTINGS)), true);
    assert.equal(f.only().meta.omsVectorPaint.hairline, false);
    near(f.only().meta.omsVectorPaint.strokeWidth, unitLengthToCanvas(.35, DEFAULT_CAD_SETTINGS));
    assert.throws(() => outlinePatchFromInput({ hairline: 'true' } as any, DEFAULT_CAD_SETTINGS));
  });

  it('rejects busy, read-only, stale and refused preference writes without touching artwork or adding undo history', () => {
    for (const mode of ['pointer', 'draft', 'readonly', 'stale', 'refused']) {
      const f = fixture(), plan = prepareOutlineDefaultsPlan(f.editor, { lineCap: 'round' }, DEFAULT_CAD_SETTINGS);
      let stop = () => {};
      if (mode === 'pointer') f.editor.inputs.isPointing = true;
      if (mode === 'draft') stop = registerCanvasDraft(f.editor, () => ({ id: 'shape:draft' as any, props: null }));
      if (mode === 'readonly') f.state.isReadonly = true;
      if (mode === 'stale') f.editor.updatePage({ id: f.editor.getCurrentPageId(), meta: { changed: true } });
      if (mode === 'refused') f.editor.updatePage = () => {};
      const before = structuredClone(f.editor.getCurrentPage());
      assert.equal(applyOutlineDefaultsPlan(f.editor, plan), false, mode);
      assert.deepEqual(f.editor.getCurrentPage(), before); assert.equal(f.marks.length, 0); assert.equal(f.shapes.size, 0);
      stop();
    }
  });

  it('exports true PDF/EPS device hairlines, retains a positive fallback and imports PDF zero-width correctly', () => {
    const f = fixture(), paint = newCadOutlinePaint(f.editor), paths = [{ contours: [contour], fillRule: 'evenodd' as const, paint }];
    assert.match(serializeVectorDocument(paths, 'pdf'), /\n0 w\n/);
    assert.match(serializeVectorDocument(paths, 'eps'), /\n0 setlinewidth\n/);
    assert.equal(scalePaint(paint, 10).hairline, true); near(scalePaint(paint, 10).strokeWidth, paint.strokeWidth * 10);
    assert.throws(() => serializeVectorDocument([{ ...paths[0], paint: { ...VECTOR_DEFAULT_PAINT, strokeWidth: 0 } }], 'pdf'), /geometry/);
    const document = pdfOperatorsToVectors({ fnArray: [1, 2, 4], argsArray: [[0], [[3], [0, 0, 100, 20]], []] },
      { setLineWidth: 1, constructPath: 2, rectangle: 3, stroke: 4 }, { width: 100, height: 50, transform: [1, 0, 0, -1, 0, 50] });
    assert.equal(document.paths[0].paint.hairline, true); assert.ok(document.paths[0].paint.strokeWidth > 0);
    assert.throws(() => expandOutlineContours([contour], paint, cadMmPerPixel(DEFAULT_CAD_SETTINGS), .01), /hairline/);
    assert.equal((newCadOutlineMeta(f.editor).omsVectorPaint as any).hairline, true);
  });
});
