import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { buildDxfCommonLines } from '../../src/lib/components/canvas/cad-dxf-common-lines';
import { buildCadDxf, CadDxfError, serializeCadDxf, type DxfEntity } from '../../src/lib/components/canvas/cad-dxf';
import { addProductionLayer, assignProductionLayer, isProductionLayerHidden, isProductionLayerProtected, productionDxfNames, readProductionLayers, selectProductionLayer, updateProductionLayer } from '../../src/lib/components/canvas/cad-production-layers';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { fixture } from '../helpers/cad-editor';

function box(x: number, y: number, w: number, h: number, rgb = '#112233'): DxfEntity {
  return { type: 'polyline', closed: true, rgb,
    points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
}

describe('DXF cut preview', () => {
  it('restores native opacity and manual locks while keeping layer visibility independent of DXF', () => {
    const { editor, shapes, marks } = fixture();
    editor.createShape({ id: 'shape:assembly', type: 'group' });
    const props = { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], closed: false };
    editor.createShape({ id: 'shape:member', type: 'cad-path', parentId: 'shape:assembly', opacity: 0.4, props });
    editor.createShape({ id: 'shape:loose', type: 'cad-path', x: 60, props });
    editor.setSelectedShapes(['shape:member', 'shape:loose']);
    assert.equal(assignProductionLayer(editor, 'cut'), true);
    editor.updateShapes([{ id: 'shape:loose', type: 'cad-path', isLocked: true }]);
    editor.setSelectedShapes(['shape:assembly']);
    const original = buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS, { productionLayers: { only: 'cut' } }).text;
    const mark = marks.length;
    assert.equal(updateProductionLayer(editor, 'cut', { visible: false }), true);
    assert.equal(shapes.get('shape:member').opacity, 0);
    assert.equal(shapes.get('shape:member').isLocked, true);
    assert.ok(isProductionLayerHidden(shapes.get('shape:member')));
    assert.ok(isProductionLayerProtected(shapes.get('shape:assembly')));
    assert.equal(editor.getSelectedShapeIds().length, 0);
    assert.equal(selectProductionLayer(editor, 'cut'), false);
    assert.equal(buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS, { productionLayers: { only: 'cut' } }).text, original);
    editor.bailToMark(marks[mark].id);
    assert.equal(shapes.get('shape:member').opacity, 0.4);
    assert.equal(shapes.get('shape:assembly').isLocked, false);

    assert.equal(updateProductionLayer(editor, 'cut', { visible: false, locked: true }), true);
    assert.equal(updateProductionLayer(editor, 'cut', { visible: true }), true);
    assert.equal(shapes.get('shape:member').opacity, 0.4);
    assert.equal(shapes.get('shape:member').isLocked, true);
    assert.equal(isProductionLayerHidden(shapes.get('shape:member')), false);
    assert.equal(updateProductionLayer(editor, 'cut', { locked: false }), true);
    assert.equal(shapes.get('shape:member').isLocked, false);
    assert.equal(shapes.get('shape:loose').isLocked, true);
    assert.equal(selectProductionLayer(editor, 'cut'), true);
    assert.deepEqual(editor.getSelectedShapeIds(), ['shape:member']);
  });

  it('exports enabled production layers separately and scopes the preview and cut lengths to one layer', () => {
    const { editor, state } = fixture();
    const make = (id: string, x: number) => editor.createShape({ id, type: 'cad-path', x, props: {
      points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }], closed: true,
    } });
    make('shape:left', 0); make('shape:right', 30); make('shape:reference', 60); make('shape:unassigned', 90);
    const baseline = buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS);
    const assign = (shapeId: string, layerId: string) => {
      editor.setSelectedShapes([shapeId]); assert.equal(assignProductionLayer(editor, layerId), true);
    };
    assign('shape:left', 'cut'); assign('shape:right', 'engrave'); assign('shape:reference', 'reference');
    assert.equal(buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS).text, baseline.text);
    const all = buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS, { productionLayers: {}, commonLines: true, includePreview: true });
    assert.equal(all.filteredByLayer, 2);
    assert.equal(all.sharedEdges, 0);
    assert.deepEqual(all.layers.map(layer => layer.name), ['OMS_JOB_CUT', 'OMS_JOB_ENGRAVE']);
    const cut = buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS, { productionLayers: { only: 'cut' }, includePreview: true });
    assert.equal(cut.filteredByLayer, 3);
    assert.equal(cut.entities, 1);
    assert.equal(cut.preview?.layers[0].name, 'OMS_JOB_CUT');
    assert.ok(cut.cutLengths?.byLayer.OMS_JOB_CUT);
    assert.throws(() => buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS, { productionLayers: { only: 'reference' } }), CadDxfError);
    assign('shape:right', 'cut');
    const merged = buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS, { productionLayers: {}, commonLines: true, includePreview: true });
    assert.equal(merged.sharedEdges, 1);
    assert.deepEqual(merged.layers.map(layer => layer.name), ['OMS_JOB_CUT']);
    state.isReadonly = true;
    assert.equal(assignProductionLayer(editor, 'bend'), false);
  });

  it('keeps production layer changes undoable and gives colliding DXF names distinct identifiers', () => {
    const { editor, marks } = fixture();
    assert.equal(addProductionLayer(editor, 'Griešana'), true);
    assert.equal(addProductionLayer(editor, 'Griesana'), true);
    const layers = readProductionLayers(editor);
    const names = productionDxfNames(layers);
    assert.equal(names.get(layers.at(-2)!.id), 'OMS_JOB_GRIESANA');
    assert.equal(names.get(layers.at(-1)!.id), 'OMS_JOB_GRIESANA_2');
    const mark = marks.length;
    assert.equal(updateProductionLayer(editor, 'cut', { name: 'Router', includeInDxf: false }), true);
    assert.equal(readProductionLayers(editor).find(layer => layer.id === 'cut')?.includeInDxf, false);
    editor.bailToMark(marks[mark].id);
    assert.deepEqual(readProductionLayers(editor).find(layer => layer.id === 'cut'), { id: 'cut', name: 'Cut', includeInDxf: true, visible: true, locked: false });
  });

  it('uses the emitted layers and lengths for a partially shared section without changing DXF bytes', () => {
    const parts = [box(0, 0, 30, 40), box(30, 4, 20, 10)];
    const output = buildDxfCommonLines(parts);
    const normal = serializeCadDxf(output.entities, { colorLayers: true });
    const reviewed = serializeCadDxf(output.entities, { colorLayers: true, includePreview: true });
    assert.equal(reviewed.text, normal.text);
    assert.equal(normal.preview, undefined);
    assert.equal(normal.cutLengths, undefined);
    assert.deepEqual(reviewed.layers, normal.layers);
    assert.deepEqual(reviewed.cutLengths, { totalMm: 190, byLayer: { OMS_OPEN_112233: 180, OMS_SHARED_112233: 10 } });
    const preview = reviewed.preview!;
    assert.deepEqual(preview.layers.map(layer => layer.name), reviewed.layers.map(layer => layer.name));
    assert.deepEqual(preview.layers.find(layer => layer.name === 'OMS_SHARED_112233'),
      { name: 'OMS_SHARED_112233', rgb: '#112233', path: 'M30,36 L30,26' });
    assert.ok(preview.layers.find(layer => layer.name === 'OMS_OPEN_112233')?.path.includes('M30,26'));
  });

  it('preserves recorded cubic controls in the preview without flattening the spline', () => {
    const nodes = [nodeAt({ x: 10, y: 20 }), nodeAt({ x: 30, y: 20 })];
    nodes[0].outX = 5; nodes[0].outY = 20;
    nodes[1].inX = -5; nodes[1].inY = 20;
    const { preview, widthMm, heightMm } = serializeCadDxf([
      { type: 'spline', contour: { nodes, closed: false } },
    ], { includePreview: true });
    assert.deepEqual([widthMm, heightMm], [20, 15]);
    assert.equal(preview?.layers[0].path, 'M0,15 C5,-5 15,-5 20,15');
  });

  it('previews circles and rotated ellipses analytically and uses the arc sweep written to DXF', () => {
    const shapes: DxfEntity[] = [
      { type: 'circle', center: { x: 0, y: 0 }, radius: 5, rgb: '#010101' },
      { type: 'ellipse', center: { x: 20, y: 0 }, major: { x: 6, y: 8 }, ratio: 0.5, rgb: '#020202' },
      { type: 'arc', center: { x: 50, y: 0 }, radius: 10, start: 360, end: -90, rgb: '#030303' },
    ];
    const result = serializeCadDxf(shapes, { colorLayers: true, includePreview: true });
    const paths = result.preview!.layers.map(layer => layer.path);
    assert.equal((paths[0].match(/A5,5 /g) ?? []).length, 2);
    assert.match(paths[1], /A10,5 -53\.13/);
    assert.match(paths[2], / A10,10 0 1 0 /);
    assert.doesNotMatch(paths[2], /Z/);
    assert.match(result.text, /\r\n50\r\n0\r\n51\r\n270\r\n/);
    const lengths = result.cutLengths!;
    assert.equal(lengths.byLayer.OMS_CLOSED_010101, 10 * Math.PI);
    assert.ok(Math.abs(lengths.byLayer.OMS_CLOSED_020202! - 48.4422411027) < 0.001);
    assert.ok(Math.abs(lengths.byLayer.OMS_OPEN_030303! - 15 * Math.PI) < 1e-9);
  });

  it('includes the closing segments of splines and polylines exactly once', () => {
    const nodes = [nodeAt({ x: 0, y: 0 }), nodeAt({ x: 10, y: 0 })];
    nodes[0].outY = 10;
    nodes[1].inY = 10;
    nodes.push(nodeAt({ x: 10, y: -4 }), nodeAt({ x: 0, y: -4 }));
    const rectangle = box(0, 0, 3, 4);
    if (rectangle.type !== 'polyline') throw new Error('Expected polyline');
    rectangle.points.push(rectangle.points[0]);
    const { cutLengths } = serializeCadDxf([
      { type: 'spline', contour: { nodes, closed: true } }, rectangle,
    ], { includePreview: true });
    // The cubic is 20 mm, its three straight sides total 18 mm, and the rectangle is 14 mm.
    assert.ok(Math.abs(cutLengths!.totalMm! - 52) < 0.001);
    assert.equal(cutLengths!.byLayer.OMS_CLOSED, cutLengths!.totalMm);
  });

  it('retains the DXF and measurable layers if the curve calculation budget is exhausted', () => {
    const nodes = [nodeAt({ x: 0, y: 0 }), nodeAt({ x: 1_000_000, y: 0 })];
    nodes[0].outY = 1_000_000;
    nodes[1].inY = 1_000_000;
    const curve: DxfEntity = { type: 'spline', contour: { nodes, closed: false } };
    const result = serializeCadDxf([...Array<DxfEntity>(400).fill(curve), box(0, 0, 3, 4)], { includePreview: true });
    assert.deepEqual(result.cutLengths, { totalMm: null, byLayer: { OMS_OPEN: null, OMS_CLOSED: 14 } });
    assert.equal(result.preview?.layers.length, 2);
    assert.match(result.text, /\r\nEOF\r\n$/);
  });

  it('keeps an open single-axis drawing visible and translates distant coordinates to the local preview origin', () => {
    const { preview, widthMm, heightMm } = serializeCadDxf([
      { type: 'polyline', closed: false, points: [{ x: 80_000_000, y: 70_000_000 }, { x: 80_000_000, y: 70_000_001 }] },
    ], { includePreview: true });
    assert.equal(widthMm, 0);
    assert.equal(heightMm, 1);
    assert.equal(preview?.layers[0].path, 'M0,1 L0,0');
    assert.ok(Number(preview?.viewBox.split(' ')[2]) > 0);
  });

  it('reviews and exports 100,000 vertices in the same file and enforces the vertex cap', () => {
    const path = (length: number, y: number): DxfEntity => ({
      type: 'polyline', closed: false, points: Array.from({ length }, (_, x) => ({ x, y })),
    });
    const paths = Array.from({ length: 25 }, (_, y) => path(4000, y));
    const reviewed = serializeCadDxf(paths, { includePreview: true });
    assert.equal(reviewed.text, serializeCadDxf(paths).text);
    assert.match(reviewed.text, /\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n$/);
    assert.equal(reviewed.layers[0].entities, 25);
    assert.deepEqual(reviewed.cutLengths, { totalMm: 99_975, byLayer: { OMS_OPEN: 99_975 } });
    assert.throws(() => serializeCadDxf([...paths.slice(1), path(4001, 0)]), { name: 'CadDxfError', code: 'limit' });
  });

  it('uses the emitted open spline control count when reviewing a page at the vertex cap', () => {
    const { editor } = fixture();
    const makeSpline = (n: number) => {
      const nodes = Array.from({ length: n }, (_, x) => nodeAt({ x, y: 0 }));
      nodes[0].outY = 1;
      return [{ closed: false, nodes }];
    };
    for (let i = 0; i < 9; i++) {
      editor.createShape({ id: `shape:spline-${i}`, type: 'cad-bezier',
        props: { contours: makeSpline(i < 8 ? 4096 : 570), fillRule: 'evenodd', color: 'black' } });
    }
    editor.createShape({ id: 'shape:panel', type: 'cad-path',
      props: { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], closed: true, color: 'black' } });
    editor.createShape({ id: 'shape:circle', type: 'cad-ellipse', props: { w: 10, h: 10, color: 'black' } });
    const result = buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS);
    assert.equal(result.entities, 11);
    assert.equal(result.omitted.length, 0);
    assert.match(result.text, /\r\n0\r\nCIRCLE\r\n/);
    editor.createShape({ id: 'shape:excess', type: 'cad-path',
      props: { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], closed: false, color: 'black' } });
    assert.throws(() => buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS), (error) => error instanceof CadDxfError && error.code === 'limit');
  });

  it('reports the shared-edge comparison limit while preserving ordinary DXF export', () => {
    const { editor } = fixture();
    const count = 1100, step = 0.000008, width = 900_000, height = count * step;
    for (let i = 0; i < count; i++) {
      const top = i * step;
      editor.createShape({
        id: `shape:panel-${i}`, type: 'cad-path',
        props: { points: [{ x: 0, y: top }, { x: width, y: top },
          { x: width, y: top + height }, { x: 0, y: top + height }], closed: true, color: 'black' },
      });
    }
    assert.throws(() => buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS, { commonLines: true }),
      (error) => error instanceof CadDxfError && error.code === 'common-lines-limit');
    assert.equal(buildCadDxf(editor, 'all', DEFAULT_CAD_SETTINGS).entities, count);
  });
});
