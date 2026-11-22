import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { buildCadDxf, serializeCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { CAD_CURVE_NODE_LIMIT, nodeAt, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { cadMmPerPixel } from '../../src/lib/components/canvas/cad-settings';
import { readCadDxf } from '../../src/lib/components/canvas/cad-import';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS as settings } from '../../src/lib/components/canvas/cad-settings';
import { DRAWING_UI_REQUEST, isDrawingUiRequest, routeCanvasCadImport } from '../../src/lib/components/canvas/drawing-ui-requests';

const cubic = {
  a: { x: 10, y: 10 }, b: { x: 10, y: 70 }, c: { x: 110, y: 70 }, d: { x: 110, y: 10 },
};
const curve: CadContour = {
  closed: false, nodes: [{ ...nodeAt(cubic.a), outY: 60 }, { ...nodeAt(cubic.d), inY: 60 }],
};
const rect = (right: number) => ({
  fillRule: 'nonzero' as const,
  contours: [{ closed: true, nodes: [
    { x: 0, y: 0 }, { x: right, y: 0 }, { x: right, y: 70 }, { x: 0, y: 70 },
  ].map(nodeAt) }],
});
function exportEditor(shapes: any[]) {
  const records = new Map(shapes.map(shape => [shape.id, shape]));
  return {
    getCurrentPageShapeIds: () => records.keys(),
    getShape: (id: string) => records.get(id),
    getShapeMask: () => null,
    getShapeGeometry: () => ({ segments: [cubic] }),
    getShapePageTransform: () => ({ applyToPoint: (point: { x: number; y: number }) => point }),
  } as any;
}

describe('CAD interchange regressions', () => {
  it('round-trips a maximum-size closed Bézier contour with exact handles even in explicit projection', () => {
    const nodes = Array.from({ length: CAD_CURVE_NODE_LIMIT }, (_, index) => {
      const angle = index * 2 * Math.PI / CAD_CURVE_NODE_LIMIT;
      return { ...nodeAt({ x: 500 * Math.cos(angle), y: 500 * Math.sin(angle) }),
        inX: Math.sin(angle) / 4, inY: -Math.cos(angle) / 4,
        outX: -Math.sin(angle) / 4, outY: Math.cos(angle) / 4 };
    });
    const { text } = serializeCadDxf([{ type: 'spline', contour: { closed: true, nodes } }]);
    for (const projection of ['strict','xy'] as const) {
      const imported = readCadDxf(settings, text, { keepCoordinates: true, projection });
      assert.deepEqual(imported.omitted, []);
      assert.ok(!imported.warnings.includes('import-curves-approximated'));
      assert.equal(imported.contours.length, 1);
      assert.equal(imported.contours[0].closed, true);
      assert.equal(imported.contours[0].nodes.length, CAD_CURVE_NODE_LIMIT);
      const scale = 1 / cadMmPerPixel(settings);
      imported.contours[0].nodes.forEach((node, i) => {
        for (const axis of ['x','inX','outX','y','inY','outY'] as const) {
          const expected = nodes[i][axis] * scale * (axis.toLowerCase().endsWith('y') ? -1 : 1);
          assert.ok(Math.abs(node[axis] - expected) < 1e-9);
        }
      });
    }
  });
  it('exports native curved lines together with straight lines and reimports the same Bézier handles', () => {
    const spline = { id: 'curved', type: 'line', props: { spline: 'cubic' }, meta: {} };
    const straight = { id: 'straight', type: 'cad-path', props: { points: [cubic.a, cubic.d], closed: false }, meta: {} };
    const editor = exportEditor([spline, straight]);
    const result = buildCadDxf(editor, 'all', settings);
    assert.equal(result.entities, 2);
    assert.deepEqual(result.omitted, []);
    assert.match(result.text, /\nSPLINE\r?\n/);
    assert.match(result.text, /\nLINE\r?\n/);
    const imported = readCadDxf(settings, result.text, { keepCoordinates: true });
    assert.deepEqual(imported.omitted, []);
    assert.equal(imported.shapes?.length, 2);
    assert.ok(imported.shapes?.every(shape => shape.opacity === 1));
    assert.ok(Math.abs(imported.contours[0].nodes[0].outY - 60) < 1e-9);
    assert.ok(Math.abs(imported.contours[0].nodes[1].inY - 60) < 1e-9);
    const compatible = buildCadDxf(editor, 'all', settings, { curves: 'polyline' });
    assert.deepEqual(compatible.omitted, []);
    assert.match(compatible.text, /\nLWPOLYLINE\r?\n/);
  });

  it('retains curves inside a page clip and reports curves whose geometry actually crosses it', () => {
    const shape = (id: string, clip: ReturnType<typeof rect>) => ({
      id, type: 'cad-bezier', props: { contours: [curve] },
      meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, clips: [clip] } },
    });
    const compound = { ...rect(125), contours: [...rect(125).contours, ...rect(85).contours] };
    const editor = exportEditor([shape('inside', rect(125)), shape('crosses', rect(85)), shape('compound', compound)]);
    const result = buildCadDxf(editor, 'all', settings);
    assert.equal(result.entities, 1);
    assert.match(result.text, /\nSPLINE\r?\n/);
    assert.deepEqual(result.omitted.map(({ id, reason }) => [id, reason]), [
      ['crosses', 'clipped'], ['compound', 'clipped'],
    ]);
  });

  it('routes one DXF, EPS or CDR into the matching review without accepting other files or readonly drops', () => {
    const container = new EventTarget();
    const state = { isReadonly: false };
    const editor = { getContainer: () => container, getInstanceState: () => state } as any;
    const received: unknown[] = [];
    container.addEventListener(DRAWING_UI_REQUEST, event => received.push((event as CustomEvent).detail));
    const dxf = new File(['DXF'], 'line.DXF'), eps = new File(['EPS'], 'art.Eps');
    const cdr = new File(['CDR'], 'drawing.CDR');
    assert.equal(routeCanvasCadImport(editor, [dxf]), true);
    assert.equal(routeCanvasCadImport(editor, [eps]), true);
    assert.equal(routeCanvasCadImport(editor, [cdr]), true);
    assert.equal(routeCanvasCadImport(editor, [dxf, eps]), false);
    assert.equal(routeCanvasCadImport(editor, [new File(['PDF'], 'page.pdf')]), false);
    state.isReadonly = true;
    assert.equal(routeCanvasCadImport(editor, [dxf]), false);
    assert.ok(received.every(isDrawingUiRequest));
    assert.deepEqual(received, [
      { kind: 'cad', action: 'importDxf', file: dxf },
      { kind: 'cad', action: 'importVector', file: eps },
      { kind: 'cad', action: 'importVector', file: cdr },
    ]);
  });
});
